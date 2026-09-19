import React, { useState, useEffect } from 'react';
import { X, TrendingUp, ShieldAlert, ChevronDown, ChevronRight, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import type { Product, PriceHistory, ScrapeRun } from '../types';
import { api } from '../api/client';

interface ProductDetailModalProps {
  product: Product | null;
  onClose: () => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({ product, onClose }) => {
  const [activeTab, setActiveTab] = useState<'history' | 'logs'>('history');
  const [history, setHistory] = useState<PriceHistory[]>([]);
  const [runs, setRuns] = useState<ScrapeRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRunIds, setExpandedRunIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!product) return;

    let cancel = false;
    setLoading(true);

    Promise.all([
      api.getProductHistory(product.id),
      api.getProductRuns(product.id),
    ])
      .then(([histData, runsData]) => {
        if (!cancel) {
          setHistory(histData);
          setRuns(runsData);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancel) {
          console.error(err);
          setLoading(false);
        }
      });

    return () => {
      cancel = true;
    };
  }, [product]);

  if (!product) return null;

  const toggleExpandRun = (runId: string) => {
    setExpandedRunIds((prev) => {
      const next = new Set(prev);
      if (next.has(runId)) next.delete(runId);
      else next.add(runId);
      return next;
    });
  };

  const formatPrice = (val: number, curr: string) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: curr || 'INR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  // Render SVG timeseries chart
  const renderHistoryChart = () => {
    if (history.length === 0) {
      return (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
          No historical price points recorded yet. Trigger a scrape to record the first point.
        </div>
      );
    }

    const width = 850;
    const height = 220;
    const padding = { top: 25, right: 30, bottom: 35, left: 60 };

    const prices = history.map((h) => h.price);
    const minPrice = Math.min(...prices) * 0.95;
    const maxPrice = Math.max(...prices) * 1.05 || minPrice + 100;

    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const points = history.map((h, i) => {
      const x = padding.left + (history.length === 1 ? chartW / 2 : (i / (history.length - 1)) * chartW);
      const y = padding.top + chartH - ((h.price - minPrice) / (maxPrice - minPrice)) * chartH;
      return { x, y, price: h.price, stock: h.stock, date: new Date(h.scraped_at) };
    });

    const pathD =
      points.length === 1
        ? `M ${padding.left} ${points[0].y} L ${width - padding.right} ${points[0].y}`
        : points.reduce((acc, pt, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`, '');

    return (
      <div className="chart-container">
        <div className="chart-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TrendingUp size={18} color="var(--accent-primary)" />
            <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>Price & Stock Trend</span>
          </div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {history.length} verified sample point{history.length > 1 ? 's' : ''}
          </span>
        </div>

        <svg viewBox={`0 0 ${width} ${height}`} className="custom-chart-svg">
          {/* Background Grid */}
          <line
            x1={padding.left}
            y1={padding.top}
            x2={width - padding.right}
            y2={padding.top}
            stroke="rgba(255,255,255,0.06)"
            strokeDasharray="4 4"
          />
          <line
            x1={padding.left}
            y1={padding.top + chartH / 2}
            x2={width - padding.right}
            y2={padding.top + chartH / 2}
            stroke="rgba(255,255,255,0.06)"
            strokeDasharray="4 4"
          />
          <line
            x1={padding.left}
            y1={padding.top + chartH}
            x2={width - padding.right}
            y2={padding.top + chartH}
            stroke="rgba(255,255,255,0.12)"
          />

          {/* Y Axis Labels */}
          <text x={padding.left - 8} y={padding.top + 4} fill="var(--text-muted)" fontSize="11" textAnchor="end">
            ₹{Math.round(maxPrice)}
          </text>
          <text x={padding.left - 8} y={padding.top + chartH + 4} fill="var(--text-muted)" fontSize="11" textAnchor="end">
            ₹{Math.round(minPrice)}
          </text>

          {/* Line Path */}
          <path d={pathD} fill="none" stroke="var(--accent-primary)" strokeWidth="2.5" strokeLinecap="round" />

          {/* Dots */}
          {points.map((pt, i) => (
            <g key={i}>
              <circle cx={pt.x} cy={pt.y} r="5" fill="var(--accent-primary)" stroke="#0b0f19" strokeWidth="2" />
              <text x={pt.x} y={pt.y - 10} fill="#f3f4f6" fontSize="10" fontWeight="600" textAnchor="middle">
                ₹{pt.price}
              </text>
              <text x={pt.x} y={height - 12} fill="var(--text-muted)" fontSize="10" textAnchor="middle">
                {pt.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </text>
            </g>
          ))}
        </svg>
      </div>
    );
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title">{product.name}</h2>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 2 }}>
              SKU: {product.sku || 'N/A'} · Store Product ID: {product.store_product_id}
            </div>
          </div>
          <button className="btn-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div className="tabs-nav">
            <button
              className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
              onClick={() => setActiveTab('history')}
            >
              Price & Stock History ({history.length})
            </button>
            <button
              className={`tab-btn ${activeTab === 'logs' ? 'active' : ''}`}
              onClick={() => setActiveTab('logs')}
            >
              Scrape Runs & Attempts ({runs.length})
            </button>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '50px 0', color: 'var(--text-muted)' }}>
              <Loader2 className="spin" size={32} style={{ margin: '0 auto 10px' }} />
              <p>Loading historical records and audit logs...</p>
            </div>
          ) : activeTab === 'history' ? (
            <div>
              {renderHistoryChart()}

              <h4 style={{ fontSize: '0.95rem', marginBottom: 12, fontWeight: 600 }}>
                Verified History Records (Zero-Pollution Validated)
              </h4>

              <div className="audit-table-wrapper">
                <table className="audit-table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Price</th>
                      <th>Stock Level</th>
                      <th>Status</th>
                      <th>Run ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                          No price records available
                        </td>
                      </tr>
                    ) : (
                      history.map((h) => (
                        <tr key={h.id}>
                          <td>{new Date(h.scraped_at).toLocaleString()}</td>
                          <td style={{ fontWeight: 600 }}>{formatPrice(h.price, h.currency)}</td>
                          <td>{h.stock} units</td>
                          <td>
                            <span
                              className={`badge ${
                                h.stock_status === 'in_stock' ? 'badge-in-stock' : 'badge-out-of-stock'
                              }`}
                            >
                              {h.stock_status === 'in_stock' ? 'In Stock' : 'Out of Stock'}
                            </span>
                          </td>
                          <td style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {h.run_id.slice(0, 8)}...
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <ShieldAlert size={18} color="var(--status-warn-text)" />
                <span style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                  Honest audit trail showing each scrape attempt, retry counts, HTTP codes, and exact error responses.
                </span>
              </div>

              <div className="audit-table-wrapper">
                <table className="audit-table">
                  <thead>
                    <tr>
                      <th style={{ width: 30 }}></th>
                      <th>Started At</th>
                      <th>Final Status</th>
                      <th>Attempts</th>
                      <th>Execution Mode</th>
                      <th>Trigger</th>
                      <th>Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                          No scrape runs recorded yet.
                        </td>
                      </tr>
                    ) : (
                      runs.map((run) => {
                        const isExpanded = expandedRunIds.has(run.id);
                        const durationSec = run.finished_at
                          ? ((new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) / 1000).toFixed(1)
                          : '—';

                        return (
                          <React.Fragment key={run.id}>
                            <tr className="run-row" onClick={() => toggleExpandRun(run.id)}>
                              <td>
                                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                              </td>
                              <td>{new Date(run.started_at).toLocaleString()}</td>
                              <td>
                                <span
                                  className={`badge ${
                                    run.final_status === 'success'
                                      ? 'badge-in-stock'
                                      : run.final_status === 'running'
                                      ? 'badge-unknown'
                                      : 'badge-out-of-stock'
                                  }`}
                                >
                                  {run.final_status.toUpperCase()}
                                </span>
                              </td>
                              <td style={{ fontWeight: 600 }}>{run.total_attempts}</td>
                              <td>
                                <span style={{ textTransform: 'capitalize' }}>{run.execution_mode}</span>
                              </td>
                              <td>
                                <span style={{ textTransform: 'capitalize' }}>{run.trigger_source}</span>
                              </td>
                              <td>{durationSec !== '—' ? `${durationSec}s` : 'running...'}</td>
                            </tr>

                            {isExpanded && (
                              <tr>
                                <td colSpan={7} style={{ padding: '0 14px 14px 14px', background: 'rgba(0,0,0,0.2)' }}>
                                  <div className="attempts-detail-box">
                                    <div style={{ fontWeight: 600, fontSize: '0.82rem', marginBottom: 8, color: 'var(--text-secondary)' }}>
                                      Attempt Breakdown ({run.attempts?.length || 0} attempts recorded):
                                    </div>

                                    {!run.attempts || run.attempts.length === 0 ? (
                                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                        No attempt records found for this run.
                                      </div>
                                    ) : (
                                      run.attempts.map((att) => (
                                        <div key={att.id} style={{ marginBottom: 6 }}>
                                          <div className="attempt-line">
                                            {att.status === 'success' ? (
                                              <CheckCircle2 size={15} color="var(--status-success-text)" />
                                            ) : (
                                              <AlertCircle size={15} color="var(--status-error-text)" />
                                            )}
                                            <span style={{ fontWeight: 600 }}>Attempt #{att.attempt_number}</span>
                                            <span
                                              className={`badge ${
                                                att.status === 'success' ? 'badge-in-stock' : 'badge-out-of-stock'
                                              }`}
                                            >
                                              {att.status.toUpperCase()}
                                            </span>
                                            <span>HTTP: {att.http_status ?? 'N/A'}</span>
                                            <span>Latency: {att.response_time_ms}ms</span>
                                            <span style={{ color: 'var(--text-muted)' }}>
                                              {new Date(att.timestamp).toLocaleTimeString()}
                                            </span>
                                          </div>
                                          {att.error_message && (
                                            <div className="attempt-error">
                                              ↳ Error: {att.error_message}
                                            </div>
                                          )}
                                        </div>
                                      ))
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
