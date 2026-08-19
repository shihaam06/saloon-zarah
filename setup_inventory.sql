-- =====================================================
-- INVENTORY & STOCK TRACKING SCHEMA FOR SUPABASE
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor)
-- =====================================================

-- 1. Create the inventory table
CREATE TABLE IF NOT EXISTS public.inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT,
    price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    stock INTEGER NOT NULL DEFAULT 0,
    low_stock_threshold INTEGER NOT NULL DEFAULT 5,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Create the inventory_transactions table (for tracking sales, restocks & audit history)
CREATE TABLE IF NOT EXISTS public.inventory_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    inventory_id UUID REFERENCES public.inventory(id) ON DELETE CASCADE,
    quantity_change INTEGER NOT NULL, -- Positive for restock, negative for sale
    type TEXT NOT NULL CHECK (type IN ('sale', 'restock', 'adjustment')),
    bill_id UUID REFERENCES public.bills(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Enable Row-Level Security (RLS)
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS Policies for authenticated salon owners & staff

-- Inventory table policies
DROP POLICY IF EXISTS "Allow authenticated users all on inventory" ON public.inventory;
CREATE POLICY "Allow authenticated users all on inventory"
    ON public.inventory
    FOR ALL
    TO authenticated
    USING (auth.uid() = profile_id)
    WITH CHECK (auth.uid() = profile_id);

-- Inventory transactions table policies
DROP POLICY IF EXISTS "Allow authenticated users all on inventory_transactions" ON public.inventory_transactions;
CREATE POLICY "Allow authenticated users all on inventory_transactions"
    ON public.inventory_transactions
    FOR ALL
    TO authenticated
    USING (auth.uid() = profile_id)
    WITH CHECK (auth.uid() = profile_id);

-- 5. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_inventory_profile_id ON public.inventory(profile_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_profile_id ON public.inventory_transactions(profile_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_created_at ON public.inventory_transactions(created_at);
