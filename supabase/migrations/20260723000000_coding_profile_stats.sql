-- ─────────────────────────────────────────────────────────────────────────────
-- SKILLPATH AI: SUPABASE DATABASE MIGRATION SCRIPT
-- Live Coding Profiles, Student Extracted Stats & Historical Metrics Tracking
-- ─────────────────────────────────────────────────────────────────────────────
-- Execute this SQL script in your Supabase SQL Editor (https://app.supabase.com)

-- 1. Ensure all 6 priority coding profile handle columns exist in 'profiles' table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS leetcode_profile TEXT,
ADD COLUMN IF NOT EXISTS github_profile TEXT,
ADD COLUMN IF NOT EXISTS hackerrank_profile TEXT,
ADD COLUMN IF NOT EXISTS codechef_profile TEXT,
ADD COLUMN IF NOT EXISTS gfg_profile TEXT,
ADD COLUMN IF NOT EXISTS codeforces_profile TEXT,
ADD COLUMN IF NOT EXISTS coding_stats JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS last_stats_sync TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 2. Create standalone historical stats tracking table
CREATE TABLE IF NOT EXISTS coding_profile_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    leetcode_handle TEXT,
    github_handle TEXT,
    hackerrank_handle TEXT,
    codechef_handle TEXT,
    gfg_handle TEXT,
    codeforces_handle TEXT,
    extracted_stats JSONB DEFAULT '{}'::jsonb,
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Set up Row Level Security (RLS) policies for user data protection
ALTER TABLE coding_profile_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own coding profile stats" ON coding_profile_stats;
CREATE POLICY "Users can view their own coding profile stats"
ON coding_profile_stats FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own coding profile stats" ON coding_profile_stats;
CREATE POLICY "Users can insert their own coding profile stats"
ON coding_profile_stats FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own coding profile stats" ON coding_profile_stats;
CREATE POLICY "Users can update their own coding profile stats"
ON coding_profile_stats FOR UPDATE
USING (auth.uid() = user_id);

-- 4. Create performance indexes on user_id and email
CREATE INDEX IF NOT EXISTS idx_coding_profile_stats_user_id ON coding_profile_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_coding_profile_stats_synced_at ON coding_profile_stats(synced_at DESC);
