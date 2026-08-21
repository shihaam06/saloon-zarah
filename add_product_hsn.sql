-- =====================================================
-- MIGRATION: Add hsn_code & gst_rate to inventory
-- Run this in your Supabase SQL Editor
-- =====================================================

ALTER TABLE public.inventory
ADD COLUMN IF NOT EXISTS hsn_code TEXT,
ADD COLUMN IF NOT EXISTS gst_rate NUMERIC(5, 2) DEFAULT 0.00;

