import { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { TrackedProductCard } from './components/TrackedProductCard';
import { ProductSearchModal } from './components/ProductSearchModal';
import { ProductDetailModal } from './components/ProductDetailModal';
import { api } from './api/client';
import { ShoppingBag, RefreshCw } from 'lucide-react';

export function App() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [backendHealthy, setBackendHealthy] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);

  const loadProducts = useCallback(async () => {
    try {
      const prods = await api.getTrackedProducts(false);
      setProducts(prods);
      setBackendHealthy(true);
    } catch (err) {
      console.error('Failed to load tracked products:', err);
      setBackendHealthy(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const checkHealth = useCallback(async () => {
    try {
      await api.checkHealth();
      setBackendHealthy(true);
    } catch {
      setBackendHealthy(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
    checkHealth();

    const interval = setInterval(() => {
      loadProducts();
      checkHealth();
    }, 30000);

    return () => clearInterval(interval);
  }, [loadProducts, checkHealth]);

  const trackedStoreIds = new Set(products.map((p) => p.store_product_id));

  return (
    <div className="app-container">
      <Navbar
        backendHealthy={backendHealthy}
        onOpenSearch={() => setIsSearchOpen(true)}
      />

      <div className="page-header">
        <div>
          <h2 className="section-title">Tracked Products</h2>
          <p className="section-desc">
            Monitoring current price and stock levels on a 2-hour scheduled cycle with honest audit logging.
          </p>
        </div>

        <button
          className="btn btn-secondary btn-sm"
          onClick={loadProducts}
          title="Refresh products list"
        >
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
          <span>Refresh List</span>
        </button>
      </div>

      {loading ? (
        <div className="empty-state">
          <RefreshCw className="spin empty-icon" size={32} />
          <h3>Connecting to Price Tracker...</h3>
          <p>Fetching active tracked products and system status.</p>
        </div>
      ) : products.length === 0 ? (
        <div className="empty-state">
          <ShoppingBag className="empty-icon" size={44} />
          <h3>No Products Tracked Yet</h3>
          <p>
            Search INE's hosted mock store to track your first product and monitor price & stock changes over time.
          </p>
          <button className="btn btn-primary" onClick={() => setIsSearchOpen(true)}>
            Search & Track Product
          </button>
        </div>
      ) : (
        <div className="products-grid">
          {products.map((product) => (
            <TrackedProductCard
              key={product.id}
              product={product}
              onRefreshNeeded={loadProducts}
              onOpenDetails={(p) => setSelectedProduct(p)}
            />
          ))}
        </div>
      )}

      {/* Product Search & Track Modal */}
      <ProductSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onProductTracked={() => {
          loadProducts();
          setIsSearchOpen(false);
        }}
        trackedStoreIds={trackedStoreIds}
      />

      {/* Product Detail, Price History & Honest Scrape Audit Modal */}
      <ProductDetailModal
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
      />
    </div>
  );
}

export default App;
