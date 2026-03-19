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

// Aspect ratio → FLUX Pro Ultra aspect_ratio string
const FLUX_ASPECT: Record<string, string> = {
  '4:5':    '4:5',
  '9:16':   '9:16',
  '1.91:1': '16:9',
  '1:1':    '1:1',
}

// Aspect ratio → Ideogram resolution enum (valid values from Ideogram API)
const IDEOGRAM_RESOLUTION: Record<string, string> = {
  '4:5':    'RESOLUTION_896_1088',   // closest valid to 4:5
  '9:16':   'RESOLUTION_768_1344',
  '1.91:1': 'RESOLUTION_1344_768',
  '1:1':    'RESOLUTION_1024_1024',
}

// Aspect ratio → pixel dimensions for fallback FLUX standard
const IMAGE_SIZES: Record<string, { width: number; height: number }> = {
  '4:5':    { width: 1080, height: 1350 },
  '9:16':   { width: 1080, height: 1920 },
  '1.91:1': { width: 1200, height: 628 },
  '1:1':    { width: 1080, height: 1080 },
}

async function validateImageUrl(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD' })
    return res.ok
  } catch {
    return false
  }
}

async function generateFluxUltra(
  prompt: string,
  negative_prompt: string,
  aspect_ratio: string,
  lora?: { url: string; scale: number }
): Promise<string[]> {
  // If LoRA is present, must use flux-lora endpoint (Ultra doesn't support LoRAs)
  if (lora) {
    const body = {
      prompt,
      negative_prompt,
      num_inference_steps: 28,
      guidance_scale: 3.5,
      image_size: IMAGE_SIZES[aspect_ratio] || IMAGE_SIZES['4:5'],
      num_images: 1,
      enable_safety_checker: false,
      output_format: 'jpeg',
      loras: [{ path: lora.url, scale: lora.scale }],
    }
    const res = await fetch('https://fal.run/fal-ai/flux-lora', {
      method: 'POST',
      headers: { 'Authorization': `Key ${FAL_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`FLUX LoRA failed: ${await res.text()}`)
    const { images } = await res.json()
    return images.map((img: { url: string }) => img.url)
  }

  // FLUX Pro Ultra — highest quality photorealism
  const body = {
    prompt,
    num_images: 1,
    safety_tolerance: '5',
    output_format: 'jpeg',
    output_quality: 95,
    aspect_ratio: FLUX_ASPECT[aspect_ratio] || '4:5',
  }
  const res = await fetch('https://fal.run/fal-ai/flux-pro/v1.1-ultra', {
    method: 'POST',
    headers: { 'Authorization': `Key ${FAL_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`FLUX Pro Ultra failed: ${await res.text()}`)
  const { images } = await res.json()
  return images.map((img: { url: string }) => img.url)
}

async function generateFluxStandard(
  prompt: string,
  negative_prompt: string,
  aspect_ratio: string
): Promise<string[]> {
  const body = {
    prompt,
    negative_prompt,
    num_inference_steps: 28,
    guidance_scale: 3.5,
    image_size: IMAGE_SIZES[aspect_ratio] || IMAGE_SIZES['4:5'],
    num_images: 1,
    enable_safety_checker: false,
    output_format: 'jpeg',
  }
  const res = await fetch('https://fal.run/fal-ai/flux/dev', {
    method: 'POST',
    headers: { 'Authorization': `Key ${FAL_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`FLUX standard failed: ${await res.text()}`)
  const { images } = await res.json()
  return images.map((img: { url: string }) => img.url)
}

async function generateIdeogram(
  prompt: string,
  aspect_ratio: string,
  source_image_url?: string,
  brand_colors?: string
): Promise<string[]> {
  // Custom color palettes use { members } only — no name field
  const colorPalette = brand_colors
    ? { members: parseBrandColors(brand_colors) }
    : undefined

  const imageRequest: Record<string, unknown> = {
    prompt,
    model: 'V_2',
    resolution: IDEOGRAM_RESOLUTION[aspect_ratio] || 'RESOLUTION_1344_768',
    style_type: 'REALISTIC',
    magic_prompt_option: 'ON',
    rendering_quality: 'QUALITY',
    ...(colorPalette && { color_palette: colorPalette }),
  }

  // Image-to-image (overlay pass) uses /remix endpoint, not /generate
  if (source_image_url) {
    const res = await fetch('https://api.ideogram.ai/remix', {
      method: 'POST',
      headers: { 'Api-Key': IDEOGRAM_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_request: imageRequest,
        image_weight: 85,
        image_url: source_image_url,
      }),
    })
    if (!res.ok) throw new Error(`Ideogram remix failed: ${await res.text()}`)
    const { data } = await res.json()
    return (data as { url: string }[]).map((d) => d.url)
  }

  const res = await fetch('https://api.ideogram.ai/generate', {
    method: 'POST',
    headers: { 'Api-Key': IDEOGRAM_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_request: imageRequest }),
  })
  if (!res.ok) throw new Error(`Ideogram generate failed: ${await res.text()}`)
  const { data } = await res.json()
  return (data as { url: string }[]).map((d) => d.url)
}

// Parse "navy blue, white, orange" → Ideogram color member format
function parseBrandColors(colors: string): { color: { r: number; g: number; b: number } }[] {
  const NAMED: Record<string, [number, number, number]> = {
    'navy': [0, 31, 63], 'navy blue': [0, 31, 63],
    'white': [255, 255, 255], 'black': [0, 0, 0],
    'red': [220, 20, 60], 'orange': [255, 127, 0],
    'yellow': [255, 215, 0], 'green': [34, 139, 34],
    'blue': [30, 144, 255], 'gray': [128, 128, 128],
    'grey': [128, 128, 128],
  }
  return colors.split(',').slice(0, 3).map((c) => {
    const key = c.trim().toLowerCase()
    const [r, g, b] = NAMED[key] || [128, 128, 128]
    return { color: { r, g, b } }
  })
}

async function uploadToStorage(
  imageUrl: string,
  path: string
): Promise<string> {
  const buf = new Uint8Array(await (await fetch(imageUrl)).arrayBuffer())
  await supabase.storage.from('generated-ads').upload(path, buf, {
    contentType: 'image/jpeg',
    upsert: true,
  })
  return supabase.storage.from('generated-ads').getPublicUrl(path).data.publicUrl
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  let generated_ad_id: string | undefined

  try {
    const body = await req.json()
    generated_ad_id = body.generated_ad_id
    const { prompt_result, user_id } = body

    if (!generated_ad_id || !prompt_result) {
      return new Response(
        JSON.stringify({ error: 'Missing generated_ad_id or prompt_result' }),
        { status: 400, headers: CORS }
      )
    }

    await supabase.from('generated_ads')
      .update({ status: 'generating', error_message: null })
      .eq('id', generated_ad_id)

    const {
      flux_prompt,
      negative_prompt,
      ideogram_text_prompt,
      aspect_ratio = '4:5',
      generation_route = 'flux_then_ideogram',
    } = prompt_result

    const vertical = prompt_result.input_echo?.vertical
    const brand_colors = prompt_result.input_echo?.brand_colors

    // Look up active LoRA for this vertical
    const { data: loraData } = await supabase
      .from('lora_versions')
      .select('fal_lora_url, trigger_word')
      .eq('status', 'active')
      .eq('vertical', vertical)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()

    const lora = loraData?.fal_lora_url
      ? { url: loraData.fal_lora_url, scale: 0.85 }
      : undefined

    let baseImageUrl: string | null = null
    let finalImageUrl: string | null = null
    let generationErrors: string[] = []

    // ── ROUTE: FLUX only ────────────────────────────────────────
    if (generation_route === 'flux') {
      try {
        const urls = await generateFluxUltra(flux_prompt, negative_prompt, aspect_ratio, lora)
        baseImageUrl = urls[0]
        finalImageUrl = urls[0]
      } catch (err) {
        generationErrors.push(`FLUX Ultra: ${err.message}`)
        // Fallback: FLUX standard
        try {
          const urls = await generateFluxStandard(flux_prompt, negative_prompt, aspect_ratio)
          baseImageUrl = urls[0]
          finalImageUrl = urls[0]
        } catch (err2) {
          generationErrors.push(`FLUX standard: ${err2.message}`)
          // Final fallback: Ideogram
          const urls = await generateIdeogram(ideogram_text_prompt || flux_prompt, aspect_ratio, undefined, brand_colors)
          finalImageUrl = urls[0]
        }
      }
    }

    // ── ROUTE: Ideogram only ─────────────────────────────────────
    else if (generation_route === 'ideogram') {
      try {
        const urls = await generateIdeogram(ideogram_text_prompt, aspect_ratio, undefined, brand_colors)
        finalImageUrl = urls[0]
      } catch (err) {
        generationErrors.push(`Ideogram: ${err.message}`)
        // Fallback: FLUX
        const urls = await generateFluxUltra(flux_prompt, negative_prompt, aspect_ratio, lora)
        finalImageUrl = urls[0]
      }
    }

    // ── ROUTE: FLUX → Ideogram overlay (most common) ─────────────
    else {
      // Step 1: Generate photorealistic base with FLUX
      try {
        const fluxUrls = await generateFluxUltra(flux_prompt, negative_prompt, aspect_ratio, lora)
        baseImageUrl = fluxUrls[0]
      } catch (err) {
        generationErrors.push(`FLUX Ultra: ${err.message}`)
        try {
          const fluxUrls = await generateFluxStandard(flux_prompt, negative_prompt, aspect_ratio)
          baseImageUrl = fluxUrls[0]
        } catch (err2) {
          generationErrors.push(`FLUX standard: ${err2.message}`)
        }
      }

      // Step 2: Ideogram text overlay pass
      if (baseImageUrl) {
        try {
          const ideogramUrls = await generateIdeogram(
            ideogram_text_prompt,
            aspect_ratio,
            baseImageUrl,
            brand_colors
          )
          finalImageUrl = ideogramUrls[0]
        } catch (err) {
          generationErrors.push(`Ideogram overlay: ${err.message}`)
          finalImageUrl = baseImageUrl // Fallback: use base image without text
        }
      } else {
        // FLUX totally failed — try Ideogram standalone
        try {
          const ideogramUrls = await generateIdeogram(ideogram_text_prompt, aspect_ratio, undefined, brand_colors)
          finalImageUrl = ideogramUrls[0]
        } catch (err) {
          generationErrors.push(`Ideogram standalone: ${err.message}`)
          throw new Error(`All generation attempts failed: ${generationErrors.join('; ')}`)
        }
      }
    }

    // Validate final image URL
    const isValid = finalImageUrl ? await validateImageUrl(finalImageUrl) : false
    if (!isValid) {
      generationErrors.push('Final image URL validation failed — URL returned non-200')
    }

    // Upload to Supabase Storage
    const storedFinalUrl = finalImageUrl
      ? await uploadToStorage(finalImageUrl, `${user_id}/${generated_ad_id}/final.jpg`)
      : null

    const storedBaseUrl = baseImageUrl && baseImageUrl !== finalImageUrl
      ? await uploadToStorage(baseImageUrl, `${user_id}/${generated_ad_id}/base.jpg`)
      : null

    await supabase.from('generated_ads').update({
      status: storedFinalUrl ? 'complete' : 'error',
      base_image_url: storedBaseUrl || baseImageUrl,
      final_image_url: storedFinalUrl,
      error_message: generationErrors.length > 0 ? generationErrors.join(' | ') : null,
      metadata: {
        generation_route,
        lora_used: loraData?.fal_lora_url || 'base_model',
        aspect_ratio,
        validation_passed: isValid,
        errors: generationErrors.length > 0 ? generationErrors : undefined,
      }
    }).eq('id', generated_ad_id)

    return new Response(
      JSON.stringify({
        success: !!storedFinalUrl,
        final_image_url: storedFinalUrl,
        base_image_url: storedBaseUrl || baseImageUrl,
        generated_ad_id,
        generation_route,
        warnings: generationErrors.length > 0 ? generationErrors : undefined,
      }),
      { headers: { 'Content-Type': 'application/json', ...CORS } }
    )
  } catch (error) {
    console.error('generate-image error:', error)

    // generated_ad_id is captured at outer scope, safe to use here
    if (generated_ad_id) {
      await supabase.from('generated_ads').update({
        status: 'error',
        error_message: error.message,
      }).eq('id', generated_ad_id).catch(() => { /* best-effort */ })
    }

    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: CORS })
  }
})
