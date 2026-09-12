import React, { useMemo } from 'react'
import {
  ComposedChart, LineChart, BarChart,
  Line, Bar, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ReferenceLine, ResponsiveContainer,
  ReferenceArea,
} from 'recharts'
import { Card } from './SummarySection'

/* ── Shared formatting ── */
const inr = v => v == null ? '—' : `₹${Math.round(v).toLocaleString('en-IN')}`
const shortDate = s => {
  if (!s) return ''
  const d = new Date(s)
  return d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
}
const tickEveryN = (data, n) => data.map((d, i) => ({ ...d, _show: i % n === 0 }))

const COLORS = {
  income:   '#1a73e8',
  expenses: '#f59e0b',
  netCF:    '#22a06b',
  netNeg:   '#dc2626',
  trend:    '#7c3aed',
  seasonal: '#0891b2',
  residual: '#6b7280',
  forecast: '#dc2626',
  ci:       '#fecaca',
  buffer:   '#22a06b',
  bufNeg:   '#dc2626',
}

/* ── Tooltip ── */
function ScTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#fff', border: '1px solid #e0e0e0', padding: '8px 12px',
      borderRadius: 4, fontSize: 12, boxShadow: '0 2px 8px rgba(0,0,0,.08)',
    }}>
      <div style={{ fontWeight: 600, marginBottom: 4, color: '#333' }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || '#333', marginBottom: 2 }}>
          {p.name}: {inr(p.value)}
        </div>
      ))}
    </div>
  )
}

/* ────────────────────────────────────────────
   VIEW: Cash Flow (weekly income / expenses / net)
──────────────────────────────────────────── */
function CashFlowView({ data }) {
  const weekly = useMemo(() => {
    const raw = data.cashflow || []
    return raw.map(r => ({
      ...r,
      dateLabel: shortDate(r.date),
      net_pos: r.net_cashflow >= 0 ? r.net_cashflow : 0,
      net_neg: r.net_cashflow < 0  ? r.net_cashflow : 0,
    }))
  }, [data])

  const thinned = useMemo(() => tickEveryN(weekly, 8), [weekly])

  // KPI row
  const avgIncome   = weekly.reduce((s, r) => s + r.income, 0) / (weekly.length || 1)
  const avgExpenses = weekly.reduce((s, r) => s + r.expenses, 0) / (weekly.length || 1)
  const avgNet      = weekly.reduce((s, r) => s + r.net_cashflow, 0) / (weekly.length || 1)
  const negPct      = (weekly.filter(r => r.net_cashflow < 0).length / (weekly.length || 1) * 100).toFixed(0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* KPIs */}
      <div style={styles.kpiRow}>
        {[
          { label: 'Avg Weekly Income',   value: inr(avgIncome),   color: COLORS.income },
          { label: 'Avg Weekly Expenses', value: inr(avgExpenses), color: COLORS.expenses },
          { label: 'Avg Net Cash Flow',   value: inr(avgNet),      color: avgNet >= 0 ? COLORS.netCF : COLORS.netNeg },
          { label: 'Negative CF Weeks',   value: `${negPct}%`,     color: negPct > 20 ? COLORS.netNeg : '#555' },
        ].map(k => <KpiPill key={k.label} {...k} />)}
      </div>

      <Card title="Weekly Income vs Expenses">
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={thinned} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="dateLabel" tick={{ fontSize: 10, fill: '#888' }} tickLine={false} axisLine={false} interval={0} hide={false} tickFormatter={(v, i) => thinned[i]?._show ? v : ''} />
            <YAxis tick={{ fontSize: 10, fill: '#888' }} tickLine={false} axisLine={false} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} width={42} />
            <Tooltip content={<ScTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            <Area dataKey="income" name="Income" fill={`${COLORS.income}18`} stroke={COLORS.income} strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} />
            <Line dataKey="expenses" name="Expenses" stroke={COLORS.expenses} strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
          </ComposedChart>
        </ResponsiveContainer>
      </Card>

      <Card title="Weekly Net Cash Flow">
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={thinned} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="dateLabel" tick={{ fontSize: 10, fill: '#888' }} tickLine={false} axisLine={false} tickFormatter={(v, i) => thinned[i]?._show ? v : ''} />
            <YAxis tick={{ fontSize: 10, fill: '#888' }} tickLine={false} axisLine={false} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} width={42} />
            <Tooltip content={<ScTooltip />} />
            <ReferenceLine y={0} stroke="#e0e0e0" strokeDasharray="3 3" />
            <Bar dataKey="net_pos" name="Net CF (positive)" stackId="net" fill={COLORS.netCF} maxBarSize={6} />
            <Bar dataKey="net_neg" name="Net CF (negative)" stackId="net" fill={COLORS.netNeg} maxBarSize={6} />
          </ComposedChart>
        </ResponsiveContainer>
      </Card>
    </div>
  )
}

/* ────────────────────────────────────────────
   VIEW: STL Decomposition
──────────────────────────────────────────── */
function DecompositionView({ data }) {
  const decomp  = data.decomposition || {}
  const monthly = useMemo(() => {
    const rows = decomp.monthly || []
    return rows.map((r, i) => ({
      ...r,
      dateLabel: shortDate(r.month),
      trend:     decomp.trend?.[i],
      seasonal:  decomp.seasonal?.[i],
      residual:  decomp.residual?.[i],
    }))
  }, [decomp])

  const slopePct = decomp.trend_slope_pct
  const ss       = decomp.seasonal_strength
  const z        = decomp.same_period_z

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Signal metrics */}
      <div style={styles.kpiRow}>
        {[
          { label: 'Trend Slope', value: `${slopePct > 0 ? '+' : ''}${slopePct?.toFixed(2)}%/mo`, color: slopePct >= 0 ? COLORS.netCF : COLORS.netNeg },
          { label: 'Seasonal Strength', value: ss?.toFixed(2), color: '#555' },
          { label: 'Same-Period Z', value: z?.toFixed(2), color: Math.abs(z) > 1.5 ? COLORS.expenses : '#555' },
        ].map(k => <KpiPill key={k.label} {...k} />)}
      </div>

      <Card
        title="STL Decomposition — Observed vs Trend vs Seasonal"
        action={<HelpTip text="STL splits the series into trend (long-term direction), seasonal (annual pattern), and residual (noise)." />}
      >
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={monthly} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="dateLabel" tick={{ fontSize: 10, fill: '#888' }} tickLine={false} axisLine={false} interval={3} />
            <YAxis tick={{ fontSize: 10, fill: '#888' }} tickLine={false} axisLine={false} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} width={46} />
            <Tooltip content={<ScTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            <ReferenceLine y={0} stroke="#e0e0e0" />
            <Line dataKey="net_cashflow" name="Observed" stroke="#9ca3af" strokeWidth={1.2} dot={false} />
            <Line dataKey="trend"        name="Trend"    stroke={COLORS.trend}    strokeWidth={2.2} dot={false} />
            <Line dataKey="seasonal"     name="Seasonal" stroke={COLORS.seasonal} strokeWidth={1.8} dot={false} strokeDasharray="5 3" />
          </ComposedChart>
        </ResponsiveContainer>
      </Card>

      <Card title="Residual Component (Noise)">
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={monthly} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="dateLabel" tick={{ fontSize: 10, fill: '#888' }} tickLine={false} axisLine={false} interval={3} />
            <YAxis tick={{ fontSize: 10, fill: '#888' }} tickLine={false} axisLine={false} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} width={46} />
            <Tooltip content={<ScTooltip />} />
            <ReferenceLine y={0} stroke="#e0e0e0" />
            <Bar dataKey="residual" name="Residual" fill={COLORS.residual} maxBarSize={14} opacity={0.7} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Interpretation note */}
      <div style={styles.noteBox}>
        <strong>How to read this:</strong> If the trend line slopes clearly downward, the income decline is structural.
        A strong seasonal component (strength &gt; 0.6) with a flat trend means dips are predictable and will reverse.
        The residual (noise) should be random — any pattern in the residual means the model missed something.
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────
   VIEW: Forecast
──────────────────────────────────────────── */
function ForecastView({ data }) {
  const decomp   = data.decomposition || {}
  const fcData   = data.forecast || {}

  const historical = useMemo(() => {
    return (decomp.monthly || []).map(r => ({
      dateLabel: shortDate(r.month),
      observed: r.net_cashflow,
    }))
  }, [decomp])

  const forecastRows = useMemo(() => {
    const dates = fcData.dates || []
    return dates.map((d, i) => ({
      dateLabel: shortDate(d),
      forecast:  fcData.forecast?.[i],
      lower:     fcData.lower?.[i],
      upper:     fcData.upper?.[i],
      buffer:    fcData.cumulative_buffer?.[i],
    }))
  }, [fcData])

  const combined = useMemo(() => [
    ...historical,
    ...forecastRows,
  ], [historical, forecastRows])

  // index of split
  const splitIdx = historical.length - 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={styles.kpiRow}>
        {forecastRows.map((r, i) => (
          <KpiPill
            key={r.dateLabel}
            label={r.dateLabel}
            value={inr(r.forecast)}
            color={r.forecast >= 0 ? COLORS.netCF : COLORS.netNeg}
          />
        ))}
      </div>

      <Card
        title="Net Cash Flow Forecast — Next 6 Months"
        action={<HelpTip text="Method: seasonal-naive + linear trend extrapolation. Shaded band = 80% confidence interval." />}
      >
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={combined} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="dateLabel" tick={{ fontSize: 10, fill: '#888' }} tickLine={false} axisLine={false} interval={3} />
            <YAxis tick={{ fontSize: 10, fill: '#888' }} tickLine={false} axisLine={false} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} width={46} />
            <Tooltip content={<ScTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            <ReferenceLine y={0} stroke="#e0e0e0" strokeDasharray="3 3" />
            {/* Historical */}
            <Line dataKey="observed" name="Historical" stroke="#9ca3af" strokeWidth={1.5} dot={false} connectNulls />
            {/* CI area */}
            <Area dataKey="upper"    name="CI Upper" fill={COLORS.ci} stroke="none" connectNulls legendType="none" />
            <Area dataKey="lower"    name="CI Lower" fill="#fff"      stroke="none" connectNulls legendType="none" />
            {/* Forecast */}
            <Line dataKey="forecast" name="Forecast"  stroke={COLORS.forecast} strokeWidth={2} strokeDasharray="5 3" dot={{ r: 4, fill: COLORS.forecast }} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </Card>

      <Card title="Projected Liquidity Buffer vs Repayment Obligations">
        <div style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>
          Cumulative forecast net cash flow minus repayment obligations. Negative = shortfall risk.
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={forecastRows} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="dateLabel" tick={{ fontSize: 10, fill: '#888' }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#888' }} tickLine={false} axisLine={false} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} width={46} />
            <Tooltip content={<ScTooltip />} />
            <ReferenceLine y={0} stroke="#e0e0e0" strokeDasharray="3 3" />
            <Bar
              dataKey="buffer"
              name="Cumulative Buffer"
              maxBarSize={40}
              fill={COLORS.buffer}
              radius={[2, 2, 0, 0]}
              /* color each bar individually */
              label={false}
            >
              {forecastRows.map((r, i) => (
                <rect key={i} fill={r.buffer >= 0 ? COLORS.buffer : COLORS.bufNeg} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Forecast table */}
      <Card title="Forecast Detail">
        <table style={styles.tbl}>
          <thead>
            <tr style={{ background: '#f8f8f8' }}>
              {['Month', 'Forecast Net CF', 'Lower (80% CI)', 'Upper (80% CI)', 'Cumulative Buffer'].map(h => (
                <th key={h} style={styles.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {forecastRows.map((r, i) => (
              <tr key={i} style={{ background: i % 2 ? '#fafafa' : '#fff' }}>
                <td style={styles.td}>{r.dateLabel}</td>
                <td style={{ ...styles.td, fontWeight: 600, color: r.forecast >= 0 ? COLORS.netCF : COLORS.netNeg }}>{inr(r.forecast)}</td>
                <td style={styles.tdMuted}>{inr(r.lower)}</td>
                <td style={styles.tdMuted}>{inr(r.upper)}</td>
                <td style={{ ...styles.td, color: r.buffer >= 0 ? COLORS.netCF : COLORS.netNeg }}>{inr(r.buffer)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

/* ────────────────────────────────────────────
   Main export — view router
──────────────────────────────────────────── */
export default function ChartsSection({ data, view }) {
  if (view === 'cashflow')      return <CashFlowView data={data} />
  if (view === 'decomposition') return <DecompositionView data={data} />
  if (view === 'forecast')      return <ForecastView data={data} />
  return null
}

/* ── Sub-components ── */
function KpiPill({ label, value, color }) {
  return (
    <div style={styles.kpiPill}>
      <div style={styles.kpiLabel}>{label}</div>
      <div style={{ ...styles.kpiValue, color }}>{value}</div>
    </div>
  )
}

function HelpTip({ text }) {
  return (
    <span title={text} style={{ fontSize: 12, color: '#aaa', cursor: 'help', userSelect: 'none' }}>ⓘ</span>
  )
}

const styles = {
  kpiRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
  },
  kpiPill: {
    background: '#fff',
    border: '1px solid #e0e0e0',
    borderRadius: 4,
    padding: '8px 14px',
    minWidth: 110,
  },
  kpiLabel: { fontSize: 11, color: '#888', marginBottom: 3 },
  kpiValue: { fontSize: 15, fontWeight: 700 },

  noteBox: {
    background: '#f8f9ff',
    border: '1px solid #dde4ff',
    borderRadius: 4,
    padding: '10px 14px',
    fontSize: 12,
    color: '#444',
    lineHeight: 1.6,
  },

  tbl: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th:  { padding: '7px 12px', textAlign: 'left', fontWeight: 600, color: '#555', borderBottom: '1px solid #e8e8e8', fontSize: 11 },
  td:  { padding: '7px 12px', borderBottom: '1px solid #f2f2f2', color: '#1a1a1a' },
  tdMuted: { padding: '7px 12px', borderBottom: '1px solid #f2f2f2', color: '#888' },
}
