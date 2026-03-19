export type Vertical = 'plumbing' | 'hvac' | 'roofing' | 'electrical' | 'landscaping'
export type AdAngle = 'emergency' | 'seasonal' | 'maintenance' | 'trust' | 'before_after' | 'offer' | 'social_proof'
export type Season = 'spring' | 'summer' | 'fall' | 'winter'
export type AspectRatio = '4:5' | '9:16' | '1.91:1' | '1:1'

export interface AdGenerationInput {
  vertical: Vertical
  angle: AdAngle
  season: Season
  urgency?: 'high' | 'medium' | 'low'
  headline: string
  subheadline?: string
  cta: string
  phone: string
  company_name: string
  service_area: string
  offer_text?: string
  aspect_ratio?: AspectRatio
}

export interface AdPromptResult {
  flux_prompt: string
  negative_prompt: string
  ideogram_text_prompt: string
  aspect_ratio: AspectRatio
  confidence_score: number
  input_echo: { vertical: Vertical; angle: AdAngle; season: Season }
}

export interface GeneratedAdResult {
  generated_ad_id: string
  images: string[]
  prompt_used: string
  cost_cents: number
}

export interface AdFeedbackPayload {
  generated_ad_id: string
  decision: 'keep' | 'reject' | 'edit'
  rejection_reason?: 'wrong_scenario' | 'bad_lighting' | 'unrealistic' | 'text_issue' | 'wrong_composition' | 'off_brand' | 'other'
  edit_description?: string
}

export const VERTICAL_LABELS: Record<Vertical, string> = {
  plumbing: 'Plumbing',
  hvac: 'HVAC',
  roofing: 'Roofing',
  electrical: 'Electrical',
  landscaping: 'Landscaping',
}

export const ANGLE_LABELS: Record<AdAngle, string> = {
  emergency: 'Emergency',
  seasonal: 'Seasonal',
  maintenance: 'Maintenance',
  trust: 'Trust / Credibility',
  before_after: 'Before & After',
  offer: 'Special Offer',
  social_proof: 'Social Proof',
}
