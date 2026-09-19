const crypto = require('crypto');
const { Router } = require('express');
const { supabase } = require('../config/supabase');
const { inMemoryDb, scrapeService } = require('../services/scrapeService');
const { catalogService } = require('../services/catalogService');

const productsRouter = Router();

// GET /api/products - List tracked products
productsRouter.get('/', async (req, res) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';

    if (supabase) {
      let query = supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });

      if (!includeInactive) {
        query = query.eq('is_active', true);
      }

      const { data, error } = await query;
      if (error) throw error;
      return res.json({ success: true, products: data });
    }

    const all = Array.from(inMemoryDb.products.values());
    const filtered = includeInactive ? all : all.filter((p) => p.is_active);
    res.json({ success: true, products: filtered });
  } catch (err) {
    res.status(500).json({ success: false, error: err ? err.message : 'Failed to list products' });
  }
});

// POST /api/products/track - Add or reactivate product tracking
productsRouter.post('/track', async (req, res) => {
  try {
    const { store_product_id } = req.body;
    if (!store_product_id) {
      return res.status(400).json({ success: false, error: 'store_product_id is required' });
    }

    const details = await catalogService.getProductById(store_product_id.toString());
    const slug = details ? details.slug : `product-${store_product_id}`;
    const name = details ? details.name : `Product #${store_product_id}`;
    const brand = details ? details.brand : null;
    const category = details ? details.category : null;
    const sku = details ? details.sku : null;

    let product;

    if (supabase) {
      const { data: existing } = await supabase
        .from('products')
        .select('*')
        .eq('store_product_id', store_product_id.toString())
        .single();

      if (existing) {
        const { data: updated, error } = await supabase
          .from('products')
          .update({ is_active: true, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
          .select()
          .single();

        if (error) throw error;
        product = updated;
      } else {
        const { data: inserted, error } = await supabase
          .from('products')
          .insert({
            store_product_id: store_product_id.toString(),
            slug,
            name,
            brand,
            category,
            sku,
            is_active: true,
          })
          .select()
          .single();

        if (error) throw error;
        product = inserted;
      }
    } else {
      let existing = Array.from(inMemoryDb.products.values()).find(
        (p) => p.store_product_id === store_product_id.toString()
      );

      if (existing) {
        existing.is_active = true;
        existing.updated_at = new Date().toISOString();
        product = existing;
      } else {
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        product = {
          id,
          store_product_id: store_product_id.toString(),
          slug,
          name,
          brand,
          category,
          sku,
          current_price: null,
          currency: 'INR',
          current_stock: null,
          stock_status: 'unknown',
          is_active: true,
          last_scraped_at: null,
          created_at: now,
          updated_at: now,
        };
        inMemoryDb.products.set(id, product);
      }
    }

    // Trigger initial scrape asynchronously in the background so tracking completes promptly (omit during test runs)
    if (process.env.NODE_ENV !== 'test') {
      scrapeService.scrapeProduct(product, 'manual', 'headless').catch((e) => {
        console.error('Initial scrape error for product', product.id, e);
      });
    }

    res.status(201).json({
      success: true,
      message: 'Product tracked successfully. Initial scrape initiated.',
      product,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err ? err.message : 'Failed to track product' });
  }
});

// DELETE /api/products/:id - Soft untrack product (is_active = false)
// Preserves historical price records and audit logs for analysis
productsRouter.delete('/:id', async (req, res) => {
  try {
    const productId = req.params.id;

    if (supabase) {
      const { data, error } = await supabase
        .from('products')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', productId)
        .select()
        .single();

      if (error) throw error;
      if (!data) return res.status(404).json({ success: false, error: 'Product not found' });
      return res.json({
        success: true,
        message: 'Product untracked successfully (soft untrack). History and logs preserved.',
        product: data,
      });
    }

    const prod = inMemoryDb.products.get(productId);
    if (!prod) return res.status(404).json({ success: false, error: 'Product not found' });

    prod.is_active = false;
    prod.updated_at = new Date().toISOString();

    res.json({
      success: true,
      message: 'Product untracked successfully (soft untrack). History and logs preserved.',
      product: prod,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err ? err.message : 'Failed to untrack product' });
  }
});

// GET /api/products/:id/history - Price and stock history
productsRouter.get('/:id/history', async (req, res) => {
  try {
    const productId = req.params.id;

    if (supabase) {
      const { data, error } = await supabase
        .from('price_history')
        .select('*')
        .eq('product_id', productId)
        .order('scraped_at', { ascending: true });

      if (error) throw error;
      return res.json({ success: true, history: data || [] });
    }

    const history = inMemoryDb.history.get(productId) || [];
    res.json({ success: true, history });
  } catch (err) {
    res.status(500).json({ success: false, error: err ? err.message : 'Failed to fetch history' });
  }
});

// GET /api/products/:id/runs - Scrape runs with honest attempts audit log
productsRouter.get('/:id/runs', async (req, res) => {
  try {
    const productId = req.params.id;

    if (supabase) {
      const { data: runs, error: runsError } = await supabase
        .from('scrape_runs')
        .select('*')
        .eq('product_id', productId)
        .order('started_at', { ascending: false });

      if (runsError) throw runsError;

      const runIds = (runs || []).map((r) => r.id);
      let attempts = [];
      if (runIds.length > 0) {
        const { data: attData, error: attError } = await supabase
          .from('scrape_attempts')
          .select('*')
          .in('run_id', runIds)
          .order('attempt_number', { ascending: true });

        if (attError) throw attError;
        attempts = attData || [];
      }

      const attemptsByRun = new Map();
      for (const att of attempts) {
        const list = attemptsByRun.get(att.run_id) || [];
        list.push(att);
        attemptsByRun.set(att.run_id, list);
      }

      const enrichedRuns = (runs || []).map((r) => ({
        ...r,
        attempts: attemptsByRun.get(r.id) || [],
      }));

      return res.json({ success: true, runs: enrichedRuns });
    }

    const allRuns = Array.from(inMemoryDb.runs.values())
      .filter((r) => r.product_id === productId)
      .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());

    const enrichedRuns = allRuns.map((r) => ({
      ...r,
      attempts: inMemoryDb.attempts.get(r.id) || [],
    }));

    res.json({ success: true, runs: enrichedRuns });
  } catch (err) {
    res.status(500).json({ success: false, error: err ? err.message : 'Failed to fetch runs' });
  }
});

module.exports = { productsRouter };
