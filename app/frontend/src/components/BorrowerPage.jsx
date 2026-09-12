import React, { useState } from 'react'
import SummarySection from './SummarySection'
import ChartsSection from './ChartsSection'
import RepaymentSection from './RepaymentSection'
import ExplanationSection from './ExplanationSection'

const TABS = ['Summary', 'Cash Flow', 'Decomposition', 'Forecast', 'Repayment Plan']

export default function BorrowerPage({ data, statusMeta }) {
  const [activeTab, setActiveTab] = useState('Summary')

  return (
    <div style={{ padding: '20px' }}>
      {/* ── Page header ── */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.titleRow}>
            <h1 style={styles.title}>{data.name}</h1>
            <StatusBadge status={data.status} meta={statusMeta[data.status] || statusMeta.healthy} />
          </div>
          <div style={styles.subtitleRow}>
            <span style={{ ...styles.pillTag, background: '#f3e8ff', color: '#6b21a8', borderColor: '#e9d5ff' }}>
              {data.archetype.charAt(0).toUpperCase() + data.archetype.slice(1)}
            </span>
            <span style={{ ...styles.pillTag, background: '#f1f5f9', color: '#334155', borderColor: '#cbd5e1' }}>
              ID: {data.borrower_id}
            </span>
            <span style={{ ...styles.pillTag, background: '#dbeafe', color: '#1e40af', borderColor: '#bfdbfe' }}>
              Loan: ₹{data.loan_amount?.toLocaleString('en-IN')}
            </span>
            <span style={{ ...styles.pillTag, background: '#fef3c7', color: '#92400e', borderColor: '#fde68a' }}>
              ₹{data.monthly_installment?.toLocaleString('en-IN')}/mo
            </span>
            <span style={{ ...styles.pillTag, background: '#e0e7ff', color: '#3730a3', borderColor: '#c7d2fe' }}>
              {data.loan_tenure_months} Mo Tenure
            </span>
          </div>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div style={styles.tabBarContainer}>
        <div style={styles.tabBar}>
          {TABS.map(t => {
            const isActive = activeTab === t
            return (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                style={{
                  ...styles.tab,
                  background: isActive ? '#4f46e5' : '#f1f5f9',
                  color: isActive ? '#ffffff' : '#475569',
                  fontWeight: isActive ? 600 : 500,
                  boxShadow: isActive ? '0 2px 6px rgba(79, 70, 229, 0.35)' : 'none',
                }}
              >
                {t}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Tab content ── */}
      <div style={styles.content}>
        {activeTab === 'Summary' && <SummarySection data={data} statusMeta={statusMeta} />}
        {activeTab === 'Cash Flow' && <ChartsSection data={data} view="cashflow" />}
        {activeTab === 'Decomposition' && <ChartsSection data={data} view="decomposition" />}
        {activeTab === 'Forecast' && <ChartsSection data={data} view="forecast" />}
        {activeTab === 'Repayment Plan' && <RepaymentSection data={data} />}
      </div>
    </div>
  )
}

function StatusBadge({ status, meta }) {
  return (
    <span style={{
      fontSize: 12,
      fontWeight: 700,
      color: meta.color,
      background: meta.bg,
      border: `1px solid ${meta.border || (meta.color + '44')}`,
      padding: '4px 14px',
      borderRadius: 20,
      letterSpacing: '0.2px',
      boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
    }}>
      {status === 'genuine_decline' ? '⚠ ' : ''}{meta.label}
    </span>
  )
}

const styles = {
  header: {
    background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
    border: '1px solid #cbd5e1',
    borderRadius: 12,
    padding: '20px 24px',
    marginBottom: 16,
    boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
  },
  headerLeft: {},
  titleRow: { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10, flexWrap: 'wrap' },
  title: { fontSize: 24, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.4px', margin: 0 },
  subtitleRow: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  pillTag: {
    fontSize: 11,
    fontWeight: 600,
    padding: '4px 12px',
    borderRadius: 14,
    border: '1px solid transparent',
  },

  tabBarContainer: {
    marginBottom: 20,
  },
  tabBar: {
    background: '#ffffff',
    border: '1px solid #cbd5e1',
    borderRadius: 10,
    display: 'flex',
    gap: 6,
    padding: '6px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
  },
  tab: {
    border: 'none',
    padding: '9px 18px',
    fontSize: 13,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    whiteSpace: 'nowrap',
    borderRadius: 8,
  },

  content: { paddingTop: 4 },
}
