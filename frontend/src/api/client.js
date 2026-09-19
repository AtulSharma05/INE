const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001';

async function fetchJson(url, options) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options && options.headers),
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
  async searchCatalog(query = '', limit = 20) {
    const data = await fetchJson(
      `${API_BASE_URL}/api/catalog/search?q=${encodeURIComponent(query)}&limit=${limit}`
    );
    return data.items || [];
  },

  // Tracked products
  async getTrackedProducts(includeInactive = false) {
    const data = await fetchJson(
      `${API_BASE_URL}/api/products?includeInactive=${includeInactive}`
    );
    return data.products || [];
  },

  // Track product
  async trackProduct(storeProductId) {
    const data = await fetchJson(`${API_BASE_URL}/api/products/track`, {
      method: 'POST',
      body: JSON.stringify({ store_product_id: storeProductId }),
    });
    return data.product;
  },

  // Soft untrack
  async untrackProduct(id) {
    const data = await fetchJson(`${API_BASE_URL}/api/products/${id}`, {
      method: 'DELETE',
    });
    return data.product;
  },

  // Price & stock history
  async getProductHistory(id) {
    const data = await fetchJson(`${API_BASE_URL}/api/products/${id}/history`);
    return data.history || [];
  },

  // Scrape runs & honest attempts
  async getProductRuns(id) {
    const data = await fetchJson(`${API_BASE_URL}/api/products/${id}/runs`);
    return data.runs || [];
  },

  // Trigger manual scrape
  async triggerManualScrape(id, mode = 'headless') {
    return await fetchJson(
      `${API_BASE_URL}/api/scrape/manual/${id}?mode=${mode}`,
      { method: 'POST' }
    );
  },

  // Health check
  async checkHealth() {
    return await fetchJson(`${API_BASE_URL}/api/health`);
  },
};
