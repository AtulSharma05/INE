class CatalogService {
  constructor() {
    this.cache = [];
    this.lastFetched = 0;
    this.isFetching = false;
    this.cacheTtlMs = 1000 * 60 * 30; // 30 minutes TTL
    this.baseUrl = process.env.MOCK_STORE_URL || 'https://demo.inelabteamdev.com';
  }

  /**
   * Initializes or refreshes the in-memory product catalog index.
   */
  async refreshCatalog() {
    if (this.isFetching) {
      return this.cache;
    }

    this.isFetching = true;
    try {
      const allItems = [];
      const pageSize = 60;
      let totalPages = 1;

      const firstUrl = `${this.baseUrl}/api/catalog?page=1&pageSize=${pageSize}`;
      const firstRes = await fetch(firstUrl);
      if (!firstRes.ok) {
        throw new Error(`Failed to fetch catalog page 1: ${firstRes.statusText}`);
      }

      const firstData = await firstRes.json();
      allItems.push(...(firstData.items || []));
      totalPages = firstData.pages || 1;

      const fetchPageWithRetry = async (pageNumber, maxRetries = 3) => {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            const res = await fetch(`${this.baseUrl}/api/catalog?page=${pageNumber}&pageSize=${pageSize}`);
            if (res.ok) {
              const data = await res.json();
              return data.items || [];
            }
          } catch {
            // Transient network error, retry
          }
          await new Promise((r) => setTimeout(r, attempt * 250));
        }
        return [];
      };

      // Fetch remaining pages with controlled batch concurrency (3 at a time) to prevent server throttling
      const batchSize = 3;
      for (let p = 2; p <= totalPages; p += batchSize) {
        const batchPromises = [];
        for (let i = p; i < Math.min(p + batchSize, totalPages + 1); i++) {
          batchPromises.push(fetchPageWithRetry(i));
        }
        const batchResults = await Promise.all(batchPromises);
        for (const items of batchResults) {
          allItems.push(...items);
        }
      }

      if (allItems.length > 0) {
        const map = new Map();
        for (const item of allItems) {
          map.set(item.id, item);
        }
        this.cache = Array.from(map.values());
        this.lastFetched = Date.now();
      }

      return this.cache;
    } finally {
      this.isFetching = false;
    }
  }

  /**
   * Ensures catalog cache is populated.
   */
  async getCatalog() {
    if (this.cache.length === 0 || Date.now() - this.lastFetched > this.cacheTtlMs) {
      await this.refreshCatalog();
    }
    return this.cache;
  }

  /**
   * Searches the mock store by partial or full name, brand, category, or SKU.
   */
  async searchCatalog(query, limit = 20) {
    const catalog = await this.getCatalog();
    if (!query || query.trim() === '') {
      return catalog.slice(0, limit);
    }

    const cleanQuery = query.trim().toLowerCase();

    if (/^\d+$/.test(cleanQuery)) {
      const matchById = catalog.find((item) => item.id.toString() === cleanQuery);
      if (matchById) return [matchById];

      const direct = await this.getProductById(cleanQuery);
      if (direct) return [direct];
    }

    const results = catalog.filter((item) => {
      const name = (item.name || '').toLowerCase();
      const brand = (item.brand || '').toLowerCase();
      const sku = (item.sku || '').toLowerCase();
      const category = (item.category || '').toLowerCase();

      return (
        name.includes(cleanQuery) ||
        sku.includes(cleanQuery) ||
        brand.includes(cleanQuery) ||
        category.includes(cleanQuery)
      );
    });

    return results.slice(0, limit);
  }

  /**
   * Directly fetches detailed product info from /api/product/:id
   */
  async getProductById(storeProductId) {
    try {
      const res = await fetch(`${this.baseUrl}/api/product/${storeProductId}`);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }
}

const catalogService = new CatalogService();

module.exports = {
  catalogService,
};
