-- Supabase PostgreSQL Schema for INE Product Price Tracker
-- Generated strictly according to assignment requirements and architectural principles.

-- 1. Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Products Table
-- Decouples internal product identity (UUID id) from external INE store_product_id.
-- Soft untracking: is_active = false preserves historical price data and logs.
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_product_id TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    brand TEXT,
    category TEXT,
    sku TEXT,
    current_price NUMERIC,
    currency TEXT DEFAULT 'INR',
    current_stock INTEGER,
    stock_status TEXT DEFAULT 'unknown', -- 'in_stock' | 'out_of_stock' | 'unknown'
    is_active BOOLEAN DEFAULT true,
    last_scraped_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_store_id ON products(store_product_id);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active);

-- 3. Scrape Runs Table
-- Represents an overall scrape job for a product (started, finished, final status).
CREATE TABLE IF NOT EXISTS scrape_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ DEFAULT now(),
    finished_at TIMESTAMPTZ,
    final_status TEXT NOT NULL, -- 'running' | 'success' | 'failed'
    total_attempts INTEGER DEFAULT 0,
    execution_mode TEXT NOT NULL, -- 'headless' | 'headed'
    trigger_source TEXT NOT NULL, -- 'manual' | 'scheduled'
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scrape_runs_product_id ON scrape_runs(product_id);
CREATE INDEX IF NOT EXISTS idx_scrape_runs_started_at ON scrape_runs(started_at DESC);

-- 4. Scrape Attempts Table
-- Records every individual retry, HTTP code, latency, and error message honestly.
-- Uniqueness constraint prevents duplicate attempt numbers per run.
CREATE TABLE IF NOT EXISTS scrape_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES scrape_runs(id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL,
    status TEXT NOT NULL, -- 'success' | 'timeout' | 'http_error' | 'parse_error' | 'failed'
    http_status INTEGER,
    response_time_ms INTEGER,
    error_message TEXT,
    timestamp TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT unique_run_attempt UNIQUE(run_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS idx_scrape_attempts_run_id ON scrape_attempts(run_id);
CREATE INDEX IF NOT EXISTS idx_scrape_attempts_timestamp ON scrape_attempts(timestamp DESC);

-- 5. Price History Table
-- Zero-Pollution Data Invariant enforced at DB level:
-- price MUST be > 0, stock MUST be >= 0.
CREATE TABLE IF NOT EXISTS price_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    run_id UUID NOT NULL REFERENCES scrape_runs(id) ON DELETE CASCADE,
    price NUMERIC NOT NULL CHECK (price > 0),
    currency TEXT NOT NULL DEFAULT 'INR',
    stock INTEGER NOT NULL CHECK (stock >= 0),
    stock_status TEXT NOT NULL, -- 'in_stock' | 'out_of_stock'
    scraped_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_price_history_product_id ON price_history(product_id, scraped_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_history_run_id ON price_history(run_id);
