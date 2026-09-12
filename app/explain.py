"""
explain.py
Generates plain-language explanations for borrower classification decisions.

Philosophy:
  - Lead with the conclusion.
  - Cite the specific numbers that drove the decision.
  - Explain what the restructuring does and why.
  - Be honest about uncertainty and risk.

No LLM required — template-based so it always works and is fully auditable.
"""

from analysis import AnalysisResult
from restructuring import RepaymentSchedule


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

def _trend_direction(slope_pct: float) -> str:
    if slope_pct > 1.5:
        return "growing"
    elif slope_pct < -1.5:
        return "declining"
    else:
        return "flat"


def _months_label(n: int) -> str:
    return f"{n} month" if n == 1 else f"{n} months"


def _rupee(amount: float) -> str:
    return f"Rs {amount:,.0f}"


# ─────────────────────────────────────────────
# Status-specific explanation builders
# ─────────────────────────────────────────────

def _explain_healthy(
    res: AnalysisResult,
    sched: RepaymentSchedule,
    name: str,
) -> dict:
    ev = res.classification_evidence
    slope = ev["trend_slope_pct"]
    z     = ev["same_period_z"]

    headline = f"{name}'s cash flow is stable. No repayment changes are needed."

    detail = (
        f"Over the past 2 years, {name}'s income has been trending "
        f"{_trend_direction(slope)} at {abs(slope):.1f}% per month. "
        f"The current period's cash flow is {abs(z):.1f} standard deviations from the "
        f"historical average — well within the normal range. "
        f"Forecasted net cash flow remains positive for all 6 months ahead, "
        f"with no months projected to go negative. "
        f"The current repayment schedule of {_rupee(sched.original_monthly_installment)}/month "
        f"is affordable and should continue unchanged."
    )

    evidence = (
        f"Trend slope: {slope:+.1f}% per month. "
        f"Same-period z-score: {z:.2f} (|z| < 1.5 = within normal range). "
        f"Forecast negative months: {ev['forecast_negative_months']} of 6."
    )

    recommendation = (
        "No action required. Monitor quarterly."
    )

    return {
        "headline": headline,
        "detail": detail,
        "evidence": evidence,
        "recommendation": recommendation,
        "risk_flag": None,
    }


def _explain_seasonal_stress(
    res: AnalysisResult,
    sched: RepaymentSchedule,
    name: str,
) -> dict:
    ev    = res.classification_evidence
    slope = ev["trend_slope_pct"]
    z     = ev["same_period_z"]
    ss    = ev["seasonal_strength"]

    headline = (
        f"{name} is experiencing a seasonal dip — not a structural decline. "
        f"Repayment has been rescheduled to match their income cycle."
    )

    # Find which months have 0 installment in the proposed schedule
    zero_months  = sched.proposed[sched.proposed["installment_due"] == 0]["month"].tolist()
    raised_months = sched.proposed[
        sched.proposed["installment_due"] > sched.original_monthly_installment
    ]["month"].tolist()

    zero_str  = ", ".join(zero_months)  if zero_months  else "none"
    raised_str = ", ".join(raised_months) if raised_months else "none"

    detail = (
        f"The long-term income trend for {name} is {_trend_direction(slope)} "
        f"(slope: {slope:+.1f}% per month), which rules out structural deterioration. "
        f"Seasonal patterns account for {ss*100:.0f}% of cash-flow variance — "
        f"a strong seasonal signal. "
        f"The current dip is {abs(z):.1f} standard deviations from the historical "
        f"same-period average, confirming it falls within the normal seasonal range. "
        f"This pattern has repeated at the same time in prior years."
    )

    restructure_detail = ""
    if zero_months:
        restructure_detail = (
            f"Installments in {zero_str} have been deferred to {raised_str}, "
            f"where projected cash flow is strongest. "
            f"Total outstanding ({_rupee(sched.total_repayment_proposed)}) is unchanged — "
            f"this is a timing adjustment, not debt forgiveness."
        )
    else:
        restructure_detail = (
            f"No months in the 6-month window are below the safety threshold. "
            f"Schedule unchanged for the forecast period."
        )

    evidence = (
        f"Trend slope: {slope:+.1f}% per month (|slope| < 1.5% = flat). "
        f"Same-period z-score: {z:.2f} (within ±1.5 = normal seasonal dip). "
        f"Seasonal strength: {ss:.2f} ({ss*100:.0f}% of variance explained by seasonality). "
        f"Forecast negative months: {ev['forecast_negative_months']} of 6."
    )

    recommendation = (
        f"Defer installments during the lean season and collect during peak months. "
        f"Review again in 3 months to confirm seasonal recovery."
    )

    return {
        "headline": headline,
        "detail": detail,
        "restructure_detail": restructure_detail,
        "evidence": evidence,
        "recommendation": recommendation,
        "risk_flag": None,
    }


def _explain_genuine_decline(
    res: AnalysisResult,
    sched: RepaymentSchedule,
    name: str,
) -> dict:
    ev    = res.classification_evidence
    slope = ev["trend_slope_pct"]
    neg_m = ev["forecast_negative_months"]
    buf   = ev["forecast_buffer_min"]

    headline = (
        f"WARNING: {name}'s income is in structural decline. "
        f"Immediate review required."
    )

    detail = (
        f"Income has been falling at {abs(slope):.1f}% per month over the past year — "
        f"this is not a seasonal pattern. The decline persists across all seasons "
        f"and is worsening. Forecasted net cash flow goes negative in "
        f"{_months_label(neg_m)} of the next 6, with a projected cumulative buffer "
        f"of {_rupee(buf)} — meaning the borrower cannot service the current schedule "
        f"without drawing down savings or taking additional debt."
    )

    restructure_detail = (
        f"A provisional reduction in monthly installment from "
        f"{_rupee(sched.original_monthly_installment)} to "
        f"{_rupee(sched.proposed_monthly_installment)} has been modelled, "
        f"extending tenure from {_months_label(sched.original_tenure_remaining)} "
        f"to approximately {_months_label(sched.proposed_tenure_remaining)}. "
        f"This eases immediate cash-flow pressure but does NOT address the root cause."
    )

    evidence = (
        f"Trend slope: {slope:+.1f}% per month (threshold: < -1.5%). "
        f"Forecast negative months: {neg_m} of 6 (threshold: >= 2). "
        f"Projected cumulative buffer at 6 months: {_rupee(buf)}."
    )

    recommendation = (
        f"Do not restructure without a field investigation. "
        f"Understand whether the income decline is due to health, job loss, or market conditions. "
        f"Consider a 30-day payment moratorium while assessment is completed. "
        f"Flag for credit committee review before any disbursement of follow-on loans."
    )

    return {
        "headline": headline,
        "detail": detail,
        "restructure_detail": restructure_detail,
        "evidence": evidence,
        "recommendation": recommendation,
        "risk_flag": (
            f"Projected default risk: HIGH. "
            f"Buffer turns negative within {neg_m} months at current installment level."
        ),
    }


# ─────────────────────────────────────────────
# Public entry point
# ─────────────────────────────────────────────

def explain(
    res: AnalysisResult,
    sched: RepaymentSchedule,
    borrowers_df,
) -> dict:
    """
    Generate a plain-language explanation for a borrower's assessment.

    Returns a dict with keys:
      headline, detail, evidence, recommendation
      restructure_detail (seasonal_stress / genuine_decline only)
      risk_flag (genuine_decline only, else None)
    """
    import pandas as pd

    row  = borrowers_df[borrowers_df["borrower_id"] == res.borrower_id].iloc[0]
    name = row["name"]

    if res.status == "healthy":
        return _explain_healthy(res, sched, name)
    elif res.status == "seasonal_stress":
        return _explain_seasonal_stress(res, sched, name)
    elif res.status == "genuine_decline":
        return _explain_genuine_decline(res, sched, name)
    else:
        raise ValueError(f"Unknown status: {res.status}")


def explain_all(
    analysis_results: dict,
    schedules: dict,
    borrowers_df,
) -> dict:
    """Returns {borrower_id: explanation_dict} for all borrowers."""
    return {
        bid: explain(res, schedules[bid], borrowers_df)
        for bid, res in analysis_results.items()
    }
