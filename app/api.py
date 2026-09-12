"""
api.py
FastAPI backend — serves the full analysis pipeline as JSON.

Endpoints:
  GET  /api/borrowers                    → list of all borrowers + status
  GET  /api/borrower/{id}                → full analysis: summary, decomp, forecast, schedule, explanation
  GET  /api/borrower/{id}/cashflow       → raw weekly transactions
  GET  /api/borrower/{id}/decomposition  → STL components (monthly)
  GET  /api/borrower/{id}/forecast       → 6-month forecast + CI + buffer
  GET  /api/borrower/{id}/repayment      → original + proposed schedule
  GET  /api/borrower/{id}/explanation    → plain-language explanation dict
  POST /api/simulate-shock               → optional: apply income shock and re-run

Run:
  uvicorn app.api:app --reload --port 8000
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

from data_generator import generate_all
from analysis import analyze_all
from restructuring import restructure_all
from explain import explain_all

# ─────────────────────────────────────────────
# Bootstrap — load data once at startup
# ─────────────────────────────────────────────
ROOT     = Path(__file__).parent.parent
DATA_DIR = ROOT / "app" / "data"

def _bootstrap():
    if not (DATA_DIR / "transactions.csv").exists():
        generate_all(str(DATA_DIR))
    txn = pd.read_csv(DATA_DIR / "transactions.csv", parse_dates=["date"])
    bor = pd.read_csv(DATA_DIR / "borrowers.csv")
    analysis     = analyze_all(txn)
    schedules    = restructure_all(analysis, bor)
    explanations = explain_all(analysis, schedules, bor)
    return txn, bor, analysis, schedules, explanations

TXN, BOR, ANALYSIS, SCHEDULES, EXPLANATIONS = _bootstrap()

# ─────────────────────────────────────────────
# App
# ─────────────────────────────────────────────
app = FastAPI(title="MicroLoan CashFlow Manager", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

STATUS_COLOR = {
    "healthy":         "green",
    "seasonal_stress": "orange",
    "genuine_decline": "red",
}

# ─────────────────────────────────────────────
# Serialisation helpers
# ─────────────────────────────────────────────
def _ser(v):
    """Make numpy scalars / NaN JSON-safe."""
    if isinstance(v, (np.integer,)):   return int(v)
    if isinstance(v, (np.floating,)):  return None if np.isnan(v) else float(v)
    if isinstance(v, np.ndarray):      return [_ser(x) for x in v]
    if isinstance(v, pd.Timestamp):    return v.strftime("%Y-%m-%d")
    return v

def _df_to_records(df: pd.DataFrame) -> list:
    records = []
    for row in df.to_dict(orient="records"):
        records.append({k: _ser(v) for k, v in row.items()})
    return records

def _build_borrower_summary(bid: str) -> dict:
    res   = ANALYSIS[bid]
    sched = SCHEDULES[bid]
    meta  = BOR[BOR.borrower_id == bid].iloc[0]
    ev    = res.classification_evidence
    txn_b = TXN[TXN.borrower_id == bid]

    return {
        "borrower_id":    bid,
        "name":           meta["name"],
        "archetype":      meta["archetype"],
        "true_label":     meta["true_label"],
        "status":         res.status,
        "status_color":   STATUS_COLOR[res.status],
        "loan_amount":    int(meta["loan_amount"]),
        "monthly_installment": int(meta["monthly_installment"]),
        "loan_tenure_months":  int(meta["loan_tenure_months"]),
        "loan_start":     meta["loan_start"],
        "seasonal_pattern": meta["seasonal_pattern"],
        "kpis": {
            "avg_weekly_income":    round(float(txn_b["income"].mean()), 2),
            "avg_weekly_expenses":  round(float(txn_b["expenses"].mean()), 2),
            "avg_net_cashflow":     round(float(txn_b["net_cashflow"].mean()), 2),
            "neg_cf_weeks_pct":     round(float((txn_b["net_cashflow"] < 0).mean() * 100), 1),
            "trend_slope_pct":      round(ev["trend_slope_pct"], 3),
            "seasonal_strength":    round(ev["seasonal_strength"], 3),
            "same_period_z":        round(ev["same_period_z"], 3),
            "forecast_neg_months":  ev["forecast_negative_months"],
            "forecast_buffer_min":  round(ev["forecast_buffer_min"], 2),
        },
        "restructuring": {
            "original_installment": sched.original_monthly_installment,
            "proposed_installment": sched.proposed_monthly_installment,
            "original_tenure":      sched.original_tenure_remaining,
            "proposed_tenure":      sched.proposed_tenure_remaining,
        },
    }

# ─────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────

@app.get("/api/borrowers")
def list_borrowers():
    return [_build_borrower_summary(bid) for bid in sorted(ANALYSIS.keys())]


@app.get("/api/borrower/{bid}")
def get_borrower(bid: str):
    if bid not in ANALYSIS:
        raise HTTPException(status_code=404, detail=f"Borrower {bid} not found")

    summary      = _build_borrower_summary(bid)
    cashflow     = get_cashflow(bid)
    decomp       = get_decomposition(bid)
    forecast     = get_forecast(bid)
    repayment    = get_repayment(bid)
    explanation  = get_explanation(bid)

    return {
        **summary,
        "cashflow":    cashflow,
        "decomposition": decomp,
        "forecast":    forecast,
        "repayment":   repayment,
        "explanation": explanation,
    }


@app.get("/api/borrower/{bid}/cashflow")
def get_cashflow(bid: str):
    if bid not in ANALYSIS:
        raise HTTPException(status_code=404, detail=f"Borrower {bid} not found")
    txn_b = TXN[TXN.borrower_id == bid].copy()
    txn_b["date"] = txn_b["date"].dt.strftime("%Y-%m-%d")
    return _df_to_records(txn_b[["date", "income", "expenses", "loan_repayment", "net_cashflow"]])


@app.get("/api/borrower/{bid}/decomposition")
def get_decomposition(bid: str):
    if bid not in ANALYSIS:
        raise HTTPException(status_code=404, detail=f"Borrower {bid} not found")
    res    = ANALYSIS[bid]
    decomp = res.decomposition
    monthly = res.monthly.copy()
    monthly["month"] = monthly["month"].dt.strftime("%Y-%m-%d")

    return {
        "monthly":          _df_to_records(monthly),
        "trend":            [_ser(v) for v in decomp.trend.values],
        "seasonal":         [_ser(v) for v in decomp.seasonal.values],
        "residual":         [_ser(v) for v in decomp.residual.values],
        "trend_slope":      _ser(decomp.trend_slope),
        "trend_slope_pct":  _ser(decomp.trend_slope_pct),
        "seasonal_strength": _ser(decomp.seasonal_strength),
        "same_period_z":    _ser(decomp.same_period_z),
    }


@app.get("/api/borrower/{bid}/forecast")
def get_forecast(bid: str):
    if bid not in ANALYSIS:
        raise HTTPException(status_code=404, detail=f"Borrower {bid} not found")
    fc = ANALYSIS[bid].forecast
    return {
        "dates":              [d.strftime("%Y-%m-%d") for d in fc.dates],
        "forecast":           [_ser(v) for v in fc.forecast],
        "lower":              [_ser(v) for v in fc.lower],
        "upper":              [_ser(v) for v in fc.upper],
        "cumulative_buffer":  [_ser(v) for v in fc.cumulative_buffer],
    }


@app.get("/api/borrower/{bid}/repayment")
def get_repayment(bid: str):
    if bid not in ANALYSIS:
        raise HTTPException(status_code=404, detail=f"Borrower {bid} not found")
    sched = SCHEDULES[bid]
    return {
        "status":                      sched.status,
        "original_installment":        sched.original_monthly_installment,
        "proposed_installment":        sched.proposed_monthly_installment,
        "original_tenure":             sched.original_tenure_remaining,
        "proposed_tenure":             sched.proposed_tenure_remaining,
        "total_outstanding":           sched.total_repayment_original,
        "original_schedule":           _df_to_records(sched.original),
        "proposed_schedule":           _df_to_records(sched.proposed),
        "restructure_note":            sched.restructure_note,
    }


@app.get("/api/borrower/{bid}/explanation")
def get_explanation(bid: str):
    if bid not in ANALYSIS:
        raise HTTPException(status_code=404, detail=f"Borrower {bid} not found")
    return EXPLANATIONS[bid]


# ─────────────────────────────────────────────
# Shock simulation
# ─────────────────────────────────────────────
class ShockRequest(BaseModel):
    borrower_id: str
    income_shock_pct: float = -20.0   # % change applied to all future income
    months: int = 6

@app.post("/api/simulate-shock")
def simulate_shock(req: ShockRequest):
    if req.borrower_id not in ANALYSIS:
        raise HTTPException(status_code=404, detail=f"Borrower {req.borrower_id} not found")

    from analysis import analyze_borrower
    from restructuring import restructure
    from explain import explain

    # Apply shock to transactions
    txn_b = TXN[TXN.borrower_id == req.borrower_id].copy()
    last_date = txn_b["date"].max()
    cutoff    = last_date - pd.DateOffset(weeks=req.months * 4)
    mask      = txn_b["date"] > cutoff

    txn_shocked = txn_b.copy()
    txn_shocked.loc[mask, "income"]       *= (1 + req.income_shock_pct / 100)
    txn_shocked.loc[mask, "net_cashflow"] = (
        txn_shocked.loc[mask, "income"]
        - txn_shocked.loc[mask, "expenses"]
        - txn_shocked.loc[mask, "loan_repayment"]
    )

    shocked_txn = TXN[TXN.borrower_id != req.borrower_id]._append(txn_shocked)

    res   = analyze_borrower(req.borrower_id, shocked_txn)
    sched = restructure(res, BOR)
    expl  = explain(res, sched, BOR)

    return {
        "borrower_id":  req.borrower_id,
        "shock_pct":    req.income_shock_pct,
        "status_before": ANALYSIS[req.borrower_id].status,
        "status_after":  res.status,
        "explanation":   expl,
        "forecast": {
            "dates":             [d.strftime("%Y-%m-%d") for d in res.forecast.dates],
            "forecast":          [_ser(v) for v in res.forecast.forecast],
            "cumulative_buffer": [_ser(v) for v in res.forecast.cumulative_buffer],
        },
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=True)
