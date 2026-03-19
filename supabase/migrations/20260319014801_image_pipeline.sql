-- Flare Image Generation Pipeline
-- Safe additive migration — all tables use IF NOT EXISTS

-- Training images (bootstrap dataset + flywheel keeps)
CREATE TABLE IF NOT EXISTS training_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical TEXT NOT NULL CHECK (vertical IN ('plumbing','hvac','roofing','electrical','landscaping')),
  image_url TEXT NOT NULL,
  image_path TEXT,
  source TEXT DEFAULT 'scraped' CHECK (source IN ('scraped','synthetic','flywheel')),
  metadata JSONB NOT NULL DEFAULT '{}',
  quality_score INTEGER CHECK (quality_score BETWEEN 1 AND 10),
  caption TEXT,
  in_training_set BOOLEAN DEFAULT false,
  lora_version TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- LoRA model versions per vertical
CREATE TABLE IF NOT EXISTS lora_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical TEXT NOT NULL CHECK (vertical IN ('plumbing','hvac','roofing','electrical','landscaping')),
  version INTEGER NOT NULL DEFAULT 1,
  fal_lora_url TEXT NOT NULL,
  trigger_word TEXT NOT NULL,
  training_image_count INTEGER,
  flywheel_signal_count INTEGER DEFAULT 0,
  keep_rate DECIMAL(4,2),
  status TEXT DEFAULT 'active' CHECK (status IN ('training','active','deprecated')),
  trained_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Generated ads (output of the pipeline)
CREATE TABLE IF NOT EXISTS generated_ads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID,
  vertical TEXT NOT NULL,
  angle TEXT NOT NULL,
  season TEXT,
  flux_prompt TEXT NOT NULL,
  negative_prompt TEXT,
  ideogram_text_prompt TEXT,
  lora_version_id UUID REFERENCES lora_versions(id),
  base_image_url TEXT,
  final_image_url TEXT,
  aspect_ratio TEXT DEFAULT '4:5',
  generation_cost_cents INTEGER DEFAULT 9,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','generating','complete','failed')),
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Contractor keep/reject decisions (the flywheel)
CREATE TABLE IF NOT EXISTS ad_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID,
  generated_ad_id UUID REFERENCES generated_ads(id),
  vertical TEXT NOT NULL,
  angle TEXT NOT NULL,
  season TEXT,
  decision TEXT NOT NULL CHECK (decision IN ('keep','reject','edit')),
  rejection_reason TEXT CHECK (rejection_reason IN (
    'wrong_scenario','bad_lighting','unrealistic',
    'text_issue','wrong_composition','off_brand','other'
  )),
  edit_description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_training_images_vertical ON training_images(vertical);
CREATE INDEX IF NOT EXISTS idx_training_images_training_set ON training_images(in_training_set);
CREATE INDEX IF NOT EXISTS idx_lora_versions_vertical_status ON lora_versions(vertical, status);
CREATE INDEX IF NOT EXISTS idx_generated_ads_user ON generated_ads(user_id);
CREATE INDEX IF NOT EXISTS idx_generated_ads_vertical ON generated_ads(vertical);
CREATE INDEX IF NOT EXISTS idx_generated_ads_status ON generated_ads(status);
CREATE INDEX IF NOT EXISTS idx_ad_feedback_vertical ON ad_feedback(vertical);
CREATE INDEX IF NOT EXISTS idx_ad_feedback_decision ON ad_feedback(decision);

-- Flywheel analytics view
CREATE OR REPLACE VIEW flywheel_summary AS
SELECT
  vertical, angle, season,
  COUNT(*) as total_signals,
  SUM(CASE WHEN decision = 'keep' THEN 1 ELSE 0 END) as keeps,
  SUM(CASE WHEN decision = 'reject' THEN 1 ELSE 0 END) as rejects,
  ROUND(
    SUM(CASE WHEN decision = 'keep' THEN 1 ELSE 0 END)::decimal / COUNT(*) * 100, 1
  ) as keep_rate_pct,
  MAX(created_at) as last_signal_at
FROM ad_feedback
GROUP BY vertical, angle, season
ORDER BY vertical, keep_rate_pct DESC;

-- Retrain trigger view
CREATE OR REPLACE VIEW retrain_readiness AS
SELECT
  f.vertical,
  COUNT(*) as new_signals_since_last_train,
  ROUND(
    SUM(CASE WHEN f.decision = 'keep' THEN 1 ELSE 0 END)::decimal /
    NULLIF(COUNT(*), 0) * 100, 1
  ) as recent_keep_rate_pct,
  lv.trained_at as last_trained_at,
  lv.version as current_version,
  CASE
    WHEN COUNT(*) >= 500 THEN true
    WHEN SUM(CASE WHEN f.decision = 'keep' THEN 1 ELSE 0 END)::decimal /
         NULLIF(COUNT(*), 0) < 0.60 THEN true
    ELSE false
  END as should_retrain
FROM ad_feedback f
LEFT JOIN lora_versions lv ON lv.vertical = f.vertical AND lv.status = 'active'
WHERE f.created_at > COALESCE(lv.trained_at, '2000-01-01')
GROUP BY f.vertical, lv.trained_at, lv.version;

-- RLS
ALTER TABLE training_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE lora_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_ads ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "users_own_generated_ads" ON generated_ads
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "users_own_ad_feedback" ON ad_feedback
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "service_role_training_images" ON training_images
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY IF NOT EXISTS "service_role_lora_versions" ON lora_versions
  FOR ALL USING (auth.role() = 'service_role');
