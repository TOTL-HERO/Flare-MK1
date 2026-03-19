import { supabase } from './supabase'
import type { AdGenerationInput, GeneratedAdResult } from '../types/image-pipeline'

export interface AdGenerationCallbacks {
  onPromptGenerated?: (prompt: string) => void
  onImagesGenerating?: () => void
  onComplete?: (result: GeneratedAdResult) => void
  onError?: (error: string) => void
}

export async function generateAd(
  request: AdGenerationInput,
  callbacks?: AdGenerationCallbacks
): Promise<GeneratedAdResult> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: business } = await supabase
    .from('businesses')
    .select('id, name, phone')
    .eq('owner_id', user.id)
    .maybeSingle()

  // Step 1: Claude generates the prompt
  const { data: promptData, error: promptError } = await supabase.functions.invoke('generate-ad-prompt', {
    body: {
      ...request,
      company_name: request.company_name || business?.name,
      phone: request.phone || business?.phone,
    }
  })

  if (promptError) {
    callbacks?.onError?.(`Prompt generation failed: ${promptError.message}`)
    throw promptError
  }

  callbacks?.onPromptGenerated?.(promptData.flux_prompt)

  // Step 2: Create pending record
  const { data: adRecord, error: insertError } = await supabase
    .from('generated_ads')
    .insert({
      user_id: user.id,
      business_id: business?.id,
      vertical: request.vertical,
      angle: request.angle,
      season: request.season,
      flux_prompt: promptData.flux_prompt,
      negative_prompt: promptData.negative_prompt,
      ideogram_text_prompt: promptData.ideogram_text_prompt,
      aspect_ratio: promptData.aspect_ratio,
      status: 'pending',
      metadata: { angle: request.angle, urgency: request.urgency }
    })
    .select()
    .single()

  if (insertError) throw insertError

  callbacks?.onImagesGenerating?.()

  // Step 3: Generate images
  const { data: imageData, error: imageError } = await supabase.functions.invoke('generate-image', {
    body: { generated_ad_id: adRecord.id, prompt_result: promptData, user_id: user.id }
  })

  if (imageError) {
    callbacks?.onError?.(`Image generation failed: ${imageError.message}`)
    throw imageError
  }

  const result: GeneratedAdResult = {
    generated_ad_id: adRecord.id,
    images: imageData.images,
    prompt_used: promptData.flux_prompt,
    cost_cents: 22,
  }

  callbacks?.onComplete?.(result)
  return result
}

export async function submitAdFeedback(
  generated_ad_id: string,
  decision: 'keep' | 'reject' | 'edit',
  options?: { rejection_reason?: string; edit_description?: string }
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: ad } = await supabase
    .from('generated_ads')
    .select('vertical, angle, season, business_id')
    .eq('id', generated_ad_id)
    .single()

  if (!ad) throw new Error('Ad not found')

  await supabase.from('ad_feedback').insert({
    user_id: user.id,
    business_id: ad.business_id,
    generated_ad_id,
    vertical: ad.vertical,
    angle: ad.angle,
    season: ad.season,
    decision,
    rejection_reason: options?.rejection_reason,
    edit_description: options?.edit_description,
  })
}

export async function getAdHistory(filters?: { vertical?: string; limit?: number }) {
  let query = supabase
    .from('generated_ads')
    .select('id, vertical, angle, season, final_image_url, status, created_at, metadata, ad_feedback(decision)')
    .eq('status', 'complete')
    .order('created_at', { ascending: false })
    .limit(filters?.limit || 20)

  if (filters?.vertical) query = query.eq('vertical', filters.vertical)

  const { data, error } = await query
  if (error) throw error
  return data || []
}

export function getCurrentSeason(): 'spring' | 'summer' | 'fall' | 'winter' {
  const m = new Date().getMonth() + 1
  if (m >= 3 && m <= 5) return 'spring'
  if (m >= 6 && m <= 8) return 'summer'
  if (m >= 9 && m <= 11) return 'fall'
  return 'winter'
}
