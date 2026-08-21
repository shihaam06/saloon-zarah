-- =====================================================
-- MIGRATION: Add hsn_code to inventory
-- Run this in your Supabase SQL Editor
-- =====================================================

ALTER TABLE public.inventory
ADD COLUMN IF NOT EXISTS hsn_code TEXT;
