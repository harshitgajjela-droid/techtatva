import React, { useState } from 'react'
import { Card } from './SummarySection'

const STATUS_META = {
  healthy:         { color: '#22a06b', bg: '#e8f7f1', label: 'Healthy',        icon: '✓' },
  seasonal_stress: { color: '#d97706', bg: '#fef3e2', label: 'Seasonal Stress', icon: '↻' },
  genuine_decline: { color: '#dc2626', bg: '#fef2f2', label: 'Genuine Decline', icon: '⚠' },
}

export default function ExplanationSection({ data }) {
  const expl   = data.explanation || {}
  const status = data.status
  const meta   = STATUS_META[status] || STATUS_META.healthy

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── Classification verdict ── */}
      <div style={{
        background: meta.bg,
        border: `1px solid ${meta.color}44`,
        borderRadius: 4,
        padding: '14px 16px',
        display: 'flex',
        gap: 14,
        alignItems: 'flex-start',
      }}>
        <div style={{
          fontSize: 22,
          color: meta.color,
          lineHeight: 1,
          marginTop: 2,
          flexShrink: 0,
        }}>
          {meta.icon}
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: meta.color, marginBottom: 4 }}>
            {expl.headline}
          </div>
          <div style={{ fontSize: 13, color: '#444', lineHeight: 1.7 }}>
            {expl.detail}
          </div>
        </div>
      </div>

      {/* ── Restructure detail (if applicable) ── */}
      {expl.restructure_detail && (
        <Card title="Restructuring Action">
          <div style={{ fontSize: 13, color: '#333', lineHeight: 1.7 }}>
            {expl.restructure_detail}
          </div>
        </Card>
      )}

      {/* ── Risk flag ── */}
      {expl.risk_flag && (
        <div style={{
          background: '#fef2f2',
          border: '1px solid #fca5a5',
          borderLeft: '4px solid #dc2626',
          borderRadius: 4,
          padding: '10px 14px',
          fontSize: 13,
          color: '#991b1b',
          fontWeight: 600,
          lineHeight: 1.6,
        }}>
          ⚠ {expl.risk_flag}
        </div>
      )}

      {/* ── Evidence ── */}
      <Card title="Evidence" action={<EvidenceHelpTip />}>
        <EvidenceGrid evidence={expl.evidence} status={status} />
      </Card>

      {/* ── Recommendation ── */}
      {expl.recommendation && (
        <div style={{
          background: '#f0fff8',
          border: '1px solid #6ee7b7',
          borderLeft: '4px solid #22a06b',
          borderRadius: 4,
          padding: '10px 14px',
          fontSize: 13,
          color: '#065f46',
          lineHeight: 1.7,
        }}>
          <strong>Recommendation: </strong>{expl.recommendation}
        </div>
      )}

      {/* ── How the decision was made ── */}
      <DecisionTrace status={status} data={data} />
    </div>
  )
}

/* ── Evidence grid — mimics Screener's ratio cards in evidence context ── */
function EvidenceGrid({ evidence, status }) {
  if (!evidence) return null

  const raw = evidence
  // Parse the evidence string into key-value pairs
  const pairs = (raw || '').split('. ').filter(Boolean).map(s => {
    const parts = s.split(':')
    if (parts.length >= 2) {
      return { key: parts[0].trim(), value: parts.slice(1).join(':').trim() }
    }
    return { key: s, value: null }
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {pairs.map((p, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '7px 0',
            borderBottom: i < pairs.length - 1 ? '1px solid #f2f2f2' : 'none',
          }}
        >
          <span style={{ fontSize: 12, color: '#555' }}>{p.key}</span>
          {p.value && (
            <span style={{ fontSize: 12, fontWeight: 600, color: '#1a1a1a', maxWidth: '55%', textAlign: 'right' }}>
              {p.value.replace('.', '')}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

/* ── Decision trace — shows exactly which rule fired ── */
function DecisionTrace({ status, data }) {
  const [open, setOpen] = useState(false)
  const kpis = data.kpis || {}

  const rules = [
    {
      id: 'genuine_decline',
      label: 'Rule 1 — Genuine Decline',
      description: 'Fires when: trend slope < −0.5% per month',
      fired: status === 'genuine_decline',
      values: [
        { key: 'Trend slope',   value: `${kpis.trend_slope_pct?.toFixed(2)}%/month`, pass: kpis.trend_slope_pct < -0.5 },
      ],
    },
    {
      id: 'seasonal_stress',
      label: 'Rule 2 — Seasonal Stress',
      description: 'Fires when: trend flat (|slope| < 1%) AND seasonal strength ≥ 0.1 AND currently below average (z < 0) AND within normal range (|z| < 1.5)',
      fired: status === 'seasonal_stress',
      values: [
        { key: 'Trend slope',       value: `${Math.abs(kpis.trend_slope_pct)?.toFixed(2)}%`, pass: Math.abs(kpis.trend_slope_pct) < 1.0 },
        { key: 'Seasonal strength', value: `${kpis.seasonal_strength?.toFixed(2)}`,  pass: kpis.seasonal_strength >= 0.1 },
        { key: 'Z-score < 0',       value: `${kpis.same_period_z?.toFixed(2)}`,      pass: kpis.same_period_z < 0 },
        { key: '|Z| < 1.5',        value: `${Math.abs(kpis.same_period_z)?.toFixed(2)}`, pass: Math.abs(kpis.same_period_z) < 1.5 },
      ],
    },
    {
      id: 'healthy',
      label: 'Rule 3 — Healthy',
      description: 'Default: fires when neither Rule 1 nor Rule 2 match',
      fired: status === 'healthy',
      values: [],
    },
  ]

  return (
    <div style={{ border: '1px solid #e0e0e0', borderRadius: 4, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          background: '#fafafa',
          border: 'none',
          padding: '9px 14px',
          textAlign: 'left',
          fontSize: 12,
          fontWeight: 600,
          color: '#555',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>How was this decision made?</span>
        <span style={{ color: '#aaa' }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12, background: '#fff' }}>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>
            Rules are evaluated in order. The first rule that matches determines the classification.
          </div>
          {rules.map(rule => (
            <div key={rule.id} style={{
              border: `1px solid ${rule.fired ? '#1a73e8' : '#e8e8e8'}`,
              borderRadius: 4,
              padding: '10px 12px',
              background: rule.fired ? '#f0f4ff' : '#fafafa',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontWeight: 700, fontSize: 12, color: rule.fired ? '#1a73e8' : '#888' }}>
                  {rule.label}
                </span>
                <span style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '1px 8px',
                  borderRadius: 10,
                  background: rule.fired ? '#1a73e8' : '#e8e8e8',
                  color:      rule.fired ? '#fff'    : '#aaa',
                }}>
                  {rule.fired ? 'FIRED' : 'skipped'}
                </span>
              </div>
              <div style={{ fontSize: 11, color: '#888', marginBottom: rule.values.length ? 8 : 0 }}>
                {rule.description}
              </div>
              {rule.values.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {rule.values.map(v => (
                    <div key={v.key} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      fontSize: 11,
                      background: '#fff',
                      border: `1px solid ${v.pass ? '#6ee7b7' : '#fca5a5'}`,
                      borderRadius: 3,
                      padding: '3px 8px',
                    }}>
                      <span style={{ color: v.pass ? '#22a06b' : '#dc2626', fontWeight: 700 }}>
                        {v.pass ? '✓' : '✗'}
                      </span>
                      <span style={{ color: '#555' }}>{v.key}:</span>
                      <span style={{ fontWeight: 600 }}>{v.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function EvidenceHelpTip() {
  return (
    <span
      title="These are the exact numbers used by the classification rules. Every decision is fully traceable to the underlying data."
      style={{ fontSize: 12, color: '#aaa', cursor: 'help' }}
    >
      ⓘ fully auditable
    </span>
  )
}
