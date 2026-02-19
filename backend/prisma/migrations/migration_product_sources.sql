-- Migration: Create product_sources table
-- Run this in your Supabase SQL editor

CREATE TABLE product_sources (
  id            SERIAL PRIMARY KEY,
  asin          VARCHAR(10) NOT NULL REFERENCES products(asin) ON DELETE CASCADE,
  supplier_name VARCHAR(255) NOT NULL,
  url           TEXT,
  purchase_price NUMERIC(10, 2),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_product_sources_asin ON product_sources(asin);
