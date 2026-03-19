import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.24.0'

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! })

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

const SYSTEM_PROMPT = `
You are Flare's ad creative director. You specialize in high-converting direct response ads for blue-collar home service contractors — plumbers, HVAC techs, roofers, electricians, and landscapers.

Your ONLY job: translate contractor input into precise image generation prompts for FLUX.2 Pro and Ideogram.

VERTICAL VISUAL GRAMMAR:

PLUMBING (trigger: FLARE_PLUMBINGAD)
Core emotion: urgency and relief. Hero: water leak under sink, burst pipe, drain clog, water heater.
Must: branded navy uniform, tool bag open, technician crouching/kneeling, visible water.
Lighting: dramatic under-cabinet or crawlspace, slightly dim, work light effect.
Never: pristine environments, standing posed workers, smiling at camera.

HVAC (trigger: FLARE_HVACAD)
Core emotion: comfort vs discomfort contrast. Hero: homeowner sweating near broken AC, tech adjusting thermostat, furnace work.
Must: branded polo, seasonal environmental cues, unit or thermostat visible.
Lighting: warm golden for comfort, harsh bright for urgency. Match the season.
Never: technical equipment with no human, family posing at camera.

ROOFING (trigger: FLARE_ROOFINGAD)
Core emotion: fear turning to protection. Hero: storm damage with missing shingles, roofer on rooftop, wide exterior shot.
Must: hard hat, safety harness, dramatic sky, wide exterior perspective.
Lighting: overcast storm sky or bright post-storm sunlight.
Never: interior shots, clean perfect roofs with no context.

ELECTRICAL (trigger: FLARE_ELECTRICALAD)
Core emotion: safety and licensed confidence. Hero: panel inspection, outlet work, generator install.
Must: safety glasses, rubber gloves, branded uniform, licensed badge, organized panel wiring.
Lighting: clinical bright interior, clean and precise.
Never: messy wiring, no safety gear, anything DIY-looking.

LANDSCAPING (trigger: FLARE_LANDSCAPINGAD)
Core emotion: pride of ownership and curb appeal transformation. Hero: crew on zero-turn mower with striped lawn, seasonal cleanup, hardscape install, before/after.
Must: branded crew shirts, professional equipment, rich saturated green lawn, golden hour light.
Lighting: golden hour exterior, warm natural daylight.
Never: dead grass (unless before shot), consumer push mower, generic public park.

PROMPT RULES:
1. Always lead the flux_prompt with the trigger word
2. Specify lighting in detail — it's the #1 quality driver
3. End flux_prompt with "No text in image."
4. Keep flux_prompt 80-120 words
5. negative_prompt: 20-40 words of what to avoid
6. ideogram_text_prompt: describes text layout for the overlay pass, not the image

OUTPUT — return ONLY this JSON, no preamble:
{
  "flux_prompt": "string starting with trigger word, 80-120 words",
  "negative_prompt": "string, 20-40 words",
  "ideogram_text_prompt": "string describing text overlay layout",
  "aspect_ratio": "4:5 | 9:16 | 1.91:1 | 1:1",
  "confidence_score": 0.0-1.0,
  "prompt_strategy": "1 sentence explaining the creative direction"
}
`

const SEASONAL_CONTEXT: Record<string, Record<string, string>> = {
  plumbing: {
    spring: 'spring thaw pipe damage, outdoor faucet activation, sump pump season',
    summer: 'AC condensation line clogs, outdoor irrigation, water heater efficiency',
    fall: 'pipe winterization, drain cleaning before holiday guests',
    winter: 'frozen pipe emergencies, burst pipes, no-hot-water urgency'
  },
  hvac: {
    spring: 'AC tune-up season, pre-summer system check',
    summer: 'AC breakdown emergency, heat wave urgency, cooling failure',
    fall: 'furnace tune-up, heating system inspection, pre-winter prep',
    winter: 'furnace failure emergency, no heat urgency'
  },
  roofing: {
    spring: 'winter damage inspection, storm prep season',
    summer: 'storm and hail season, high-wind damage, peak insurance claims',
    fall: 'pre-winter inspection, leaf and debris damage',
    winter: 'ice dams, snow load damage, emergency tarping'
  },
  electrical: {
    spring: 'outdoor electrical activation, generator service',
    summer: 'AC load tripping breakers, outdoor outlets, pool electrical',
    fall: 'panel upgrades before winter, holiday lighting prep',
    winter: 'holiday lighting overload, space heater fire risk, generator demand'
  },
  landscaping: {
    spring: 'spring cleanup, mulch and bed refresh, first mow of season',
    summer: 'weekly mowing, irrigation management, weed control',
    fall: 'leaf cleanup, aeration and overseeding, winterization',
    winter: 'snow removal contracts, holiday lighting, hardscape planning'
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  try {
    const input = await req.json()
    const {
      vertical, angle, season, urgency, headline, subheadline,
      cta, phone, company_name, service_area, offer_text, aspect_ratio
    } = input

    if (!vertical || !angle || !season || !headline || !cta || !phone) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: vertical, angle, season, headline, cta, phone' }),
        { status: 400, headers: CORS }
      )
    }

    const seasonalContext = SEASONAL_CONTEXT[vertical]?.[season] || `${season} ${vertical} services`

    for (let attempt = 0; attempt < 3; attempt++) {
      const retryNote = attempt > 0
        ? `\n\nPREVIOUS ATTEMPT HAD LOW CONFIDENCE. Be more specific about ${vertical} visual elements.`
        : ''

      const userMessage = `Generate an ad image prompt for:
Vertical: ${vertical}
Ad angle: ${angle}
Season: ${season} — context: ${seasonalContext}
Urgency: ${urgency || 'medium'}
Headline: "${headline}"${subheadline ? `\nSubheadline: "${subheadline}"` : ''}
CTA: "${cta}"
Phone: ${phone}
Company: ${company_name || 'local contractor'}
Service area: ${service_area || 'local area'}${offer_text ? `\nSpecial offer: "${offer_text}"` : ''}${aspect_ratio ? `\nPreferred format: ${aspect_ratio}` : ''}
The image must drive phone calls from homeowners who need ${vertical} service.${retryNote}`

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }]
      })

      const text = response.content[0].type === 'text' ? response.content[0].text : ''

      try {
        const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
        if (parsed.confidence_score >= 0.75 || attempt === 2) {
          return new Response(
            JSON.stringify({
              ...parsed,
              attempt: attempt + 1,
              input_echo: { vertical, angle, season }
            }),
            { headers: { 'Content-Type': 'application/json', ...CORS } }
          )
        }
      } catch {
        if (attempt === 2) throw new Error('Failed to parse Claude response after 3 attempts')
      }
    }
  } catch (error) {
    console.error('generate-ad-prompt error:', error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: CORS })
  }
})
