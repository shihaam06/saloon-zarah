-- =====================================================
-- Migration 005: POUCH Build Your Own (BYO) Tables
-- =====================================================

-- 1. BYO Products Table
CREATE TABLE IF NOT EXISTS byo_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    base_price NUMERIC NOT NULL DEFAULT 0,
    image_url TEXT,
    category TEXT DEFAULT 'Custom',
    rules JSONB DEFAULT '{"min_total": 0, "max_total": 0, "allow_notes": true}'::jsonb,
    config_data JSONB, -- Full compiled snapshot for instant rendering and resilient access
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_byo_products_profile ON byo_products(profile_id);
CREATE INDEX IF NOT EXISTS idx_byo_products_slug ON byo_products(slug);

-- 2. BYO Component Categories Table
CREATE TABLE IF NOT EXISTS byo_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES byo_products(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    min_select INTEGER NOT NULL DEFAULT 0,
    max_select INTEGER NOT NULL DEFAULT 0,
    required BOOLEAN NOT NULL DEFAULT false,
    allow_multiple BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_byo_categories_product ON byo_categories(product_id);

-- 3. BYO Components Table
CREATE TABLE IF NOT EXISTS byo_components (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES byo_categories(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES byo_products(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    image_url TEXT,
    emoji_icon TEXT DEFAULT '✨',
    price NUMERIC NOT NULL DEFAULT 0,
    stock INTEGER NOT NULL DEFAULT -1,
    min_qty INTEGER NOT NULL DEFAULT 0,
    max_qty INTEGER NOT NULL DEFAULT 0,
    inventory_id UUID REFERENCES inventory(id) ON DELETE SET NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_byo_components_category ON byo_components(category_id);
CREATE INDEX IF NOT EXISTS idx_byo_components_product ON byo_components(product_id);
