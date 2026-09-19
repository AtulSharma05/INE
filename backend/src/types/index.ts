export interface Product {
  id: string; // Internal database UUID
  store_product_id: string; // INE mock store product ID (e.g. "886")
  slug: string;
  name: string;
  brand: string | null;
  category: string | null;
  sku: string | null;
  current_price: number | null;
  currency: string;
  current_stock: number | null;
  stock_status: 'in_stock' | 'out_of_stock' | 'unknown';
  is_active: boolean;
  last_scraped_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScrapeRun {
  id: string; // UUID
  product_id: string; // Foreign key to products.id
  started_at: string;
  finished_at: string | null;
  final_status: 'running' | 'success' | 'failed';
  total_attempts: number;
  execution_mode: 'headless' | 'headed';
  trigger_source: 'manual' | 'scheduled';
  created_at: string;
  attempts?: ScrapeAttempt[];
}

export interface ScrapeAttempt {
  id: string; // UUID
  run_id: string; // Foreign key to scrape_runs.id
  attempt_number: number;
  status: 'success' | 'timeout' | 'http_error' | 'parse_error' | 'failed';
  http_status: number | null;
  response_time_ms: number;
  error_message: string | null;
  timestamp: string;
}

export interface PriceHistory {
  id: string; // UUID
  product_id: string; // Foreign key to products.id
  run_id: string; // Foreign key to scrape_runs.id
  price: number; // Checked: price > 0
  currency: string;
  stock: number; // Checked: stock >= 0
  stock_status: 'in_stock' | 'out_of_stock';
  scraped_at: string;
}

export interface ScrapedData {
  price: number;
  currency: string;
  stock: number;
  stock_status: 'in_stock' | 'out_of_stock';
  rawPriceText?: string;
  rawStockText?: string;
}

export interface CatalogItem {
  id: number;
  slug: string;
  name: string;
  brand: string;
  category: string;
  sku: string;
  description: string;
}
