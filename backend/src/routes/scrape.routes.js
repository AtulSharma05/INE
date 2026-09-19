const { Router } = require('express');
const { supabase } = require('../config/supabase');
const { inMemoryDb, scrapeService } = require('../services/scrapeService');

const scrapeRouter = Router();

// POST /api/scrape/manual/:productId - Trigger an immediate manual scrape
scrapeRouter.post('/manual/:productId', async (req, res) => {
  try {
    const productId = req.params.productId;
    const mode = req.query.mode === 'headed' ? 'headed' : 'headless';

    let product = null;

    if (supabase) {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .single();

      if (error || !data) {
        return res.status(404).json({ success: false, error: 'Product not found' });
      }
      product = data;
    } else {
      product = inMemoryDb.products.get(productId) || null;
      if (!product) {
        return res.status(404).json({ success: false, error: 'Product not found' });
      }
    }

    const { run, result } = await scrapeService.scrapeProduct(product, 'manual', mode);

    res.json({
      success: result.success,
      final_status: run.final_status,
      run,
      data: result.data || null,
      error: result.error || null,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err ? err.message : 'Manual scrape failed' });
  }
});

// POST /api/scrape/scheduled - Trigger scheduled scrape across all active products
scrapeRouter.post('/scheduled', async (req, res) => {
  try {
    const expectedSecret = process.env.CRON_SECRET;
    if (expectedSecret) {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.replace(/^Bearer\s+/i, '').trim();

      if (!token || token !== expectedSecret) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized: Invalid or missing CRON_SECRET token',
        });
      }
    }

    if (scrapeService.isBatchRunning()) {
      return res.status(409).json({
        success: false,
        status: 'already_running',
        message: 'A scheduled scrape batch is already in progress. Duplicate trigger avoided.',
      });
    }

    const outcome = await scrapeService.runScheduledBatch();

    if (outcome.status === 'already_running') {
      return res.status(409).json({
        success: false,
        status: 'already_running',
        message: 'A scheduled scrape batch is already in progress.',
      });
    }

    res.json({
      success: true,
      status: 'completed',
      summary: outcome,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err ? err.message : 'Scheduled scrape batch failed',
    });
  }
});

module.exports = { scrapeRouter };
