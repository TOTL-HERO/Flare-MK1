import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const FAL_KEY = Deno.env.get('FAL_API_KEY')!
const IDEOGRAM_KEY = Deno.env.get('IDEOGRAM_API_KEY')!

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

const IMAGE_SIZES: Record<string, { width: number; height: number }> = {
  '4:5':    { width: 1080, height: 1350 },
  '9:16':   { width: 1080, height: 1920 },
  '1.91:1': { width: 1200, height: 628 },
  '1:1':    { width: 1080, height: 1080 },
}

const IDEOGRAM_ASPECT: Record<string, string> = {
  '4:5': 'ASPECT_4_5', '9:16': 'ASPECT_9_16',
  '1.91:1': 'ASPECT_16_9', '1:1': 'ASPECT_1_1',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  try {
    const { generated_ad_id, prompt_result, user_id } = await req.json()

    if (!generated_ad_id || !prompt_result) {
      return new Response(
        JSON.stringify({ error: 'Missing generated_ad_id or prompt_result' }),
        { status: 400, headers: CORS }
      )
    }

    await supabase.from('generated_ads').update({ status: 'generating' }).eq('id', generated_ad_id)

    // Get active LoRA for this vertical if one exists
    const { data: loraData } = await supabase
      .from('lora_versions')
      .select('fal_lora_url, trigger_word')
      .eq('status', 'active')
      .eq('vertical', prompt_result.input_echo?.vertical)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Generate 3 base images with FLUX.2 Pro
    const fluxBody: Record<string, unknown> = {
      prompt: prompt_result.flux_prompt,
      negative_prompt: prompt_result.negative_prompt,
      num_inference_steps: 28,
      guidance_scale: 3.5,
      image_size: IMAGE_SIZES[prompt_result.aspect_ratio] || IMAGE_SIZES['4:5'],
      num_images: 3,
      enable_safety_checker: true,
      output_format: 'jpeg',
    }

    if (loraData?.fal_lora_url) {
      fluxBody.loras = [{ path: loraData.fal_lora_url, scale: 0.85 }]
    }

    const fluxRes = await fetch('https://fal.run/fal-ai/flux-lora', {
      method: 'POST',
      headers: { 'Authorization': `Key ${FAL_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(fluxBody)
    })

    if (!fluxRes.ok) throw new Error(`FLUX failed: ${await fluxRes.text()}`)
    const { images: fluxImages } = await fluxRes.json()

    // Add text overlay with Ideogram on each image
    const finalUrls = await Promise.all(fluxImages.map(async (img: { url: string }) => {
      try {
        const ideogramRes = await fetch('https://api.ideogram.ai/generate', {
          method: 'POST',
          headers: { 'Api-Key': IDEOGRAM_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_request: {
              prompt: prompt_result.ideogram_text_prompt,
              aspect_ratio: IDEOGRAM_ASPECT[prompt_result.aspect_ratio] || 'ASPECT_4_5',
              model: 'V_2_TURBO',
              rendering_quality: 'QUALITY',
              magic_prompt_option: 'OFF',
              image_weight: 90,
              image_input: { url: img.url }
            }
          })
        })
        if (!ideogramRes.ok) return img.url // Fallback to base image
        const { data } = await ideogramRes.json()
        return data[0].url
      } catch {
        return img.url // Fallback — non-fatal
      }
    }))

    // Upload final images to Supabase Storage
    const storedUrls = await Promise.all(
      finalUrls.map(async (imgUrl: string, idx: number) => {
        const path = `${user_id}/${generated_ad_id}/variant_${idx + 1}.jpg`
        const buf = new Uint8Array(await (await fetch(imgUrl)).arrayBuffer())
        await supabase.storage.from('generated-ads').upload(path, buf, { contentType: 'image/jpeg', upsert: true })
        return supabase.storage.from('generated-ads').getPublicUrl(path).data.publicUrl
      })
    )

    await supabase.from('generated_ads').update({
      status: 'complete',
      base_image_url: fluxImages[0]?.url,
      final_image_url: storedUrls[0],
      metadata: {
        all_variants: storedUrls,
        lora_used: loraData?.fal_lora_url || 'base_model',
        variant_count: storedUrls.length
      }
    }).eq('id', generated_ad_id)

    return new Response(
      JSON.stringify({ success: true, images: storedUrls, generated_ad_id }),
      { headers: { 'Content-Type': 'application/json', ...CORS } }
    )
  } catch (error) {
    console.error('generate-image error:', error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: CORS })
  }
})
