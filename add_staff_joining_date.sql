-- =====================================================
-- MIGRATION: Add joining_date column to staff table
-- Run this in your Supabase SQL Editor
-- =====================================================

ALTER TABLE staff
ADD COLUMN IF NOT EXISTS joining_date DATE;

-- Optional: Add a comment for clarity
COMMENT ON COLUMN staff.joining_date IS 'The date the staff member joined the salon';
