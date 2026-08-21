-- Run this in your Supabase SQL Editor
ALTER TABLE public.bills
ADD COLUMN IF NOT EXISTS product_total NUMERIC(10, 2) DEFAULT 0.00;
