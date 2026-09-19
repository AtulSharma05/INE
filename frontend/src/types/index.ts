export interface Product {
  id: string; // Internal database UUID
  store_product_id: string; // External INE store ID
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

export interface CatalogItem {
  id: number;
  slug: string;
  name: string;
  brand: string;
  category: string;
  sku: string;
  description: string;
}

export interface ScrapeAttempt {
  id: string;
  run_id: string;
  attempt_number: number;
  status: 'success' | 'timeout' | 'http_error' | 'parse_error' | 'failed';
  http_status: number | null;
  response_time_ms: number;
  error_message: string | null;
  timestamp: string;
}

export interface ScrapeRun {
  id: string;
  product_id: string;
  started_at: string;
  finished_at: string | null;
  final_status: 'running' | 'success' | 'failed';
  total_attempts: number;
  execution_mode: 'headless' | 'headed';
  trigger_source: 'manual' | 'scheduled';
  created_at: string;
  attempts?: ScrapeAttempt[];
}

export interface PriceHistory {
  id: string;
  product_id: string;
  run_id: string;
  price: number;
  currency: string;
  stock: number;
  stock_status: 'in_stock' | 'out_of_stock';
  scraped_at: string;
}
