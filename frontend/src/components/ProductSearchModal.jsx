import React, { useState, useEffect } from 'react';
import { Search, X, Loader2, Plus, Check } from 'lucide-react';
import { api } from '../api/client';

export function ProductSearchModal({
  isOpen,
  onClose,
  onProductTracked,
  trackedStoreIds,
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [trackingId, setTrackingId] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen) return;

    let cancel = false;
    setLoading(true);
    setError(null);

    const timer = setTimeout(() => {
      api
        .searchCatalog(query, 25)
        .then((items) => {
          if (!cancel) {
            setResults(items);
            setLoading(false);
          }
        })
        .catch((err) => {
          if (!cancel) {
            setError(err ? err.message : 'Failed to search store');
            setLoading(false);
          }
        });
    }, 250);

    return () => {
      cancel = true;
      clearTimeout(timer);
    };
  }, [query, isOpen]);

  if (!isOpen) return null;

  const handleTrack = async (item) => {
    try {
      setTrackingId(item.id);
      await api.trackProduct(item.id.toString());
      onProductTracked();
    } catch (err) {
      alert(`Error tracking product: ${err ? err.message : err}`);
    } finally {
      setTrackingId(null);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Search INE Mock Store</h2>
          <button className="btn-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div className="search-box">
            <Search className="search-icon" size={18} />
            <input
              type="text"
              className="search-input"
              placeholder="Search by full or partial product name, brand, or SKU (e.g. Helix, Turntable, Mouse)..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>

          {error && <div style={{ color: 'var(--status-error-text)', marginBottom: 12 }}>{error}</div>}

          {loading ? (
            <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)' }}>
              <Loader2 className="spin" size={28} style={{ margin: '0 auto 8px' }} />
              <p>Searching mock storefront catalog...</p>
            </div>
          ) : results.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)' }}>
              No products found matching "{query}"
            </div>
          ) : (
            <div className="search-results-list">
              {results.map((item) => {
                const isTracked = trackedStoreIds.has(item.id.toString());
                const isCurrentTracking = trackingId === item.id;

                return (
                  <div key={item.id} className="search-item">
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span className="badge badge-category">{item.category}</span>
                        <span className="card-sku">SKU {item.sku}</span>
                      </div>
                      <div style={{ fontWeight: 600, fontSize: '0.98rem' }}>{item.name}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{item.brand}</div>
                    </div>

                    <button
                      className={`btn btn-sm ${isTracked ? 'btn-secondary' : 'btn-primary'}`}
                      disabled={isTracked || isCurrentTracking}
                      onClick={() => handleTrack(item)}
                    >
                      {isCurrentTracking ? (
                        <Loader2 size={14} className="spin" />
                      ) : isTracked ? (
                        <>
                          <Check size={14} />
                          <span>Tracked</span>
                        </>
                      ) : (
                        <>
                          <Plus size={14} />
                          <span>Track</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
