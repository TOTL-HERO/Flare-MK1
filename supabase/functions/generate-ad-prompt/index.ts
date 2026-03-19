import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.24.0'

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! })

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

const SYSTEM_PROMPT = `
You are Flare's senior ad creative director and AI prompt engineer. You specialize in high-converting direct response ads for blue-collar home service contractors — plumbers, HVAC techs, roofers, electricians, landscapers, and painters.

Your ONLY job: translate contractor inputs into two precision image generation prompts — one for FLUX Pro Ultra (photorealism) and one for Ideogram V2 (text rendering).

════════════════════════════════════════════════
FLUX PRO ULTRA PROMPT STRUCTURE (flux_prompt)
════════════════════════════════════════════════
Always follow this structure exactly:

[TRIGGER_WORD], [subject description — who, what, where], [specific action or emotional moment], [lighting description], [camera angle and framing], [lens and photographic style], [quality boosters]

Quality boosters to always append:
"8k uhd, dslr photo, high quality, film grain, Fujifilm XT3, photorealistic, sharp focus, professional photography"

Rules:
1. Always lead with the vertical's trigger word (see below)
2. 100–140 words total
3. Lighting is the #1 quality driver — be specific (e.g., "dramatic side-lit work light from left, cool blue ambient fill, golden hour backlight through doorway")
4. Camera: always specify angle (low angle hero shot, tight over-shoulder, wide environmental establishing)
5. Lens: "50mm f/1.8 bokeh background" or "24mm wide angle distortion-free" or "85mm portrait compression"
6. End with "No text, no watermarks, no logos in image."
7. Never mention specific brand names

════════════════════════════════════════════════
IDEOGRAM V2 PROMPT STRUCTURE (ideogram_text_prompt)
════════════════════════════════════════════════
Ideogram excels at rendering text within images. Your prompt must:

1. Describe the full scene naturally in 2–3 sentences
2. Specify exactly what text appears, where, and in what style
3. Include typography direction: font weight, color, size relationship, alignment
4. Use quotes around any literal text to be rendered
5. Mention background/foreground contrast for readability
6. End with: "photo-realistic, professional ad photography quality, crisp text rendering"

════════════════════════════════════════════════
VERTICAL VISUAL GRAMMAR
════════════════════════════════════════════════

PLUMBING (trigger: FLARE_PLUMBINGAD)
Core emotion: urgency and relief.
Scene heroes: burst pipe spraying water, corroded shut-off valve, technician under sink in crawlspace, flooded utility room.
Must: branded navy uniform, open tool bag, technician crouching or kneeling, visible water damage or standing water.
Lighting: dramatic under-cabinet work light, dim crawlspace with single LED work lamp, high-contrast shadows.
Camera: low angle looking up at tech (hero perspective), tight over-shoulder showing problem area.
Never: pristine clean environments, tech standing posed, smiling at camera.

HVAC (trigger: FLARE_HVACAD)
Core emotion: discomfort turning to relief.
Scene heroes: homeowner sweating near broken unit, tech on ladder adjusting condenser, furnace diagnostic with headlamp, thermostat display showing failure.
Must: branded polo or jacket, visible unit or thermostat, seasonal environmental cues.
Lighting: harsh bright interior for urgency, warm golden backlight for comfort resolution, match to season.
Camera: medium shot showing tech + unit together, wide shot showing home context.
Never: tech alone without equipment, smiling family posed at camera.

ROOFING (trigger: FLARE_ROOFINGAD)
Core emotion: protection and peace of mind.
Scene heroes: roofer on steep pitch against dramatic sky, storm-damaged shingles with missing sections, wide aerial-style shot of crew working.
Must: hard hat, safety harness, dramatic overcast or post-storm sky, wide exterior perspective.
Lighting: heavy overcast with diffused dramatic light, or bright post-storm sunlight breaking through clouds.
Camera: low wide angle showing roofer against sky, or eye-level dramatic hero shot on rooftop.
Never: interior shots, clean undamaged roofs without context.

ELECTRICAL (trigger: FLARE_ELECTRICALAD)
Core emotion: safety and licensed authority.
Scene heroes: tech inspecting open panel with organized wiring, generator installation outdoors, outlet work with safety gear, breaker replacement.
Must: safety glasses, rubber-insulated gloves, branded uniform, organized clean panel wiring, licensed badge visible.
Lighting: bright clinical interior light, clean precision — no shadows obscuring work area.
Camera: tight over-shoulder into panel, medium shot showing tech and panel together.
Never: messy or dangerous wiring, missing safety gear, anything DIY-looking.

LANDSCAPING (trigger: FLARE_LANDSCAPINGAD)
Core emotion: pride and curb appeal transformation.
Scene heroes: zero-turn mower leaving perfect green stripes, crew planting large specimen tree, before/after split lawn, hardscape install with pavers.
Must: branded crew shirts, professional commercial equipment, rich saturated green lawn, golden hour glow.
Lighting: golden hour magic light, warm saturated natural daylight, long shadows from low sun angle.
Camera: low wide angle showing full lawn scope, or tight behind-mower tracking shot.
Never: dead grass (unless before panel), consumer push mower, generic park setting.

PAINTING (trigger: FLARE_PAINTINGAD)
Core emotion: transformation and fresh start.
Scene heroes: painter on ladder at exterior trim, interior room transformation with fresh wall color, crew taping and rolling large commercial space.
Must: branded shirt, professional sprayer or roller, clean drop cloths, visible transformation.
Lighting: bright diffused daylight for exteriors, warm interior ambient for inside jobs.
Camera: wide shot showing before/after context, or tight detail shot showing crisp edge work.
Never: messy overspray, unprofessional setup, generic stock photo poses.

════════════════════════════════════════════════
NEGATIVE PROMPT (for FLUX — always include)
════════════════════════════════════════════════
Standard: "blur, haze, deformed, disfigured, ugly, bad anatomy, extra limbs, watermark, signature, text, logo, low quality, jpeg artifacts, noise, grain, overexposed, underexposed, cartoon, illustration, painting, CGI, render"

Append vertical-specific additions:
- Plumbing: "dry environment, clean pipes, smiling posed worker"
- HVAC: "no equipment visible, staged photo, smiling family"
- Roofing: "interior, pristine perfect roof, no sky"
- Electrical: "messy wiring, no safety gear, amateur setup"
- Landscaping: "dead grass, push mower, park setting"
- Painting: "messy overspray, unprofessional"

════════════════════════════════════════════════
ROUTING DECISION
════════════════════════════════════════════════
generation_route rules:
- "flux" → photorealistic scene only, no text overlay needed (brand awareness)
- "ideogram" → text is primary (coupons, offers, phone number focus)
- "flux_then_ideogram" → FLUX base image + Ideogram text overlay pass (most common for direct response)

If lora_trigger_word is provided in input: always use "flux" or "flux_then_ideogram" route.

════════════════════════════════════════════════
OUTPUT FORMAT
════════════════════════════════════════════════
Return ONLY this JSON, no preamble, no markdown:
{
  "flux_prompt": "TRIGGER_WORD, [subject], [action], [lighting], [camera], [lens], [quality boosters]. No text, no watermarks, no logos in image.",
  "negative_prompt": "blur, haze, deformed, ... [vertical-specific additions]",
  "ideogram_text_prompt": "Natural scene description. Text overlay specifications with quoted literal text. Typography and contrast direction. photo-realistic, professional ad photography quality, crisp text rendering",
  "generation_route": "flux | ideogram | flux_then_ideogram",
  "aspect_ratio": "4:5 | 9:16 | 1.91:1 | 1:1",
  "confidence_score": 0.0-1.0,
  "prompt_strategy": "1 sentence explaining the creative direction and why this approach will drive phone calls"
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
  },
  painting: {
    spring: 'exterior painting season opens, HOA deadline pressure',
    summer: 'peak exterior season, deck staining, fence painting',
    fall: 'last chance exterior before cold, interior bookings ramp',
    winter: 'interior repaint season, refresh before holidays'
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  try {
    const input = await req.json()
    const {
      vertical, angle, season, urgency, headline, subheadline,
      cta, phone, company_name, service_area, offer_text, aspect_ratio,
      brand_colors, lora_trigger_word
    } = input

    if (!vertical || !angle || !season || !headline || !cta || !phone) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: vertical, angle, season, headline, cta, phone' }),
        { status: 400, headers: CORS }
      )
    }

    const seasonalContext = SEASONAL_CONTEXT[vertical]?.[season] || `${season} ${vertical} services`

    const brandContext = brand_colors
      ? `\nBrand colors: ${brand_colors} — reference these in the Ideogram text overlay color scheme.`
      : ''

    const loraContext = lora_trigger_word
      ? `\nLoRA trigger word available: "${lora_trigger_word}" — you MUST lead the flux_prompt with this trigger word. Set generation_route to "flux_then_ideogram".`
      : ''

    for (let attempt = 0; attempt < 3; attempt++) {
      const retryNote = attempt > 0
        ? `\n\nPREVIOUS ATTEMPT SCORED LOW CONFIDENCE. Be more specific about ${vertical} photographic details, lighting direction, and camera framing. Push cinematic quality.`
        : ''

      const userMessage = `Generate two precision image generation prompts for this contractor ad:

Vertical: ${vertical}
Ad angle: ${angle}
Season: ${season} — context: ${seasonalContext}
Urgency level: ${urgency || 'medium'}
Headline: "${headline}"${subheadline ? `\nSubheadline: "${subheadline}"` : ''}
CTA: "${cta}"
Phone: ${phone}
Company: ${company_name || 'local contractor'}
Service area: ${service_area || 'local area'}${offer_text ? `\nSpecial offer: "${offer_text}"` : ''}${aspect_ratio ? `\nPreferred format: ${aspect_ratio}` : ''}${brandContext}${loraContext}

The ad must drive immediate phone calls from homeowners. Make the flux_prompt cinematic and photorealistic. Make the ideogram_text_prompt crystal clear about text placement and typography.${retryNote}`

      const response = await anthropic.messages.create({
        model: 'claude-opus-4-6',
        max_tokens: 1200,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }]
      })

      const text = response.content[0].type === 'text' ? response.content[0].text : ''

      try {
        const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
        if (parsed.confidence_score >= 0.80 || attempt === 2) {
          return new Response(
            JSON.stringify({
              ...parsed,
              attempt: attempt + 1,
              input_echo: { vertical, angle, season, lora_trigger_word }
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
