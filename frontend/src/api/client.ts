import type { Product, CatalogItem, PriceHistory, ScrapeRun } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  const data = await res.json();
  if (!res.ok || data.success === false) {
    throw new Error(data.error || `HTTP error ${res.status}`);
  }
  return data;
}

export const api = {
  // Catalog search
  async searchCatalog(query: string = '', limit: number = 20): Promise<CatalogItem[]> {
    const data = await fetchJson<{ success: boolean; items: CatalogItem[] }>(
      `${API_BASE_URL}/api/catalog/search?q=${encodeURIComponent(query)}&limit=${limit}`
    );
    return data.items || [];
  },

  // Tracked products
  async getTrackedProducts(includeInactive: boolean = false): Promise<Product[]> {
    const data = await fetchJson<{ success: boolean; products: Product[] }>(
      `${API_BASE_URL}/api/products?includeInactive=${includeInactive}`
    );
    return data.products || [];
  },

  // Track product
  async trackProduct(storeProductId: string): Promise<Product> {
    const data = await fetchJson<{ success: boolean; product: Product }>(
      `${API_BASE_URL}/api/products/track`,
      {
        method: 'POST',
        body: JSON.stringify({ store_product_id: storeProductId }),
      }
    );
    return data.product;
  },

  // Soft untrack
  async untrackProduct(id: string): Promise<Product> {
    const data = await fetchJson<{ success: boolean; product: Product }>(
      `${API_BASE_URL}/api/products/${id}`,
      { method: 'DELETE' }
    );
    return data.product;
  },

  // Price & stock history
  async getProductHistory(id: string): Promise<PriceHistory[]> {
    const data = await fetchJson<{ success: boolean; history: PriceHistory[] }>(
      `${API_BASE_URL}/api/products/${id}/history`
    );
    return data.history || [];
  },

  // Scrape runs & honest attempts
  async getProductRuns(id: string): Promise<ScrapeRun[]> {
    const data = await fetchJson<{ success: boolean; runs: ScrapeRun[] }>(
      `${API_BASE_URL}/api/products/${id}/runs`
    );
    return data.runs || [];
  },

  // Trigger manual scrape
  async triggerManualScrape(
    id: string,
    mode: 'headless' | 'headed' = 'headless'
  ): Promise<{ run: ScrapeRun; data: any; success: boolean }> {
    return await fetchJson<{ run: ScrapeRun; data: any; success: boolean }>(
      `${API_BASE_URL}/api/scrape/manual/${id}?mode=${mode}`,
      { method: 'POST' }
    );
  },

  // Health check
  async checkHealth(): Promise<{ status: string; uptimeSeconds: number }> {
    return await fetchJson<{ status: string; uptimeSeconds: number }>(
      `${API_BASE_URL}/api/health`
    );
  },
};
