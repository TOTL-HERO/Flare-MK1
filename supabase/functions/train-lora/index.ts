import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const FAL_KEY = Deno.env.get('FAL_API_KEY')!

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type'
}

const TRIGGER_WORDS: Record<string, string> = {
  plumbing: 'FLARE_PLUMBINGAD',
  hvac: 'FLARE_HVACAD',
  roofing: 'FLARE_ROOFINGAD',
  electrical: 'FLARE_ELECTRICALAD',
  landscaping: 'FLARE_LANDSCAPINGAD'
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  try {
    const { vertical, dataset_url, force = false } = await req.json()

    if (!vertical || !TRIGGER_WORDS[vertical]) {
      return new Response(
        JSON.stringify({ error: `Invalid vertical: ${vertical}` }),
        { status: 400, headers: CORS }
      )
    }

    if (!force) {
      const { data: readiness } = await supabase
        .from('retrain_readiness')
        .select('should_retrain')
        .eq('vertical', vertical)
        .maybeSingle()

      if (!readiness?.should_retrain) {
        return new Response(
          JSON.stringify({ message: `${vertical} does not yet meet retrain threshold`, should_retrain: false }),
          { headers: CORS }
        )
      }
    }

    const { data: current } = await supabase
      .from('lora_versions')
      .select('version')
      .eq('vertical', vertical)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()

    const nextVersion = (current?.version || 0) + 1
    const triggerWord = TRIGGER_WORDS[vertical]

    const { count: imageCount } = await supabase
      .from('training_images')
      .select('*', { count: 'exact', head: true })
      .eq('vertical', vertical)
      .eq('in_training_set', true)

    await supabase
      .from('lora_versions')
      .update({ status: 'deprecated' })
      .eq('vertical', vertical)
      .eq('status', 'active')

    const { data: newLora } = await supabase.from('lora_versions').insert({
      vertical,
      version: nextVersion,
      fal_lora_url: 'pending',
      trigger_word: triggerWord,
      training_image_count: imageCount,
      status: 'training'
    }).select().single()

    const steps = Math.min(Math.max((imageCount || 50) * 20, 500), 2000)

    const falRes = await fetch('https://fal.run/fal-ai/flux-lora-fast-training', {
      method: 'POST',
      headers: { 'Authorization': `Key ${FAL_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        images_data_url: dataset_url,
        trigger_word: triggerWord,
        steps,
        multiresolution_training: true,
        create_masks: true,
        rank: (imageCount || 50) >= 100 ? 32 : 16
      })
    })

    if (!falRes.ok) throw new Error(`FAL training failed: ${await falRes.text()}`)
    const falResult = await falRes.json()

    if (!falResult.diffusers_lora_file?.url) throw new Error('FAL returned no LoRA URL')

    await supabase
      .from('lora_versions')
      .update({ fal_lora_url: falResult.diffusers_lora_file.url, status: 'active' })
      .eq('id', newLora.id)

    return new Response(
      JSON.stringify({
        success: true,
        vertical,
        version: nextVersion,
        lora_url: falResult.diffusers_lora_file.url,
        trigger_word: triggerWord
      }),
      { headers: { 'Content-Type': 'application/json', ...CORS } }
    )
  } catch (error) {
    console.error('train-lora error:', error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: CORS })
  }
})
