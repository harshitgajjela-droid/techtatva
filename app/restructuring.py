"""
restructuring.py
Proposes a restructured repayment schedule based on borrower status and cash-flow forecast.

Rules:
  healthy         → no change to schedule
  seasonal_stress → keep total repayment the same; shift installments out of
                    forecast-negative months into months with the strongest buffer
  genuine_decline → reduce installment amount + extend tenure; flag for manual review

All amounts in INR (₹).
"""

import numpy as np
import pandas as pd
from dataclasses import dataclass

from analysis import AnalysisResult, MONTHLY_INSTALLMENT, FORECAST_MONTHS

SAFETY_MARGIN = 2_000   # ₹ — minimum buffer we want above the installment after restructuring
MAX_TENURE_EXTENSION = 12   # months — ceiling on how far we extend genuine_decline loans


@dataclass
class RepaymentSchedule:
    borrower_id: str
    status: str

    # Original schedule rows: month, installment_due, balance_before, balance_after
    original: pd.DataFrame

    # Proposed schedule rows (same schema)
    proposed: pd.DataFrame

    # Summary
    original_monthly_installment: float
    proposed_monthly_installment: float
    original_tenure_remaining: int     # months
    proposed_tenure_remaining: int     # months
    total_repayment_original: float
    total_repayment_proposed: float
    restructure_note: str


def _build_schedule(
    start_month: pd.Timestamp,
    n_months: int,
    installment: float,
    outstanding: float,
) -> pd.DataFrame:
    """Build a month-by-month repayment table."""
    rows = []
    balance = outstanding
    for i in range(n_months):
        month = start_month + pd.DateOffset(months=i)
        payment = min(installment, balance)
        balance_after = max(balance - payment, 0)
        rows.append({
            "month": month.strftime("%b %Y"),
            "installment_due": round(payment, 2),
            "balance_before": round(balance, 2),
            "balance_after": round(balance_after, 2),
        })
        balance = balance_after
        if balance <= 0:
            break
    return pd.DataFrame(rows)


def _months_remaining(loan_amount: float, installment: float) -> int:
    """Simple ceiling division."""
    if installment <= 0:
        return 999
    return int(np.ceil(loan_amount / installment))


# ─────────────────────────────────────────────
# Restructuring strategies
# ─────────────────────────────────────────────

def _restructure_healthy(
    res: AnalysisResult,
    meta: pd.Series,
) -> RepaymentSchedule:
    """No change — pass through original schedule."""
    outstanding = float(meta["loan_amount"])
    installment = float(meta["monthly_installment"])
    start = res.forecast.dates[0]
    n = _months_remaining(outstanding, installment)

    schedule = _build_schedule(start, n, installment, outstanding)

    return RepaymentSchedule(
        borrower_id=res.borrower_id,
        status="healthy",
        original=schedule.copy(),
        proposed=schedule.copy(),
        original_monthly_installment=installment,
        proposed_monthly_installment=installment,
        original_tenure_remaining=n,
        proposed_tenure_remaining=n,
        total_repayment_original=round(outstanding, 2),
        total_repayment_proposed=round(outstanding, 2),
        restructure_note=(
            "No restructuring needed. Cash flow is stable and trending positively. "
            "Repayment schedule unchanged."
        ),
    )


def _restructure_seasonal_stress(
    res: AnalysisResult,
    meta: pd.Series,
) -> RepaymentSchedule:
    """
    Keep total repayment unchanged.
    Shift installments away from months where forecast net CF < installment + safety_margin
    into months with the strongest forecasted buffer.

    Algorithm:
      1. For each forecast month: affordable = forecast[m] - safety_margin >= installment
      2. Stressed months: forecast[m] - safety_margin < installment
      3. Move stressed installments to the 2 best buffer months (may double up)
      4. If no safe months exist in window, push to first month after the stressed period
    """
    outstanding  = float(meta["loan_amount"])
    installment  = float(meta["monthly_installment"])
    n_orig       = _months_remaining(outstanding, installment)
    fc_dates     = res.forecast.dates
    fc_vals      = res.forecast.forecast   # net CF forecast per month
    start        = fc_dates[0]

    # Original schedule (straight-line)
    orig_schedule = _build_schedule(start, n_orig, installment, outstanding)

    # ── Identify stressed vs comfortable months in the forecast window ──
    comfortable = []
    stressed    = []
    for i in range(FORECAST_MONTHS):
        headroom = fc_vals[i] - SAFETY_MARGIN
        if headroom >= installment:
            comfortable.append(i)   # can afford installment + buffer
        else:
            stressed.append(i)

    # Build a month-label → installment mapping for the proposed schedule.
    # Start with the original installment each month.
    month_labels = [fc_dates[i].strftime("%b %Y") for i in range(FORECAST_MONTHS)]
    proposed_installments = {m: installment for m in month_labels}

    if stressed and comfortable:
        # Remove installments from stressed months
        relief_pool = len(stressed) * installment

        # Zero out stressed months
        for i in stressed:
            proposed_installments[month_labels[i]] = 0.0

        # Distribute evenly to comfortable months (cap each month's extra at 2× installment)
        per_comfortable = relief_pool / len(comfortable)
        for i in comfortable:
            proposed_installments[month_labels[i]] = min(
                installment + per_comfortable,
                installment * 2
            )

    # Build proposed schedule DataFrame matching the original schema
    # (months beyond the forecast window remain at standard installment)
    prop_rows = []
    balance   = outstanding
    for i in range(n_orig):
        month = start + pd.DateOffset(months=i)
        label = month.strftime("%b %Y")
        pmt   = proposed_installments.get(label, installment)
        pmt   = min(pmt, balance)
        balance_after = max(balance - pmt, 0)
        prop_rows.append({
            "month": label,
            "installment_due": round(pmt, 2),
            "balance_before": round(balance, 2),
            "balance_after": round(balance_after, 2),
        })
        balance = balance_after
        if balance <= 0:
            break

    prop_schedule = pd.DataFrame(prop_rows)

    # Tenure may extend slightly if installments are skipped in early months
    # but the total paid is the same outstanding amount
    note_parts = []
    if stressed:
        stressed_labels = [month_labels[i] for i in stressed]
        comfortable_labels = [month_labels[i] for i in comfortable]
        note_parts.append(
            f"Installments in {', '.join(stressed_labels)} are reduced to ₹0 "
            f"because forecast net cash flow is below the safety threshold "
            f"(installment + ₹{SAFETY_MARGIN:,} buffer)."
        )
        if comfortable_labels:
            note_parts.append(
                f"Deferred amounts are redistributed to {', '.join(comfortable_labels)}, "
                f"where projected buffer is strongest."
            )
    else:
        note_parts.append(
            "No stressed months detected in the 6-month window. "
            "Schedule unchanged for the forecast period."
        )
    note_parts.append(
        "Total outstanding is preserved — this is a timing adjustment, not debt relief."
    )

    return RepaymentSchedule(
        borrower_id=res.borrower_id,
        status="seasonal_stress",
        original=orig_schedule,
        proposed=prop_schedule,
        original_monthly_installment=installment,
        proposed_monthly_installment=installment,   # unchanged per-period average
        original_tenure_remaining=n_orig,
        proposed_tenure_remaining=len(prop_schedule),
        total_repayment_original=round(outstanding, 2),
        total_repayment_proposed=round(outstanding, 2),
        restructure_note=" ".join(note_parts),
    )


def _restructure_genuine_decline(
    res: AnalysisResult,
    meta: pd.Series,
) -> RepaymentSchedule:
    """
    Flag for manual review.
    Propose reduced installment (50% of original) + extended tenure.
    Do NOT claim the loan is safe — surface the risk clearly.
    """
    outstanding  = float(meta["loan_amount"])
    installment  = float(meta["monthly_installment"])
    n_orig       = _months_remaining(outstanding, installment)
    start        = res.forecast.dates[0]

    orig_schedule = _build_schedule(start, n_orig, installment, outstanding)

    # Proposed: reduce installment to 50%, extend tenure
    reduced_installment = round(installment * 0.50, 2)
    n_extended = min(
        _months_remaining(outstanding, reduced_installment),
        n_orig + MAX_TENURE_EXTENSION
    )
    prop_schedule = _build_schedule(start, n_extended, reduced_installment, outstanding)

    ev = res.classification_evidence
    note = (
        f"FLAGGED FOR MANUAL REVIEW. "
        f"Income trend is declining at {abs(ev['trend_slope_pct']):.1f}% per month. "
        f"{ev['forecast_negative_months']} of the next 6 months are projected to have "
        f"negative net cash flow. "
        f"Proposed: reduce monthly installment from "
        f"Rs {installment:,.0f} to Rs {reduced_installment:,.0f} "
        f"and extend tenure by up to {MAX_TENURE_EXTENSION} months to ease immediate pressure. "
        f"This does not resolve the underlying income decline. "
        f"Lender should assess root cause (health, employment loss, market conditions) "
        f"before finalizing restructuring."
    )

    return RepaymentSchedule(
        borrower_id=res.borrower_id,
        status="genuine_decline",
        original=orig_schedule,
        proposed=prop_schedule,
        original_monthly_installment=installment,
        proposed_monthly_installment=reduced_installment,
        original_tenure_remaining=n_orig,
        proposed_tenure_remaining=len(prop_schedule),
        total_repayment_original=round(outstanding, 2),
        total_repayment_proposed=round(outstanding, 2),
        restructure_note=note,
    )


# ─────────────────────────────────────────────
# Public entry point
# ─────────────────────────────────────────────
def restructure(
    res: AnalysisResult,
    borrowers: pd.DataFrame,
) -> RepaymentSchedule:
    """
    Entry point: given an AnalysisResult and borrower metadata DataFrame,
    return a RepaymentSchedule.
    """
    meta = borrowers[borrowers["borrower_id"] == res.borrower_id].iloc[0]

    if res.status == "healthy":
        return _restructure_healthy(res, meta)
    elif res.status == "seasonal_stress":
        return _restructure_seasonal_stress(res, meta)
    elif res.status == "genuine_decline":
        return _restructure_genuine_decline(res, meta)
    else:
        raise ValueError(f"Unknown status: {res.status}")


def restructure_all(
    analysis_results: dict,
    borrowers: pd.DataFrame,
) -> dict:
    """Returns {borrower_id: RepaymentSchedule} for all borrowers."""
    return {
        bid: restructure(res, borrowers)
        for bid, res in analysis_results.items()
    }


# ─────────────────────────────────────────────
# Standalone validation
# ─────────────────────────────────────────────
if __name__ == "__main__":
    import sys
    from pathlib import Path

    sys.path.insert(0, str(Path(__file__).parent))

    from analysis import analyze_all

    root = Path(__file__).parent.parent
    txn  = pd.read_csv(root / "app" / "data" / "transactions.csv", parse_dates=["date"])
    bor  = pd.read_csv(root / "app" / "data" / "borrowers.csv")

    results   = analyze_all(txn)
    schedules = restructure_all(results, bor)

    for bid, sched in sorted(schedules.items()):
        name = bor.loc[bor.borrower_id == bid, "name"].values[0]
        print(f"\n{'='*60}")
        print(f"  {bid}  {name}  [{sched.status.upper()}]")
        print(f"{'='*60}")
        print(f"  Orig installment : Rs {sched.original_monthly_installment:,.0f}/month")
        print(f"  Prop installment : Rs {sched.proposed_monthly_installment:,.0f}/month")
        print(f"  Orig tenure      : {sched.original_tenure_remaining} months")
        print(f"  Prop tenure      : {sched.proposed_tenure_remaining} months")
        print(f"\n  Note: {sched.restructure_note[:200]}...")
        print(f"\n  Proposed schedule (first 6 months):")
        print(sched.proposed.head(6).to_string(index=False))
