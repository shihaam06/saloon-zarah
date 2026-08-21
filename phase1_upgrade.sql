-- =====================================================
-- MIGRATION: Phase 1 Enterprise Upgrade
-- Run this in your Supabase SQL Editor
-- =====================================================

-- 1. Upgrade SERVICES table
ALTER TABLE services
ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Uncategorized',
ADD COLUMN IF NOT EXISTS duration TEXT DEFAULT '30 min',
ADD COLUMN IF NOT EXISTS available_for TEXT DEFAULT 'Everyone',
ADD COLUMN IF NOT EXISTS turnaround_time TEXT;

-- 2. Upgrade APPOINTMENTS table
ALTER TABLE appointments
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Scheduled',
ADD COLUMN IF NOT EXISTS advance_paid NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS chair_room TEXT,
ADD COLUMN IF NOT EXISTS invoice_id UUID;
