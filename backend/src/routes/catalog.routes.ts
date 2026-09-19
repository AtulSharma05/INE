import { Router, Request, Response } from 'express';
import { catalogService } from '../services/catalogService';

export const catalogRouter = Router();

// GET /api/catalog/search?q=<query>&limit=20
catalogRouter.get('/search', async (req: Request, res: Response) => {
  try {
    const query = (req.query.q as string) || '';
    const limit = parseInt((req.query.limit as string) || '20', 10);
    const items = await catalogService.searchCatalog(query, limit);
    res.json({ success: true, count: items.length, items });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to search catalog' });
  }
});

// GET /api/catalog/products/:id
catalogRouter.get('/products/:id', async (req: Request, res: Response) => {
  try {
    const storeProductId = req.params.id;
    const details = await catalogService.getProductById(storeProductId);
    if (!details) {
      return res.status(404).json({ success: false, error: 'Product not found in mock store' });
    }
    res.json({ success: true, product: details });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch product details' });
  }
});
