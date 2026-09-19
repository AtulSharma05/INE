const { Router } = require('express');
const { catalogService } = require('../services/catalogService');

const catalogRouter = Router();

// GET /api/catalog/search?q=<query>&limit=20
catalogRouter.get('/search', async (req, res) => {
  try {
    const query = req.query.q || '';
    const limit = parseInt(req.query.limit || '20', 10);
    const items = await catalogService.searchCatalog(query, limit);
    res.json({ success: true, count: items.length, items });
  } catch (err) {
    res.status(500).json({ success: false, error: err ? err.message : 'Failed to search catalog' });
  }
});

// GET /api/catalog/products/:id
catalogRouter.get('/products/:id', async (req, res) => {
  try {
    const storeProductId = req.params.id;
    const details = await catalogService.getProductById(storeProductId);
    if (!details) {
      return res.status(404).json({ success: false, error: 'Product not found in mock store' });
    }
    res.json({ success: true, product: details });
  } catch (err) {
    res.status(500).json({ success: false, error: err ? err.message : 'Failed to fetch product details' });
  }
});

module.exports = { catalogRouter };
