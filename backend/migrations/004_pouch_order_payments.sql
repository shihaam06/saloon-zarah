-- Migration 004: POUCH Order Payment and Billing Fields
-- Run this in Supabase SQL Editor if you are managing schemas manually

ALTER TABLE IF EXISTS bookings
  ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'Payment Not Requested',
  ADD COLUMN IF NOT EXISTS payment_proof_image text,
  ADD COLUMN IF NOT EXISTS payment_proof_timestamp timestamptz,
  ADD COLUMN IF NOT EXISTS bill_amount numeric,
  ADD COLUMN IF NOT EXISTS custom_requirements text,
  ADD COLUMN IF NOT EXISTS bill_details text,
  ADD COLUMN IF NOT EXISTS instagram_user_id text;

-- Create index for fast Instagram user lookup on bookings
CREATE INDEX IF NOT EXISTS idx_bookings_ig_user ON bookings(profile_id, instagram_user_id);
