import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

import { catalogRouter } from './routes/catalog.routes';
import { productsRouter } from './routes/products.routes';
import { scrapeRouter } from './routes/scrape.routes';
import { catalogService } from './services/catalogService';

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint (for monitoring and Render readiness)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    environment: process.env.NODE_ENV || 'development',
  });
});

// Mount Routes
app.use('/api/catalog', catalogRouter);
app.use('/api/products', productsRouter);
app.use('/api/scrape', scrapeRouter);

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({
    success: false,
    error: err?.message || 'Internal Server Error',
  });
});

// Start Server
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`  INE Price Tracker Backend API listening on port ${PORT}`);
    console.log(`  Environment : ${process.env.NODE_ENV || 'development'}`);
    console.log(`  Health Check: http://localhost:${PORT}/api/health`);
    console.log(`====================================================`);

    // Pre-warm catalog cache in background for instant search
    catalogService.refreshCatalog().then((items) => {
      console.log(`✅ Pre-warmed mock store catalog index: ${items.length} items loaded.`);
    }).catch((err) => {
      console.warn('⚠️ Could not pre-warm catalog on boot (will retry on first search):', err?.message);
    });
  });
}

export default app;
