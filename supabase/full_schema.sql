-- ════════════════════════════════════════════════════════════════════════
-- SkillPath — Complete Production Database Schema & RLS Setup
-- Copy and paste this script into:
-- Supabase Dashboard -> SQL Editor -> New Query -> Run
-- ════════════════════════════════════════════════════════════════════════

-- 1. Profiles Table (Links to Supabase Auth)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    full_name TEXT,
    avatar_url TEXT,
    current_role TEXT DEFAULT 'Learner',
    target_role TEXT DEFAULT 'Full Stack Developer',
    streak_days INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Resume Analysis Table
CREATE TABLE IF NOT EXISTS resume_analysis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    resume_file_url TEXT,
    file_name TEXT,
    ats_score INTEGER DEFAULT 0,
    ai_feedback TEXT,
    improvement_suggestions JSONB DEFAULT '[]'::jsonb,
    analysis_json JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. DSA / Practice Progress Table
CREATE TABLE IF NOT EXISTS dsa_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    leetcode_username TEXT,
    solved_problems JSONB DEFAULT '[]'::jsonb,
    category_counts JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- 4. Interview Progress Table
CREATE TABLE IF NOT EXISTS interview_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    role_key TEXT DEFAULT 'general',
    completed_rounds JSONB DEFAULT '[]'::jsonb,
    overall_score NUMERIC DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Roadmap Progress Table
CREATE TABLE IF NOT EXISTS roadmap_progress (
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

-- 6. Saved Playlists Table
CREATE TABLE IF NOT EXISTS saved_playlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    playlist_url TEXT NOT NULL,
    playlist_title TEXT,
    channel_name TEXT,
    skill_name TEXT,
    videos_data JSONB DEFAULT '[]'::jsonb,
    completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, playlist_url)
);

-- 7. Learning Progress Table (Video Watch Anti-Cheat Sessions)
CREATE TABLE IF NOT EXISTS learning_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    playlist_url TEXT,
    video_id TEXT,
    watched_seconds INTEGER DEFAULT 0,
    completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Coding Profile Stats Table
CREATE TABLE IF NOT EXISTS coding_profile_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    leetcode_solved INTEGER DEFAULT 0,
    github_repos INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- 9. Recent Searches Table
CREATE TABLE IF NOT EXISTS recent_searches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    query TEXT NOT NULL,
    level TEXT,
    language TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. User Feedback Table
CREATE TABLE IF NOT EXISTS user_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    rating INTEGER,
    feedback_text TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. Success Metrics Table (Analytics Logs)
CREATE TABLE IF NOT EXISTS success_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    session_id TEXT,
    event_type TEXT,
    target_url TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. Skills Cache Table
CREATE TABLE IF NOT EXISTS skills_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_key TEXT UNIQUE,
    playlists_json JSONB,
    certificates_json JSONB,
    roadmap_json JSONB,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. Trust Score Engine Table
CREATE TABLE IF NOT EXISTS trust_score_engine (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_key TEXT UNIQUE,
    score_data JSONB,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════════════════════
-- Indexes for Maximum Query Performance
-- ════════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_roadmap_progress_user ON roadmap_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_playlists_user ON saved_playlists(user_id);
CREATE INDEX IF NOT EXISTS idx_learning_progress_user ON learning_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_dsa_progress_user ON dsa_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_resume_analysis_user ON resume_analysis(user_id);
CREATE INDEX IF NOT EXISTS idx_recent_searches_user ON recent_searches(user_id);

-- ════════════════════════════════════════════════════════════════════════
-- Enable Row Level Security (RLS) on all tables
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE resume_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE dsa_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE roadmap_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE coding_profile_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE recent_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE success_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE trust_score_engine ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════════
-- RLS Policies (Allow Users Access to Their Own Data)
-- ════════════════════════════════════════════════════════════════════════

-- Profiles Policies
DROP POLICY IF EXISTS "Users view own profile" ON profiles;
DROP POLICY IF EXISTS "Users insert own profile" ON profiles;
DROP POLICY IF EXISTS "Users update own profile" ON profiles;
CREATE POLICY "Users view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Resume Analysis Policies
DROP POLICY IF EXISTS "Users own resume" ON resume_analysis;
CREATE POLICY "Users own resume" ON resume_analysis FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- DSA Progress Policies
DROP POLICY IF EXISTS "Users own dsa" ON dsa_progress;
CREATE POLICY "Users own dsa" ON dsa_progress FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Interview Progress Policies
DROP POLICY IF EXISTS "Users own interviews" ON interview_progress;
CREATE POLICY "Users own interviews" ON interview_progress FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Roadmap Progress Policies
DROP POLICY IF EXISTS "Users own roadmap" ON roadmap_progress;
CREATE POLICY "Users own roadmap" ON roadmap_progress FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Saved Playlists Policies
DROP POLICY IF EXISTS "Users own saved playlists" ON saved_playlists;
CREATE POLICY "Users own saved playlists" ON saved_playlists FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Learning Progress Policies
DROP POLICY IF EXISTS "Users own learning progress" ON learning_progress;
CREATE POLICY "Users own learning progress" ON learning_progress FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Coding Profile Stats Policies
DROP POLICY IF EXISTS "Users own coding stats" ON coding_profile_stats;
CREATE POLICY "Users own coding stats" ON coding_profile_stats FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Recent Searches Policies
DROP POLICY IF EXISTS "Users own searches" ON recent_searches;
CREATE POLICY "Users own searches" ON recent_searches FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- User Feedback Policies
DROP POLICY IF EXISTS "Users own feedback" ON user_feedback;
CREATE POLICY "Users own feedback" ON user_feedback FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Success Metrics Policies
DROP POLICY IF EXISTS "Users own success metrics" ON success_metrics;
CREATE POLICY "Users own success metrics" ON success_metrics FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Public Caches Policies
DROP POLICY IF EXISTS "Public read skills cache" ON skills_cache;
CREATE POLICY "Public read skills cache" ON skills_cache FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read trust engine" ON trust_score_engine;
CREATE POLICY "Public read trust engine" ON trust_score_engine FOR SELECT USING (true);

-- ════════════════════════════════════════════════════════════════════════
-- Automatic Profile Creation Trigger on Signup
-- ════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, avatar_url)
    VALUES (
        new.id,
        new.email,
        COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
        new.raw_user_meta_data->>'avatar_url'
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
