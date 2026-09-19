import React, { useState } from 'react';
import { RefreshCw, History, Trash2, ExternalLink } from 'lucide-react';
import type { Product } from '../types';
import { api } from '../api/client';

interface TrackedProductCardProps {
  product: Product;
  onRefreshNeeded: () => void;
  onOpenDetails: (product: Product) => void;
}

export const TrackedProductCard: React.FC<TrackedProductCardProps> = ({
  product,
  onRefreshNeeded,
  onOpenDetails,
}) => {
  const [scraping, setScraping] = useState(false);
  const [untracking, setUntracking] = useState(false);

  const handleManualScrape = async () => {
    try {
      setScraping(true);
      await api.triggerManualScrape(product.id);
      onRefreshNeeded();
    } catch (err: any) {
      alert(`Scrape failed: ${err?.message || err}`);
    } finally {
      setScraping(false);
    }
  };

  const handleUntrack = async () => {
    if (!window.confirm(`Are you sure you want to stop tracking "${product.name}"? History and audit logs will be preserved.`)) {
      return;
    }
    try {
      setUntracking(true);
      await api.untrackProduct(product.id);
      onRefreshNeeded();
    } catch (err: any) {
      alert(`Untrack failed: ${err?.message || err}`);
    } finally {
      setUntracking(false);
    }
  };

  const formatPrice = (val: number | null, curr: string) => {
    if (val === null || val === undefined) return '—';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: curr || 'INR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  const formatLastScraped = (iso: string | null) => {
    if (!iso) return 'Never scraped';
    const date = new Date(iso);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' on ' + date.toLocaleDateString();
  };

  return (
    <div className="product-card">
      <div>
        <div className="card-top">
          <div className="card-badge-row">
            {product.category && <span className="badge badge-category">{product.category}</span>}
            {product.stock_status === 'in_stock' ? (
              <span className="badge badge-in-stock">
                In Stock {product.current_stock !== null ? `· ${product.current_stock} left` : ''}
              </span>
            ) : product.stock_status === 'out_of_stock' ? (
              <span className="badge badge-out-of-stock">Out of Stock</span>
            ) : (
              <span className="badge badge-unknown">Pending Scrape</span>
            )}
          </div>
          <span className="card-sku">{product.sku || `ID: ${product.store_product_id}`}</span>
        </div>

        <h3 className="product-name">{product.name}</h3>
        <p className="product-brand">{product.brand || 'INE Storefront'}</p>

        <div className="card-price-section">
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Current Price
            </div>
            <div className="current-price">
              {formatPrice(product.current_price, product.currency)}
            </div>
          </div>
          <a
            href={`https://demo.inelabteamdev.com/product/${product.store_product_id}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Open mock store product"
            style={{ color: 'var(--text-muted)', textDecoration: 'none' }}
          >
            <ExternalLink size={16} />
          </a>
        </div>
      </div>

      <div>
        <div className="card-footer">
          <span>{formatLastScraped(product.last_scraped_at)}</span>

          <div className="card-actions">
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => onOpenDetails(product)}
              title="View price history & honest scrape audit logs"
            >
              <History size={14} />
              <span>Audit</span>
            </button>

            <button
              className="btn btn-primary btn-sm"
              onClick={handleManualScrape}
              disabled={scraping}
              title="Scrape now"
            >
              <RefreshCw size={14} className={scraping ? 'spin' : ''} />
              <span>{scraping ? 'Scraping...' : 'Scrape'}</span>
            </button>

            <button
              className="btn btn-danger btn-sm"
              onClick={handleUntrack}
              disabled={untracking}
              title="Soft untrack (preserves history)"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
