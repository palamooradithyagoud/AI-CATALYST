-- ═══════════════════════════════════════════════════════════════
-- SkillPath — Supabase Roadmap Progress Table Setup
-- Copy and paste this script into:
-- Supabase Dashboard → SQL Editor → New Query → Run
-- ═══════════════════════════════════════════════════════════════

-- 1. Create Roadmap Progress Table
CREATE TABLE IF NOT EXISTS roadmap_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL DEFAULT 'anonymous',
    roadmap_key TEXT NOT NULL DEFAULT 'fullstack',
    skill_statuses JSONB NOT NULL DEFAULT '{}'::jsonb,
    completed_count INTEGER DEFAULT 0,
    in_progress_count INTEGER DEFAULT 0,
    total_skills INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, roadmap_key)
);

-- 2. Index for high-performance lookup
CREATE INDEX IF NOT EXISTS idx_roadmap_progress_user ON roadmap_progress(user_id, roadmap_key);

-- 3. Auto-update timestamp function & trigger
CREATE OR REPLACE FUNCTION update_roadmap_progress_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_roadmap_progress_updated ON roadmap_progress;
CREATE TRIGGER trg_roadmap_progress_updated
    BEFORE UPDATE ON roadmap_progress
    FOR EACH ROW EXECUTE PROCEDURE update_roadmap_progress_timestamp();

-- 4. Enable Row Level Security (RLS) & Grant Access Policy
ALTER TABLE roadmap_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public access roadmap_progress" ON roadmap_progress;
CREATE POLICY "Public access roadmap_progress" ON roadmap_progress FOR ALL USING (true) WITH CHECK (true);
