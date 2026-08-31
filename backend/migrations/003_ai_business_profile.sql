-- =====================================================
-- MIGRATION 003: AI BUSINESS PROFILE COLUMNS
-- =====================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS business_category text,
  ADD COLUMN IF NOT EXISTS ai_tone text DEFAULT 'Friendly',
  ADD COLUMN IF NOT EXISTS pricing_info text,
  ADD COLUMN IF NOT EXISTS booking_rules text,
  ADD COLUMN IF NOT EXISTS delivery_info text,
  ADD COLUMN IF NOT EXISTS payment_info text,
  ADD COLUMN IF NOT EXISTS faq_data text,
  ADD COLUMN IF NOT EXISTS ai_business_profile jsonb;

-- Comment on columns
COMMENT ON COLUMN profiles.business_category IS 'Business category: Salon, Bakery, Clothing, Crochet / Handmade, Home Business, Retail, Service Business, Other';
COMMENT ON COLUMN profiles.ai_tone IS 'AI response tone: Professional, Friendly, Casual, Premium';
COMMENT ON COLUMN profiles.pricing_info IS 'Pricing guidelines and starting rates for AI reference';
COMMENT ON COLUMN profiles.booking_rules IS 'Booking or ordering rules (e.g. advance notice, cancellation policies)';
COMMENT ON COLUMN profiles.delivery_info IS 'Delivery options, fees, service area, and shipping methods';
COMMENT ON COLUMN profiles.payment_info IS 'Payment instructions, accepted payment methods, advance deposit rules';
COMMENT ON COLUMN profiles.faq_data IS 'Frequently asked questions and answers for the AI';
COMMENT ON COLUMN profiles.ai_business_profile IS 'Complete JSON backup of AI profile settings';
