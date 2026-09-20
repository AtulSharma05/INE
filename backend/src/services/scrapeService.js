const crypto = require('crypto');
const pLimit = require('p-limit');
const { supabase } = require('../config/supabase');
const { scrapeProductWithRetries } = require('../scrapers/playwrightScraper');

// In-memory fallback store when Supabase credentials are not yet configured
class InMemoryStore {
  constructor() {
    this.products = new Map();
    this.runs = new Map();
    this.attempts = new Map();
    this.history = new Map();
  }
}

const inMemoryDb = new InMemoryStore();

class ScrapeService {
  constructor() {
    this.isScheduledBatchRunning = false;
    this.concurrencyLimit = parseInt(process.env.SCRAPE_CONCURRENCY || '2', 10);
  }

  /**
   * Checks if a scheduled batch is already running.
   */
  isBatchRunning() {
    return this.isScheduledBatchRunning;
  }

  /**
   * Executes a scrape run for a single tracked product.
   */
  async scrapeProduct(product, triggerSource = 'manual', executionMode = 'headless') {
    const runId = crypto.randomUUID();
    const startedAt = new Date().toISOString();

    const scrapeRun = {
      id: runId,
      product_id: product.id,
      started_at: startedAt,
      finished_at: null,
      final_status: 'running',
      total_attempts: 0,
      execution_mode: executionMode,
      trigger_source: triggerSource,
      created_at: startedAt,
    };

    // 1. Insert scrape_runs record
    if (supabase) {
      await supabase.from('scrape_runs').insert({
        id: scrapeRun.id,
        product_id: scrapeRun.product_id,
        started_at: scrapeRun.started_at,
        final_status: 'running',
        execution_mode: scrapeRun.execution_mode,
        trigger_source: scrapeRun.trigger_source,
      });
    } else {
      inMemoryDb.runs.set(scrapeRun.id, scrapeRun);
    }

    // 2. Execute Playwright scraper with retries
    let result;
    try {
      result = await scrapeProductWithRetries(product.store_product_id, {
        headless: executionMode === 'headless',
        slowMo: executionMode === 'headed' ? 500 : 0,
        maxAttempts: 3,
      });
    } catch (err) {
      result = {
        success: false,
        final_status: 'failed',
        total_attempts: 1,
        attempts: [
          {
            attempt_number: 1,
            status: 'failed',
            http_status: null,
            response_time_ms: Date.now() - new Date(startedAt).getTime(),
            error_message: err ? err.message || String(err) : 'Fatal execution error',
            timestamp: new Date().toISOString(),
          },
        ],
        error: err ? err.message : 'Fatal execution error',
      };
    }

    const finishedAt = new Date().toISOString();
    scrapeRun.finished_at = finishedAt;
    scrapeRun.final_status = result.final_status;
    scrapeRun.total_attempts = result.total_attempts;

    // 3. Persist each individual attempt honestly in scrape_attempts
    const attemptRecords = (result.attempts || []).map((att) => ({
      id: crypto.randomUUID(),
      run_id: runId,
      attempt_number: att.attempt_number,
      status: att.status,
      http_status: att.http_status,
      response_time_ms: att.response_time_ms,
      error_message: att.error_message,
      timestamp: att.timestamp,
    }));

    if (supabase) {
      if (attemptRecords.length > 0) {
        await supabase.from('scrape_attempts').insert(attemptRecords);
      }

      await supabase
        .from('scrape_runs')
        .update({
          finished_at: finishedAt,
          final_status: result.final_status,
          total_attempts: result.total_attempts,
        })
        .eq('id', runId);
    } else {
      inMemoryDb.attempts.set(runId, attemptRecords);
      inMemoryDb.runs.set(runId, { ...scrapeRun, attempts: attemptRecords });
    }

    // 4. Zero-Pollution Data Invariant Enforcement:
    // Only insert into price_history if both price > 0 and stock >= 0
    if (result.success && result.data && result.data.price > 0 && result.data.stock >= 0) {
      const historyRecord = {
        id: crypto.randomUUID(),
        product_id: product.id,
        run_id: runId,
        price: result.data.price,
        currency: result.data.currency,
        stock: result.data.stock,
        stock_status: result.data.stock_status,
        scraped_at: finishedAt,
      };

      if (supabase) {
        await supabase.from('price_history').insert({
          id: historyRecord.id,
          product_id: historyRecord.product_id,
          run_id: historyRecord.run_id,
          price: historyRecord.price,
          currency: historyRecord.currency,
          stock: historyRecord.stock,
          stock_status: historyRecord.stock_status,
          scraped_at: historyRecord.scraped_at,
        });

        await supabase
          .from('products')
          .update({
            current_price: result.data.price,
            current_stock: result.data.stock,
            currency: result.data.currency,
            stock_status: result.data.stock_status,
            last_scraped_at: finishedAt,
            updated_at: finishedAt,
          })
          .eq('id', product.id);
      } else {
        const prodHistory = inMemoryDb.history.get(product.id) || [];
        prodHistory.push(historyRecord);
        inMemoryDb.history.set(product.id, prodHistory);

        const storedProd = inMemoryDb.products.get(product.id);
        if (storedProd) {
          storedProd.current_price = result.data.price;
          storedProd.current_stock = result.data.stock;
          storedProd.currency = result.data.currency;
          storedProd.stock_status = result.data.stock_status;
          storedProd.last_scraped_at = finishedAt;
          storedProd.updated_at = finishedAt;
        }
      }
    } else {
      console.warn(
        `[ZERO-POLLUTION] Run ${runId} for product ${product.name} did not yield valid price/stock. No price_history row written.`
      );
    }

    scrapeRun.attempts = attemptRecords;
    return { run: scrapeRun, result };
  }

  /**
   * Executes scheduled scrape for all active tracked products.
   * Guarded by single-flight batch mutex and controlled concurrency.
   */
  async runScheduledBatch() {
    if (this.isScheduledBatchRunning) {
      return { status: 'already_running' };
    }

    this.isScheduledBatchRunning = true;
    try {
      let activeProducts = [];

      if (supabase) {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .eq('is_active', true);

        if (!error && data) {
          activeProducts = data;
        }
      } else {
        activeProducts = Array.from(inMemoryDb.products.values()).filter((p) => p.is_active);
      }

      if (activeProducts.length === 0) {
        return {
          status: 'completed',
          totalProducts: 0,
          successCount: 0,
          failureCount: 0,
        };
      }

      const limit = pLimit(this.concurrencyLimit);
      let successCount = 0;
      let failureCount = 0;

      const tasks = activeProducts.map((prod) =>
        limit(async () => {
          try {
            const { run } = await this.scrapeProduct(prod, 'scheduled', 'headless');
            if (run.final_status === 'success') {
              successCount++;
            } else {
              failureCount++;
            }
          } catch {
            failureCount++;
          }
        })
      );

      await Promise.all(tasks);

      return {
        status: 'completed',
        totalProducts: activeProducts.length,
        successCount,
        failureCount,
      };
    } finally {
      this.isScheduledBatchRunning = false;
    }
  }
}

const scrapeService = new ScrapeService();

module.exports = {
  inMemoryDb,
  scrapeService,
};
