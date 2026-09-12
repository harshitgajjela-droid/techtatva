import React, { useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ReferenceLine, ResponsiveContainer, Cell,
} from 'recharts'
import { Card } from './SummarySection'

const inr  = v => v == null ? '—' : `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
const pct  = (a, b) => b ? `${((a - b) / b * 100).toFixed(1)}%` : '—'
const diff = (a, b) => {
  const d = a - b
  return { value: Math.abs(d), sign: d > 0 ? '+' : d < 0 ? '−' : '' }
}

const ORIG_COLOR = '#1a73e8'
const PROP_COLOR = '#22a06b'
const ZERO_COLOR = '#fca5a5'

function ScTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#fff', border: '1px solid #e0e0e0', padding: '8px 12px',
      borderRadius: 4, fontSize: 12, boxShadow: '0 2px 8px rgba(0,0,0,.08)',
    }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.fill, marginBottom: 2 }}>
          {p.name}: {inr(p.value)}
        </div>
      ))}
    </div>
  )
}

export default function RepaymentSection({ data }) {
  const repayment = data.repayment || {}
  const [view, setView]   = useState('proposed')   // 'original' | 'proposed' | 'compare'

  const origSchedule = repayment.original_schedule || []
  const propSchedule = repayment.proposed_schedule || []

  // Build comparison data for chart — first 12 months
  const n         = Math.min(12, Math.max(origSchedule.length, propSchedule.length))
  const chartData = useMemo(() => {
    return Array.from({ length: n }, (_, i) => ({
      month:    origSchedule[i]?.month || propSchedule[i]?.month || `M${i+1}`,
      original: origSchedule[i]?.installment_due ?? 0,
      proposed: propSchedule[i]?.installment_due ?? 0,
    }))
  }, [origSchedule, propSchedule, n])

  const installmentDiff = diff(repayment.proposed_installment, repayment.original_installment)
  const tenureDiff      = diff(repayment.proposed_tenure, repayment.original_tenure)

  const statusColor = data.status === 'genuine_decline' ? '#dc2626'
                    : data.status === 'seasonal_stress'  ? '#d97706'
                    : '#22a06b'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Summary delta cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <DeltaCard
          label="Original Installment"
          value={inr(repayment.original_installment)}
          sub="/month"
        />
        <DeltaCard
          label="Proposed Installment"
          value={inr(repayment.proposed_installment)}
          sub="/month"
          delta={installmentDiff.value ? `${installmentDiff.sign}${inr(installmentDiff.value)}` : 'No change'}
          deltaColor={installmentDiff.sign === '−' ? '#22a06b' : installmentDiff.sign === '+' ? '#dc2626' : '#888'}
        />
        <DeltaCard
          label="Original Tenure"
          value={`${repayment.original_tenure} months`}
          sub="remaining"
        />
        <DeltaCard
          label="Proposed Tenure"
          value={`${repayment.proposed_tenure} months`}
          sub=""
          delta={tenureDiff.value ? `${tenureDiff.sign}${tenureDiff.value} months` : 'No change'}
          deltaColor={tenureDiff.sign === '+' ? '#d97706' : '#888'}
        />
      </div>

      {/* ── Restructure note ── */}
      {repayment.restructure_note && (
        <div style={{
          borderLeft: `3px solid ${statusColor}`,
          background: '#fafafa',
          border: `1px solid #e8e8e8`,
          borderLeftWidth: 3,
          borderLeftStyle: 'solid',
          borderLeftColor: statusColor,
          borderRadius: 4,
          padding: '10px 14px',
          fontSize: 12,
          color: '#333',
          lineHeight: 1.7,
        }}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4, color: statusColor }}>
            {data.status === 'genuine_decline' ? '⚠ Manual Review Required'
             : data.status === 'seasonal_stress' ? 'Restructuring Applied'
             : 'No Restructuring Needed'}
          </div>
          {repayment.restructure_note}
        </div>
      )}

      {/* ── Installment comparison chart ── */}
      <Card title="Monthly Installment — Original vs Proposed (First 12 Months)">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData} margin={{ top: 6, right: 12, left: 0, bottom: 0 }} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#888' }} tickLine={false} axisLine={false} interval={0} angle={-30} textAnchor="end" height={40} />
            <YAxis tick={{ fontSize: 10, fill: '#888' }} tickLine={false} axisLine={false} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} width={44} />
            <Tooltip content={<ScTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
            <ReferenceLine y={0} stroke="#e0e0e0" />
            <Bar dataKey="original" name="Original" fill={ORIG_COLOR} maxBarSize={24} radius={[2,2,0,0]} opacity={0.5} />
            <Bar dataKey="proposed" name="Proposed" fill={PROP_COLOR} maxBarSize={24} radius={[2,2,0,0]}
              label={false}
            >
              {chartData.map((d, i) => (
                <Cell key={i} fill={d.proposed === 0 ? ZERO_COLOR : PROP_COLOR} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div style={{ fontSize: 11, color: '#aaa', marginTop: 6 }}>
          Red bars = deferred months (₹0 installment). Green = normal or boosted months.
        </div>
      </Card>

      {/* ── Schedule tables ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <ScheduleTable title="Original Schedule" rows={origSchedule} color={ORIG_COLOR} />
        <ScheduleTable title="Proposed Schedule" rows={propSchedule} color={PROP_COLOR} origRows={origSchedule} />
      </div>
    </div>
  )
}

function DeltaCard({ label, value, sub, delta, deltaColor }) {
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e0e0e0',
      borderRadius: 4,
      padding: '12px 14px',
    }}>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: '#1a1a1a' }}>
        {value} <span style={{ fontSize: 12, fontWeight: 400, color: '#aaa' }}>{sub}</span>
      </div>
      {delta && (
        <div style={{ fontSize: 11, color: deltaColor || '#888', marginTop: 3, fontWeight: 600 }}>
          {delta}
        </div>
      )}
    </div>
  )
}

function ScheduleTable({ title, rows, color, origRows }) {
  const displayRows = rows.slice(0, 24)   // cap at 24 months to keep UI clean

  return (
    <Card title={title}>
      <div style={{ maxHeight: 380, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead style={{ position: 'sticky', top: 0, background: '#f8f8f8', zIndex: 1 }}>
            <tr>
              <th style={thStyle}>Month</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Installment</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Balance After</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, i) => {
              const origPmt = origRows?.[i]?.installment_due
              const isDeferred = origRows && row.installment_due === 0 && origPmt > 0
              const isBoosted  = origRows && row.installment_due > (origPmt ?? row.installment_due)
              return (
                <tr
                  key={i}
                  style={{
                    background: isDeferred ? '#fff7f7'
                              : isBoosted  ? '#f0fff8'
                              : i % 2 ? '#fafafa' : '#fff',
                  }}
                >
                  <td style={tdStyle}>{row.month}</td>
                  <td style={{
                    ...tdStyle,
                    textAlign: 'right',
                    fontWeight: 600,
                    color: isDeferred ? '#dc2626' : isBoosted ? '#22a06b' : color,
                  }}>
                    ₹{Number(row.installment_due).toLocaleString('en-IN')}
                    {isDeferred && <span style={{ fontSize: 10, marginLeft: 4, color: '#dc2626' }}>deferred</span>}
                    {isBoosted  && <span style={{ fontSize: 10, marginLeft: 4, color: '#22a06b' }}>↑</span>}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: '#555' }}>
                    ₹{Number(row.balance_after).toLocaleString('en-IN')}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {rows.length > 24 && (
          <div style={{ padding: '6px 12px', fontSize: 11, color: '#aaa' }}>
            Showing 24 of {rows.length} months
          </div>
        )}
      </div>
    </Card>
  )
}

const thStyle = { padding: '7px 12px', fontWeight: 600, color: '#555', fontSize: 11, borderBottom: '1px solid #e8e8e8', textAlign: 'left' }
const tdStyle = { padding: '6px 12px', borderBottom: '1px solid #f2f2f2', color: '#1a1a1a' }
