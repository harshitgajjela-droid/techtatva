import React, { useState } from 'react'
import { useBorrowers, useBorrower } from './hooks/useApi'
import BorrowerPage from './components/BorrowerPage'

const STATUS_META = {
  healthy:         { label: 'Healthy',         color: '#15803d', bg: '#dcfce7', border: '#86efac' },
  seasonal_stress: { label: 'Seasonal Stress',  color: '#b45309', bg: '#fef3c7', border: '#fde047' },
  genuine_decline: { label: 'Genuine Decline',  color: '#b91c1c', bg: '#fee2e2', border: '#fca5a5' },
}

export default function App() {
  const [selectedId, setSelectedId] = useState('B001')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const { data: borrowers, loading: listLoading } = useBorrowers()
  const { data: borrower, loading: pageLoading }  = useBorrower(selectedId)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}>
      {/* ── Top navbar ── */}
      <header style={styles.topbar}>
        <div style={styles.topbarBrand}>
          <button
            onClick={() => setSidebarOpen(prev => !prev)}
            style={styles.hamburgerBtn}
            title={sidebarOpen ? "Retract Borrowers sidebar" : "Expand Borrowers sidebar"}
            aria-label="Toggle Borrowers Sidebar"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <span style={styles.brandName}>MicroLoan Manager</span>
        </div>
        <nav style={styles.topbarNav}>
          <span style={styles.navItem}>Portfolio</span>
        </nav>
      </header>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* ── Sidebar ── */}
        <aside style={{
          ...styles.sidebar,
          width: sidebarOpen ? 240 : 0,
          minWidth: sidebarOpen ? 240 : 0,
          opacity: sidebarOpen ? 1 : 0,
          pointerEvents: sidebarOpen ? 'auto' : 'none',
        }}>
          {sidebarOpen && (
            <>
              <div style={styles.sidebarSection}>
                <div style={styles.sidebarHeaderRow}>
                  <span style={styles.sidebarLabel}>BORROWERS</span>
                  <span style={styles.borrowerCountBadge}>{borrowers ? borrowers.length : 0}</span>
                </div>
                {listLoading && <div style={styles.sidebarMuted}>Loading…</div>}
                {borrowers && borrowers.map(b => {
                  const meta   = STATUS_META[b.status] || STATUS_META.healthy
                  const active = b.borrower_id === selectedId
                  return (
                    <button
                      key={b.borrower_id}
                      onClick={() => setSelectedId(b.borrower_id)}
                      style={{
                        ...styles.sidebarItem,
                        background: active ? '#e0e7ff' : 'transparent',
                        borderLeft: active ? '4px solid #4f46e5' : '4px solid transparent',
                      }}
                    >
                      <div style={styles.sidebarItemTop}>
                        <span style={{ fontWeight: active ? 700 : 500, color: active ? '#3730a3' : '#1e293b' }}>
                          {b.name}
                        </span>
                        <span style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: meta.color,
                          background: meta.bg,
                          border: `1px solid ${meta.border}`,
                          padding: '1px 7px',
                          borderRadius: 10,
                          marginLeft: 4,
                          whiteSpace: 'nowrap',
                        }}>
                          {meta.label}
                        </span>
                      </div>
                      <div style={{ color: '#64748b', fontSize: 11, marginTop: 3 }}>
                        {b.archetype.charAt(0).toUpperCase() + b.archetype.slice(1)} · {b.borrower_id}
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Portfolio summary */}
              {borrowers && (
                <div style={{ ...styles.sidebarSection, borderTop: '1px solid #e2e8f0', marginTop: 12, paddingTop: 12 }}>
                  <div style={styles.sidebarLabel}>PORTFOLIO SUMMARY</div>
                  {[
                    ['Total Borrowers', borrowers.length, '#3b82f6', '#dbeafe'],
                    ['Healthy', borrowers.filter(b => b.status === 'healthy').length, '#16a34a', '#dcfce7'],
                    ['Seasonal Stress', borrowers.filter(b => b.status === 'seasonal_stress').length, '#d97706', '#fef3c7'],
                    ['Genuine Decline', borrowers.filter(b => b.status === 'genuine_decline').length, '#dc2626', '#fee2e2'],
                  ].map(([label, val, dotColor, bgBadge]) => (
                    <div key={label} style={styles.sidebarStat}>
                      <span style={{ color: '#475569', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, display: 'inline-block' }} />
                        {label}
                      </span>
                      <span style={{ fontWeight: 700, color: dotColor, background: bgBadge, padding: '1px 8px', borderRadius: 10, fontSize: 11 }}>
                        {val}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </aside>

        {/* ── Main content ── */}
        <main style={styles.main}>
          {pageLoading
            ? <div style={styles.loadingFull}><span style={styles.spinner} /> Analysing borrower…</div>
            : borrower
              ? <BorrowerPage data={borrower} statusMeta={STATUS_META} sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen(prev => !prev)} />
              : null
          }
        </main>
      </div>
    </div>
  )
}

const styles = {
  topbar: {
    height: 54,
    borderBottom: '1px solid #c2410c',
    background: 'linear-gradient(90deg, #ea580c 0%, #d97706 60%, #eab308 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 20px',
    flexShrink: 0,
    zIndex: 10,
    boxShadow: '0 2px 6px rgba(194, 65, 12, 0.25)',
  },
  topbarBrand: { display: 'flex', alignItems: 'center', gap: 14 },
  hamburgerBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 34,
    height: 34,
    background: 'rgba(0, 0, 0, 0.15)',
    border: '1px solid rgba(255, 255, 255, 0.35)',
    borderRadius: 6,
    color: '#ffffff',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  brandName: { fontSize: 17, fontWeight: 800, color: '#ffffff', letterSpacing: '-0.2px', textShadow: '0 1px 2px rgba(0,0,0,0.15)' },
  topbarNav: { display: 'flex', gap: 20 },
  navItem: { fontSize: 12, fontWeight: 700, color: '#ffffff', background: 'rgba(0, 0, 0, 0.15)', padding: '4px 14px', borderRadius: 16, border: '1px solid rgba(255, 255, 255, 0.35)', cursor: 'default' },

  sidebar: {
    overflowY: 'auto',
    flexShrink: 0,
    background: '#f8fafc',
    borderRight: '1px solid #e2e8f0',
    paddingTop: 8,
    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
  },
  sidebarSection: { padding: '4px 0 8px' },
  sidebarHeaderRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 16px 8px' },
  sidebarLabel: { fontSize: 10, fontWeight: 700, color: '#64748b', letterSpacing: '0.8px' },
  borrowerCountBadge: { fontSize: 10, fontWeight: 700, background: '#e0e7ff', color: '#4338ca', padding: '1px 6px', borderRadius: 10 },
  sidebarMuted: { fontSize: 12, color: '#94a3b8', padding: '4px 16px' },
  sidebarItem: {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '8px 16px',
    border: 'none',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    fontSize: 12,
    lineHeight: 1.4,
  },
  sidebarItemTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 },
  sidebarStat: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '5px 16px',
    fontSize: 12,
  },

  main: {
    flex: 1,
    overflowY: 'auto',
    background: '#f1f5f9',
    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
  },
  loadingFull: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: 10,
    color: '#64748b',
    fontSize: 14,
  },
  spinner: {
    display: 'inline-block',
    width: 18,
    height: 18,
    border: '2px solid #cbd5e1',
    borderTopColor: '#4f46e5',
    borderRadius: '50%',
    animation: 'spin 0.7s linear infinite',
  },
}
