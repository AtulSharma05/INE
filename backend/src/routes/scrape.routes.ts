import { Router, Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { inMemoryDb, scrapeService } from '../services/scrapeService';
import { Product } from '../types';

export const scrapeRouter = Router();

// POST /api/scrape/manual/:productId - Trigger an immediate manual scrape
scrapeRouter.post('/manual/:productId', async (req: Request, res: Response) => {
  try {
    const productId = req.params.productId;
    const mode = (req.query.mode as string) === 'headed' ? 'headed' : 'headless';

    let product: Product | null = null;

    if (supabase) {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .single();

      if (error || !data) {
        return res.status(404).json({ success: false, error: 'Product not found' });
      }
      product = data as Product;
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
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Manual scrape failed' });
  }
});

// POST /api/scrape/scheduled - Trigger scheduled scrape across all active products
// Secured via CRON_SECRET Bearer token for cron-job.org
// Enforces Single-Flight Batch Mutex (409 if already in flight)
scrapeRouter.post('/scheduled', async (req: Request, res: Response) => {
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

    // Check if another scheduled batch is already running
    if (scrapeService.isBatchRunning()) {
      return res.status(409).json({
        success: false,
        status: 'already_running',
        message: 'A scheduled scrape batch is already in progress. Duplicate trigger avoided.',
      });
    }

    // Run batch with controlled concurrency
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
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err?.message || 'Scheduled scrape batch failed',
    });
  }
});
