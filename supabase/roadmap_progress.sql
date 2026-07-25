-- ═══════════════════════════════════════════════════════════════
-- SkillPath — Enterprise Production Architecture & RLS Migration
-- Copy and paste into: Supabase Dashboard → SQL Editor → New Query → Run
-- ═══════════════════════════════════════════════════════════════

-- 1. Create missing tables with proper UUID foreign keys
CREATE TABLE IF NOT EXISTS coding_profile_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    leetcode_solved INTEGER DEFAULT 0,
    github_repos INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- 2. Add proper UUID user_id foreign keys to session tables
ALTER TABLE learning_progress ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE user_feedback ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE success_metrics ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES profiles(id) ON DELETE CASCADE;

-- 3. Re-create roadmap_progress with strict UUID foreign key
CREATE TABLE IF NOT EXISTS roadmap_progress_v2 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    roadmap_key TEXT NOT NULL DEFAULT 'fullstack',
    skill_statuses JSONB NOT NULL DEFAULT '{}'::jsonb,
    completed_count INTEGER DEFAULT 0,
    in_progress_count INTEGER DEFAULT 0,
    total_skills INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, roadmap_key)
);

-- Migrate data if previous roadmap_progress table existed
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'roadmap_progress') THEN
        INSERT INTO roadmap_progress_v2 (user_id, roadmap_key, skill_statuses, completed_count, in_progress_count, total_skills, updated_at)
        SELECT user_id::uuid, roadmap_key, skill_statuses, completed_count, in_progress_count, total_skills, updated_at
        FROM roadmap_progress
        WHERE user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        ON CONFLICT DO NOTHING;
        DROP TABLE roadmap_progress CASCADE;
    END IF;
END $$;

ALTER TABLE roadmap_progress_v2 RENAME TO roadmap_progress;

-- 4. Create B-Tree Indexes for 0ms RLS evaluations
CREATE INDEX IF NOT EXISTS idx_roadmap_progress_user_uuid ON roadmap_progress(user_id, roadmap_key);
CREATE INDEX IF NOT EXISTS idx_learning_progress_user_uuid ON learning_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_user_feedback_user_uuid ON user_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_success_metrics_user_uuid ON success_metrics(user_id);

-- 5. Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE resume_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE dsa_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE roadmap_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE coding_profile_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE success_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE trust_score_engine ENABLE ROW LEVEL SECURITY;

-- 6. Clean Old Policies
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can delete own profile" ON profiles;
DROP POLICY IF EXISTS "Public access profiles" ON profiles;
DROP POLICY IF EXISTS "Public full access profiles" ON profiles;

DROP POLICY IF EXISTS "Users own resume" ON resume_analysis;
DROP POLICY IF EXISTS "Public access resume_analysis" ON resume_analysis;
DROP POLICY IF EXISTS "Public full access resume_analysis" ON resume_analysis;

DROP POLICY IF EXISTS "Users own dsa" ON dsa_progress;
DROP POLICY IF EXISTS "Public access dsa_progress" ON dsa_progress;
DROP POLICY IF EXISTS "Public full access dsa_progress" ON dsa_progress;

DROP POLICY IF EXISTS "Users own interviews" ON interview_progress;
DROP POLICY IF EXISTS "Public access interview_progress" ON interview_progress;
DROP POLICY IF EXISTS "Public full access interview_progress" ON interview_progress;

DROP POLICY IF EXISTS "Users own roadmap" ON roadmap_progress;
DROP POLICY IF EXISTS "Public access roadmap_progress" ON roadmap_progress;
DROP POLICY IF EXISTS "Public full access roadmap_progress" ON roadmap_progress;

DROP POLICY IF EXISTS "Users own coding stats" ON coding_profile_stats;
DROP POLICY IF EXISTS "Users can view their own coding profile stats" ON coding_profile_stats;

DROP POLICY IF EXISTS "Users own learning progress" ON learning_progress;
DROP POLICY IF EXISTS "Public access learning_progress" ON learning_progress;
DROP POLICY IF EXISTS "Public full access learning_progress" ON learning_progress;

DROP POLICY IF EXISTS "Users own feedback" ON user_feedback;
DROP POLICY IF EXISTS "Authenticated insert feedback" ON user_feedback;
DROP POLICY IF EXISTS "Public access user_feedback" ON user_feedback;
DROP POLICY IF EXISTS "Public full access user_feedback" ON user_feedback;

DROP POLICY IF EXISTS "Users own success metrics" ON success_metrics;
DROP POLICY IF EXISTS "Public access success_metrics" ON success_metrics;
DROP POLICY IF EXISTS "Public full access success_metrics" ON success_metrics;

DROP POLICY IF EXISTS "Public read skills cache" ON skills_cache;
DROP POLICY IF EXISTS "Public access skills_cache" ON skills_cache;
DROP POLICY IF EXISTS "Public full access skills_cache" ON skills_cache;

DROP POLICY IF EXISTS "Public read trust engine" ON trust_score_engine;
DROP POLICY IF EXISTS "Public access trust_score_engine" ON trust_score_engine;
DROP POLICY IF EXISTS "Public full access trust_score_engine" ON trust_score_engine;

-- 7. High-Performance Native UUID Policies (UUID = UUID)
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can delete own profile" ON profiles FOR DELETE USING (auth.uid() = id);

CREATE POLICY "Users own resume" ON resume_analysis FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users own dsa" ON dsa_progress FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users own interviews" ON interview_progress FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users own roadmap" ON roadmap_progress FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users own coding stats" ON coding_profile_stats FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users own learning progress" ON learning_progress FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users own feedback" ON user_feedback FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users own success metrics" ON success_metrics FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Shared Cache (Public SELECT, Service Role Writes)
CREATE POLICY "Public read skills cache" ON skills_cache FOR SELECT USING (true);
CREATE POLICY "Public read trust engine" ON trust_score_engine FOR SELECT USING (true);

REVOKE INSERT, UPDATE, DELETE ON skills_cache FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON trust_score_engine FROM anon, authenticated;
