const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { catalogRouter } = require('./routes/catalog.routes');
const { productsRouter } = require('./routes/products.routes');
const { scrapeRouter } = require('./routes/scrape.routes');
const { catalogService } = require('./services/catalogService');

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
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({
    success: false,
    error: err ? err.message : 'Internal Server Error',
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

    catalogService.refreshCatalog().then((items) => {
      console.log(`✅ Pre-warmed mock store catalog index: ${items.length} items loaded.`);
    }).catch((err) => {
      console.warn('⚠️ Could not pre-warm catalog on boot (will retry on first search):', err ? err.message : err);
    });
  });
}

module.exports = app;
