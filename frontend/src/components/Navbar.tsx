import React from 'react';
import { Plus, Server } from 'lucide-react';

interface NavbarProps {
  backendHealthy: boolean;
  onOpenSearch: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ backendHealthy, onOpenSearch }) => {
  return (
    <nav className="navbar">
      <div className="nav-brand">
        <div className="nav-logo-icon">INE</div>
        <div>
          <h1 className="nav-title">Product Price Tracker</h1>
          <p className="nav-subtitle">Scheduled Web Scraping & Historical Audit</p>
        </div>
      </div>

      <div className="nav-actions">
        <div className="backend-indicator" title={backendHealthy ? 'Backend API online' : 'Backend API unreachable'}>
          <Server size={14} />
          <span>API</span>
          <div className={`dot-pulse ${backendHealthy ? '' : 'offline'}`} />
        </div>

        <button className="btn btn-primary" onClick={onOpenSearch}>
          <Plus size={16} />
          <span>Track Product</span>
        </button>
      </div>
    </nav>
  );
};
