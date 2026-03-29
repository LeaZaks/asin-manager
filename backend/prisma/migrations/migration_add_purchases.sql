-- Migration: Add purchases and credit_cards tables
-- Run via: prisma migrate dev --name add_purchases
-- Or apply directly to Supabase SQL editor

-- ── Credit Cards ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "credit_cards" (
  "id"         SERIAL PRIMARY KEY,
  "last4"      VARCHAR(4)   NOT NULL,
  "nickname"   TEXT         NOT NULL,
  "created_at" TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Purchases ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "purchases" (
  "id"             SERIAL PRIMARY KEY,
  "asin"           VARCHAR(10)    NOT NULL,
  "source_url"     TEXT,
  "order_number"   TEXT,
  "order_date"     TIMESTAMPTZ,
  "quantity"       INTEGER,
  "total_amount"   NUMERIC(10,2),
  "tax_amount"     NUMERIC(10,2),
  "shipping_cost"  NUMERIC(10,2),
  "delivery_date"  TIMESTAMPTZ,
  "receipt_file"   TEXT,
  "credit_card_id" INTEGER        REFERENCES "credit_cards"("id") ON DELETE SET NULL,
  "coupons_used"   TEXT,
  "notes"          TEXT,
  "created_at"     TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  "updated_at"     TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

ALTER TABLE "purchases"
  ADD CONSTRAINT "purchases_asin_fkey"
  FOREIGN KEY ("asin") REFERENCES "products"("asin") ON DELETE CASCADE;

-- Index for fast lookup by ASIN
CREATE INDEX IF NOT EXISTS "purchases_asin_idx" ON "purchases"("asin");
CREATE INDEX IF NOT EXISTS "purchases_order_date_idx" ON "purchases"("order_date");
