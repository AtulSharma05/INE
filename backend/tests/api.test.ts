import request from 'supertest';
import app from '../src/server';
import { scrapeService, inMemoryDb } from '../src/services/scrapeService';

describe('Backend REST API Tests', () => {
  beforeEach(() => {
    // Reset in-memory database between test cases
    inMemoryDb.products.clear();
    inMemoryDb.runs.clear();
    inMemoryDb.attempts.clear();
    inMemoryDb.history.clear();
  });

  describe('GET /api/health', () => {
    it('should return health status', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
      expect(res.body.timestamp).toBeDefined();
    });
  });

  describe('Catalog Endpoints', () => {
    it('should search products by query', async () => {
      const res = await request(app).get('/api/catalog/search?q=helix');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.items)).toBe(true);
    });

    it('should fetch product details by id', async () => {
      const res = await request(app).get('/api/catalog/products/886');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.product.id).toBe(886);
      expect(res.body.product.name).toContain('Helix');
    });
  });

  describe('Product Tracking & Soft Untrack', () => {
    it('should track a product and persist with internal UUID', async () => {
      const res = await request(app)
        .post('/api/products/track')
        .send({ store_product_id: '886' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.product.id).toBeDefined();
      expect(res.body.product.store_product_id).toBe('886');
      expect(res.body.product.is_active).toBe(true);
    });

    it('should list tracked products', async () => {
      await request(app).post('/api/products/track').send({ store_product_id: '886' });
      const res = await request(app).get('/api/products');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.products.length).toBe(1);
    });

    it('should soft-untrack product on DELETE (is_active = false, data preserved)', async () => {
      const trackRes = await request(app)
        .post('/api/products/track')
        .send({ store_product_id: '886' });
      const internalId = trackRes.body.product.id;

      // Untrack
      const deleteRes = await request(app).delete(`/api/products/${internalId}`);
      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.product.is_active).toBe(false);

      // Verify omitted from active products list
      const activeRes = await request(app).get('/api/products');
      expect(activeRes.body.products.length).toBe(0);

      // Verify present when including inactive (data preserved)
      const allRes = await request(app).get('/api/products?includeInactive=true');
      expect(allRes.body.products.length).toBe(1);
      expect(allRes.body.products[0].is_active).toBe(false);
    });
  });

  describe('Scheduled Scraping & Concurrency Guard', () => {
    it('should reject unauthorized scheduled triggers when CRON_SECRET is set', async () => {
      process.env.CRON_SECRET = 'super-secret-cron-token';

      const res = await request(app).post('/api/scrape/scheduled');
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Unauthorized');
    });

    it('should accept authorized scheduled trigger', async () => {
      process.env.CRON_SECRET = 'super-secret-cron-token';

      const res = await request(app)
        .post('/api/scrape/scheduled')
        .set('Authorization', 'Bearer super-secret-cron-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject concurrent scheduled batches with 409 Conflict', async () => {
      process.env.CRON_SECRET = 'super-secret-cron-token';

      // Mock isBatchRunning to return true
      jest.spyOn(scrapeService, 'isBatchRunning').mockReturnValueOnce(true);

      const res = await request(app)
        .post('/api/scrape/scheduled')
        .set('Authorization', 'Bearer super-secret-cron-token');

      expect(res.status).toBe(409);
      expect(res.body.status).toBe('already_running');
    });
  });
});
