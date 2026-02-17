-- Auto-update updated_at timestamp on row modification
-- Reusable trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to products_catalog
DO $$ BEGIN
  CREATE TRIGGER trg_products_catalog_updated_at
    BEFORE UPDATE ON products_catalog
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Apply to product_recommendations
DO $$ BEGIN
  CREATE TRIGGER trg_product_recommendations_updated_at
    BEFORE UPDATE ON product_recommendations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
