-- =====================================================
-- Migration: Add Manual UPI Payment & Verification Columns
-- =====================================================

-- 1. Profiles Table (for salon-specific UPI and QR settings)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS upi_id TEXT DEFAULT 'mohammedshihaamfayaz@okaxis',
ADD COLUMN IF NOT EXISTS upi_qr_image TEXT DEFAULT '/images/zarah-elite-qr.png',
ADD COLUMN IF NOT EXISTS advance_amount NUMERIC(10, 2) DEFAULT 500.00;

-- 2. Bookings Table (for storing payment screenshot proof and staff verification)
ALTER TABLE public.bookings 
ADD COLUMN IF NOT EXISTS payment_proof_image TEXT,
ADD COLUMN IF NOT EXISTS payment_proof_timestamp TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS verified_timestamp TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS verified_by TEXT;
