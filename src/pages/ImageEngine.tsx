import { useState } from 'react'
import { Loader2, Zap, ThumbsUp, ThumbsDown, RotateCcw, ChevronDown } from 'lucide-react'
import { generateAd, submitAdFeedback, getCurrentSeason } from '../lib/adGenerationService'
import type { AdGenerationInput, GeneratedAdResult } from '../types/image-pipeline'
import { VERTICAL_LABELS, ANGLE_LABELS } from '../types/image-pipeline'

type Step = 'idle' | 'prompting' | 'generating' | 'done' | 'error'

const VERTICALS = Object.entries(VERTICAL_LABELS) as [keyof typeof VERTICAL_LABELS, string][]
const ANGLES = Object.entries(ANGLE_LABELS) as [keyof typeof ANGLE_LABELS, string][]
const SEASONS = ['spring', 'summer', 'fall', 'winter'] as const
const ASPECT_RATIOS = ['4:5', '9:16', '1.91:1', '1:1'] as const

export default function ImageEngine() {
  const [form, setForm] = useState<AdGenerationInput>({
    vertical: 'plumbing',
    angle: 'emergency',
    season: getCurrentSeason(),
    urgency: 'high',
    headline: '',
    subheadline: '',
    cta: 'Call Now — Free Estimate',
    phone: '',
    company_name: '',
    service_area: '',
    offer_text: '',
    aspect_ratio: '4:5',
  })

  const [step, setStep] = useState<Step>('idle')
  const [promptPreview, setPromptPreview] = useState('')
  const [result, setResult] = useState<GeneratedAdResult | null>(null)
  const [selectedVariant, setSelectedVariant] = useState(0)
  const [error, setError] = useState('')
  const [feedbackSent, setFeedbackSent] = useState(false)

  function field<K extends keyof AdGenerationInput>(key: K, value: AdGenerationInput[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function handleGenerate() {
    if (!form.headline || !form.phone || !form.company_name) {
      setError('Please fill in Headline, Phone, and Company Name.')
      return
    }
    setError('')
    setStep('prompting')
    setPromptPreview('')
    setResult(null)
    setFeedbackSent(false)

    try {
      const res = await generateAd(form, {
        onPromptGenerated: (p) => { setPromptPreview(p); setStep('generating') },
        onImagesGenerating: () => setStep('generating'),
        onComplete: () => setStep('done'),
        onError: (e) => { setError(e); setStep('error') },
      })
      setResult(res)
      setSelectedVariant(0)
      setStep('done')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      setError(msg)
      setStep('error')
    }
  }

  async function handleFeedback(decision: 'keep' | 'reject') {
    if (!result) return
    await submitAdFeedback(result.generated_ad_id, decision)
    setFeedbackSent(true)
  }

  return (
    <div className="flex h-full">
      {/* Left: Form */}
      <div className="w-96 shrink-0 border-r border-flare-border overflow-y-auto p-6 space-y-5">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Zap size={18} className="text-flare-orange" />
            Image Engine
          </h1>
          <p className="text-sm text-gray-400 mt-1">Generate contractor ad images powered by FLUX + Ideogram</p>
        </div>

        {/* Vertical */}
        <Field label="Vertical">
          <Select value={form.vertical} onChange={v => field('vertical', v as AdGenerationInput['vertical'])}>
            {VERTICALS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </Field>

        {/* Angle */}
        <Field label="Ad Angle">
          <Select value={form.angle} onChange={v => field('angle', v as AdGenerationInput['angle'])}>
            {ANGLES.map(([a, l]) => <option key={a} value={a}>{l}</option>)}
          </Select>
        </Field>

        {/* Season + Urgency */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Season">
            <Select value={form.season} onChange={v => field('season', v as AdGenerationInput['season'])}>
              {SEASONS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </Select>
          </Field>
          <Field label="Urgency">
            <Select value={form.urgency ?? 'medium'} onChange={v => field('urgency', v as AdGenerationInput['urgency'])}>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </Select>
          </Field>
        </div>

        {/* Headline */}
        <Field label="Headline *">
          <Input
            placeholder="e.g. Same-Day Drain Cleaning"
            value={form.headline}
            onChange={v => field('headline', v)}
          />
        </Field>

        {/* Subheadline */}
        <Field label="Subheadline">
          <Input
            placeholder="e.g. Licensed & Insured · 24/7"
            value={form.subheadline ?? ''}
            onChange={v => field('subheadline', v)}
          />
        </Field>

        {/* CTA */}
        <Field label="CTA *">
          <Input
            placeholder="e.g. Call Now — Free Estimate"
            value={form.cta}
            onChange={v => field('cta', v)}
          />
        </Field>

        {/* Phone */}
        <Field label="Phone *">
          <Input
            placeholder="(801) 555-0123"
            value={form.phone}
            onChange={v => field('phone', v)}
          />
        </Field>

        {/* Company + Area */}
        <Field label="Company Name *">
          <Input
            placeholder="e.g. River Valley Plumbing"
            value={form.company_name}
            onChange={v => field('company_name', v)}
          />
        </Field>
        <Field label="Service Area">
          <Input
            placeholder="e.g. Salt Lake City, UT"
            value={form.service_area}
            onChange={v => field('service_area', v)}
          />
        </Field>

        {/* Offer */}
        <Field label="Special Offer">
          <Input
            placeholder="e.g. $49 drain special this week"
            value={form.offer_text ?? ''}
            onChange={v => field('offer_text', v)}
          />
        </Field>

        {/* Aspect ratio */}
        <Field label="Aspect Ratio">
          <div className="flex gap-2 flex-wrap">
            {ASPECT_RATIOS.map(r => (
              <button
                key={r}
                onClick={() => field('aspect_ratio', r)}
                className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
                  form.aspect_ratio === r
                    ? 'bg-flare-orange border-flare-orange text-white'
                    : 'border-flare-border text-gray-400 hover:border-gray-500'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </Field>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button
          onClick={handleGenerate}
          disabled={step === 'prompting' || step === 'generating'}
          className="w-full flex items-center justify-center gap-2 bg-flare-orange hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition-colors"
        >
          {(step === 'prompting' || step === 'generating') ? (
            <><Loader2 size={16} className="animate-spin" /> {step === 'prompting' ? 'Writing prompt…' : 'Generating images…'}</>
          ) : (
            <><Zap size={16} /> Generate Ad</>
          )}
        </button>
      </div>

      {/* Right: Output */}
      <div className="flex-1 overflow-y-auto p-8">
        {step === 'idle' && (
          <div className="h-full flex items-center justify-center text-center">
            <div>
              <Zap size={40} className="text-flare-orange mx-auto mb-4 opacity-50" />
              <p className="text-gray-400 text-sm">Fill in the form and click Generate Ad<br />to produce 3 image variants</p>
            </div>
          </div>
        )}

        {(step === 'prompting' || step === 'generating') && (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <Loader2 size={20} className="animate-spin text-flare-orange" />
              <span className="text-sm text-gray-300">
                {step === 'prompting' ? 'Claude is writing the image prompt…' : 'FLUX + Ideogram are rendering 3 variants…'}
              </span>
            </div>
            {promptPreview && (
              <div className="bg-flare-gray border border-flare-border rounded-lg p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">FLUX Prompt</p>
                <p className="text-sm text-gray-300 leading-relaxed">{promptPreview}</p>
              </div>
            )}
          </div>
        )}

        {step === 'done' && result && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-lg">Generated Variants</h2>
              <button
                onClick={handleGenerate}
                className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors"
              >
                <RotateCcw size={14} /> Regenerate
              </button>
            </div>

            {/* Variant tabs */}
            <div className="flex gap-2">
              {result.images.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedVariant(i)}
                  className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                    selectedVariant === i
                      ? 'bg-flare-orange text-white'
                      : 'bg-flare-gray text-gray-400 hover:text-white'
                  }`}
                >
                  Variant {i + 1}
                </button>
              ))}
            </div>

            {/* Image */}
            <div className="relative rounded-xl overflow-hidden bg-flare-gray border border-flare-border inline-block max-w-sm">
              <img
                src={result.images[selectedVariant]}
                alt={`Generated ad variant ${selectedVariant + 1}`}
                className="block max-w-full"
              />
            </div>

            {/* Prompt preview */}
            <div className="bg-flare-gray border border-flare-border rounded-lg p-4 max-w-xl">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Prompt used</p>
              <p className="text-sm text-gray-300 leading-relaxed">{result.prompt_used}</p>
              <p className="text-xs text-gray-600 mt-3">Generation cost: ~{result.cost_cents}¢</p>
            </div>

            {/* Flywheel feedback */}
            {!feedbackSent ? (
              <div className="flex items-center gap-3">
                <p className="text-sm text-gray-400">Keep this ad?</p>
                <button
                  onClick={() => handleFeedback('keep')}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green-900/30 hover:bg-green-900/50 text-green-400 text-sm font-medium border border-green-800 transition-colors"
                >
                  <ThumbsUp size={14} /> Keep
                </button>
                <button
                  onClick={() => handleFeedback('reject')}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-900/30 hover:bg-red-900/50 text-red-400 text-sm font-medium border border-red-800 transition-colors"
                >
                  <ThumbsDown size={14} /> Reject
                </button>
              </div>
            ) : (
              <p className="text-sm text-green-400">Feedback recorded — flywheel updated.</p>
            )}
          </div>
        )}

        {step === 'error' && (
          <div className="space-y-4">
            <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 max-w-lg">
              <p className="text-red-400 font-medium mb-1">Generation failed</p>
              <p className="text-sm text-red-300">{error}</p>
            </div>
            <button
              onClick={handleGenerate}
              className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white"
            >
              <RotateCcw size={14} /> Try again
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// Small reusable form primitives

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">{label}</label>
      {children}
    </div>
  )
}

function Input({ placeholder, value, onChange }: { placeholder: string; value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="text"
      placeholder={placeholder}
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full bg-flare-gray border border-flare-border rounded-lg px-3 py-2 text-sm placeholder-gray-600 focus:outline-none focus:border-flare-orange transition-colors"
    />
  )
}

function Select({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full appearance-none bg-flare-gray border border-flare-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-flare-orange transition-colors pr-8"
      >
        {children}
      </select>
      <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
    </div>
  )
}
