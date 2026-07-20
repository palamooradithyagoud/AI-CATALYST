-- Migration: Add academic profile details (college, department, academic_class) to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS college TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS academic_class TEXT;
