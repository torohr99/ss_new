'use client';

import { useState } from 'react';
import Sidebar from './Sidebar';
import RightSidebar from './RightSidebar';

export default function LayoutWrapper({ children }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className={`main-content-wrapper ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <div style={{ position: 'sticky', top: '64px', zIndex: 40, height: 'max-content', padding: '1rem 0 0 1rem', background: 'var(--secondary-bg)' }}>
        <button className="menu-toggle" onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
          ☰
        </button>
      </div>
      <Sidebar collapsed={sidebarCollapsed} />
      <main className="main-feed-area" style={{ transition: 'margin 0.3s' }}>
        {children}
      </main>
      <RightSidebar />
    </div>
  );
}
