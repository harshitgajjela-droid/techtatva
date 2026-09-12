import React from 'react'
import ExplanationSection from './ExplanationSection'

const fmt = (v, prefix = '₹', suffix = '') => {
  if (v == null || isNaN(v)) return '—'
  const abs = Math.abs(v)
  let s
  if (abs >= 1_00_000) s = (v / 1_00_000).toFixed(1) + 'L'
  else s = v.toLocaleString('en-IN', { maximumFractionDigits: 0 })
  return `${v < 0 ? '-' : ''}${prefix}${v < 0 ? s.replace('-', '') : s}${suffix}`
}

const fmtPct = v => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(2)}%`)

export default function SummarySection({ data, statusMeta }) {
  const k = data.kpis || {}
  const r = data.restructuring || {}
  const meta = statusMeta[data.status] || statusMeta.healthy

  const ratioCards = [
    { label: 'Avg Weekly Income', value: fmt(k.avg_weekly_income), help: 'Mean weekly income over 2-year history', bg: '#eff6ff', border: '#bfdbfe', labelColor: '#1d4ed8' },
    { label: 'Avg Weekly Expenses', value: fmt(k.avg_weekly_expenses), help: 'Mean weekly expenses over 2-year history', bg: '#fff7ed', border: '#fed7aa', labelColor: '#c2410c' },
    { label: 'Avg Net Cash Flow', value: fmt(k.avg_net_cashflow), help: 'Income − Expenses − Repayment per week', highlight: k.avg_net_cashflow >= 0 ? 'green' : 'red', bg: k.avg_net_cashflow >= 0 ? '#f0fdf4' : '#fef2f2', border: k.avg_net_cashflow >= 0 ? '#bbf7d0' : '#fca5a5', labelColor: k.avg_net_cashflow >= 0 ? '#15803d' : '#b91c1c' },
    { label: 'Negative CF Weeks', value: k.neg_cf_weeks_pct != null ? `${k.neg_cf_weeks_pct}%` : '—', help: 'Weeks where net cash flow went below zero', bg: '#fef2f2', border: '#fca5a5', labelColor: '#b91c1c' },
    { label: 'Trend Slope', value: fmtPct(k.trend_slope_pct), help: 'Monthly income trend as % of mean income. Negative = structural decline.', highlight: k.trend_slope_pct >= 0 ? 'green' : 'red', bg: '#faf5ff', border: '#e9d5ff', labelColor: '#6b21a8' },
    { label: 'Seasonal Strength', value: k.seasonal_strength != null ? k.seasonal_strength.toFixed(2) : '—', help: 'Fraction of net CF variance explained by seasonal pattern (0–1)', bg: '#ecfeff', border: '#a5f3fc', labelColor: '#0e7490' },
    { label: 'Same-Period Z-Score', value: k.same_period_z != null ? k.same_period_z.toFixed(2) : '—', help: 'How far current period is from its historical average. |z| < 1.5 = normal seasonal dip.', bg: '#f8fafc', border: '#cbd5e1', labelColor: '#334155' },
    { label: 'Forecast Neg Months', value: k.forecast_neg_months != null ? `${k.forecast_neg_months} / 6` : '—', help: 'Months in 6-month forecast with negative projected net cash flow', highlight: k.forecast_neg_months > 0 ? 'red' : 'green', bg: '#fff1f2', border: '#fecdd3', labelColor: '#be123c' },
    { label: 'Forecast Buffer Min', value: fmt(k.forecast_buffer_min), help: 'Minimum projected cumulative liquidity buffer over next 6 months', highlight: k.forecast_buffer_min >= 0 ? 'green' : 'red', bg: k.forecast_buffer_min >= 0 ? '#f0fdf4' : '#fef2f2', border: k.forecast_buffer_min >= 0 ? '#bbf7d0' : '#fca5a5', labelColor: k.forecast_buffer_min >= 0 ? '#15803d' : '#b91c1c' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Ratio grid — colorful KPI cards ── */}
      <Card title={`${data.name} — Key Metrics`}>
        <div style={styles.ratioGrid}>
          {ratioCards.map(rc => (
            <div key={rc.label} style={{
              ...styles.ratioItem,
              background: rc.bg,
              borderColor: rc.border,
            }} title={rc.help}>
              <div style={{ ...styles.ratioLabel, color: rc.labelColor }}>{rc.label}</div>
              <div style={{
                ...styles.ratioValue,
                color: rc.highlight === 'green' ? '#16a34a'
                  : rc.highlight === 'red' ? '#dc2626'
                    : '#0f172a',
              }}>
                {rc.value}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* ── Restructuring summary ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <Card title="Loan Details">
          <Table rows={[
            ['Loan Amount', `₹${data.loan_amount?.toLocaleString('en-IN')}`],
            ['Tenure', `${data.loan_tenure_months} months`],
            ['Loan Start', data.loan_start],
            ['Archetype', data.archetype?.charAt(0).toUpperCase() + data.archetype?.slice(1)],
            ['Seasonal Pattern', data.seasonal_pattern],
          ]} />
        </Card>

        <Card title="Repayment Assessment">
          <Table rows={[
            ['Status', <StatusPill key="s" status={data.status} meta={meta} />],
            ['Original Installment', `₹${r.original_installment?.toLocaleString('en-IN')}/month`],
            ['Proposed Installment', <span key="pi" style={{ fontWeight: 600, color: r.proposed_installment < r.original_installment ? '#d97706' : '#22a06b' }}>₹{r.proposed_installment?.toLocaleString('en-IN')}/month</span>],
            ['Original Tenure Remaining', `${r.original_tenure} months`],
            ['Proposed Tenure', `${r.proposed_tenure} months`],
          ]} />
        </Card>
      </div>

      {/* ── Pros / Cons — Screener style ── */}
      <ProsConsCard data={data} />

      {/* ── Explanation ── */}
      <ExplanationSection data={data} />
    </div>
  )
}

function ProsConsCard({ data }) {
  const k = data.kpis || {}
  const pros = []
  const cons = []

  if (k.avg_net_cashflow > 0) pros.push('Positive average net cash flow over 2-year history')
  if (k.trend_slope_pct > 0) pros.push(`Income trending upward at +${k.trend_slope_pct?.toFixed(2)}% per month`)
  if (k.seasonal_strength > 0.6) pros.push('Strong seasonal income pattern — dips are predictable and repeating')
  if (k.forecast_buffer_min > 0) pros.push('Projected liquidity buffer stays positive for the next 6 months')
  if (k.neg_cf_weeks_pct < 20) pros.push(`Only ${k.neg_cf_weeks_pct}% of weeks had negative cash flow`)

  if (k.avg_net_cashflow < 0) cons.push('Average net cash flow is negative over the historical period')
  if (k.trend_slope_pct < -0.5) cons.push(`Income declining at ${k.trend_slope_pct?.toFixed(2)}% per month — structural deterioration`)
  if (k.forecast_neg_months > 2) cons.push(`${k.forecast_neg_months} of the next 6 months are projected to have negative net cash flow`)
  if (k.forecast_buffer_min < 0) cons.push(`Projected cumulative buffer turns negative (₹${Math.round(k.forecast_buffer_min).toLocaleString('en-IN')}) in the forecast window`)
  if (k.neg_cf_weeks_pct > 30) cons.push(`${k.neg_cf_weeks_pct}% of historical weeks had negative cash flow`)
  if (Math.abs(k.same_period_z) > 2) cons.push(`Current period is ${Math.abs(k.same_period_z).toFixed(1)} standard deviations from historical average — unusual dip`)

  return (
    <Card title="Pros / Cons">
      <div style={{ fontSize: 11, color: '#888', marginBottom: 10 }}>
        Machine-generated based on cash-flow analysis. Exercise judgment before acting.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#22a06b', marginBottom: 6 }}>Pros</div>
          {pros.length
            ? pros.map((p, i) => <ProsCon key={i} text={p} type="pro" />)
            : <span style={{ color: '#aaa', fontSize: 12 }}>None identified</span>
          }
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#dc2626', marginBottom: 6 }}>Cons</div>
          {cons.length
            ? cons.map((c, i) => <ProsCon key={i} text={c} type="con" />)
            : <span style={{ color: '#aaa', fontSize: 12 }}>None identified</span>
          }
        </div>
      </div>
    </Card>
  )
}

function ProsCon({ text, type }) {
  return (
    <div style={{
      display: 'flex',
      gap: 8,
      marginBottom: 6,
      fontSize: 12,
      color: '#1a1a1a',
      alignItems: 'flex-start',
    }}>
      <span style={{ color: type === 'pro' ? '#22a06b' : '#dc2626', marginTop: 1, flexShrink: 0 }}>
        {type === 'pro' ? '✓' : '✗'}
      </span>
      <span>{text}</span>
    </div>
  )
}

export function Card({ title, children, action }) {
  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <span style={styles.cardTitle}>{title}</span>
        {action && <span style={styles.cardAction}>{action}</span>}
      </div>
      <div style={styles.cardBody}>{children}</div>
    </div>
  )
}

export function Table({ rows }) {
  return (
    <table style={styles.table}>
      <tbody>
        {rows.map(([label, value], i) => (
          <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
            <td style={styles.tdLabel}>{label}</td>
            <td style={styles.tdValue}>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function StatusPill({ status, meta }) {
  return (
    <span style={{
      fontSize: 11,
      fontWeight: 700,
      color: meta.color,
      background: meta.bg,
      border: `1px solid ${meta.color}44`,
      padding: '1px 8px',
      borderRadius: 10,
    }}>
      {meta.label}
    </span>
  )
}

const styles = {
  card: {
    background: '#fff',
    border: '1px solid #e0e0e0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  cardHeader: {
    padding: '9px 14px',
    borderBottom: '1px solid #efefef',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: '#fff',
  },
  cardTitle: { fontSize: 13, fontWeight: 700, color: '#1a1a1a' },
  cardAction: { fontSize: 12, color: '#1a73e8', cursor: 'pointer' },
  cardBody: { padding: '12px 14px' },

  ratioGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: 10,
  },
  ratioItem: {
    padding: '12px 14px',
    border: '1px solid #cbd5e1',
    borderRadius: 8,
    cursor: 'default',
  },
  ratioLabel: { fontSize: 11, fontWeight: 600, marginBottom: 5, lineHeight: 1.3 },
  ratioValue: { fontSize: 17, fontWeight: 800 },

  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  tdLabel: { padding: '6px 10px', color: '#555', width: '48%', borderBottom: '1px solid #f2f2f2' },
  tdValue: { padding: '6px 10px', fontWeight: 500, color: '#1a1a1a', borderBottom: '1px solid #f2f2f2' },
}
