"""
analysis.py
Core analysis engine for microloan cash-flow health assessment.

Pipeline per borrower:
  1. Load & resample to monthly
  2. STL decomposition → trend, seasonal, residual
  3. Forecast next 6 months (seasonal-naive + trend extrapolation)
  4. Classify: healthy | seasonal_stress | genuine_decline
  5. Compute projected liquidity buffer vs repayment obligations

All functions are pure (take DataFrames, return DataFrames/dicts) so they
can be called from Streamlit, FastAPI, or tests without side effects.
"""

import warnings
import numpy as np
import pandas as pd
from dataclasses import dataclass, field
from typing import Literal
from statsmodels.tsa.seasonal import STL

warnings.filterwarnings("ignore")

# ─────────────────────────────────────────────
# Types
# ─────────────────────────────────────────────
Status = Literal["healthy", "seasonal_stress", "genuine_decline"]

FORECAST_MONTHS = 6
MONTHLY_INSTALLMENT = 1_500   # ₹ — matches data_generator


@dataclass
class DecompositionResult:
    monthly: pd.DataFrame          # date, net_cashflow, income, expenses
    trend: pd.Series
    seasonal: pd.Series
    residual: pd.Series
    trend_slope: float             # ₹ per month (linear regression on trend component)
    trend_slope_pct: float         # slope as % of mean income
    seasonal_strength: float       # 0–1, how dominant seasonal component is
    same_period_z: float           # z-score: current dip vs same months prior year


@dataclass
class ForecastResult:
    dates: pd.DatetimeIndex
    forecast: np.ndarray           # predicted net cashflow per month
    lower: np.ndarray              # 80% CI lower
    upper: np.ndarray              # 80% CI upper
    cumulative_buffer: np.ndarray  # forecast net CF minus repayment obligations


@dataclass
class AnalysisResult:
    borrower_id: str
    status: Status
    decomposition: DecompositionResult
    forecast: ForecastResult
    classification_evidence: dict  # raw numbers behind the decision
    monthly: pd.DataFrame          # convenience alias


# ─────────────────────────────────────────────
# Step 1: Resample weekly → monthly
# ─────────────────────────────────────────────
def resample_monthly(txn: pd.DataFrame) -> pd.DataFrame:
    """
    Aggregate weekly rows to calendar-month totals.
    Loan repayment is summed (it's already a once-a-month event, but sum is safe).
    """
    df = txn.copy()
    df["date"] = pd.to_datetime(df["date"])
    df = df.set_index("date")

    monthly = df[["income", "expenses", "loan_repayment", "net_cashflow"]].resample("MS").sum()
    monthly = monthly.reset_index().rename(columns={"date": "month"})
    return monthly


# ─────────────────────────────────────────────
# Step 2: STL decomposition
# ─────────────────────────────────────────────
def decompose(monthly: pd.DataFrame) -> DecompositionResult:
    """
    Run STL on monthly net_cashflow.

    STL params:
      period=12  — annual seasonality
      seasonal=7 — smoothing window (odd, >= 7 for 12-period series)
      robust=True — down-weights outliers
    """
    series = monthly.set_index("month")["net_cashflow"]

    stl = STL(series, period=12, seasonal=7, robust=True)
    result = stl.fit()

    trend    = pd.Series(result.trend,    index=series.index, name="trend")
    seasonal = pd.Series(result.seasonal, index=series.index, name="seasonal")
    residual = pd.Series(result.resid,    index=series.index, name="residual")

    # ── Trend slope via OLS on the trend component ──
    x = np.arange(len(trend))
    slope, intercept = np.polyfit(x, trend.values, 1)   # ₹/month
    mean_income = monthly["income"].mean()
    slope_pct = (slope / mean_income) * 100 if mean_income > 0 else 0.0

    # ── Seasonal strength (ratio of seasonal variance to total variance) ──
    var_seasonal = np.var(seasonal.values)
    var_total    = np.var(series.values)
    seasonal_strength = float(var_seasonal / var_total) if var_total > 0 else 0.0

    # ── Same-period z-score ──
    # Compare last 3 months of data against the same 3 months one year ago.
    # A z-score near 0 means "this dip is normal for this time of year."
    same_period_z = _same_period_z(monthly)

    return DecompositionResult(
        monthly=monthly,
        trend=trend,
        seasonal=seasonal,
        residual=residual,
        trend_slope=float(slope),
        trend_slope_pct=float(slope_pct),
        seasonal_strength=float(seasonal_strength),
        same_period_z=float(same_period_z),
    )


def _same_period_z(monthly: pd.DataFrame) -> float:
    """
    Z-score of the last 3 months' net cashflow vs the same 3 months one year prior.
    Uses all available same-month data to build the distribution.

    Returns 0.0 if there isn't enough history.
    """
    df = monthly.copy()
    df["month_num"] = df["month"].dt.month
    df["year"]      = df["month"].dt.year

    last_3 = df.tail(3)
    target_months = last_3["month_num"].tolist()

    historical = df[
        df["month_num"].isin(target_months) & ~df.index.isin(last_3.index)
    ]

    if len(historical) < 3:
        return 0.0

    mu  = historical["net_cashflow"].mean()
    std = historical["net_cashflow"].std()

    if std < 1e-6:
        return 0.0

    current_mean = last_3["net_cashflow"].mean()
    return float((current_mean - mu) / std)


# ─────────────────────────────────────────────
# Step 3: Forecasting
# ─────────────────────────────────────────────
def forecast(
    monthly: pd.DataFrame,
    decomp: DecompositionResult,
    n_months: int = FORECAST_MONTHS,
) -> ForecastResult:
    """
    Seasonal-naive forecast + linear trend extrapolation.

    Forecast for month t+k:
      yhat[k] = trend_at_end + slope * k + seasonal[same month last year]

    Confidence interval: ±1.28 * std(residual) (80% CI)
    """
    series        = monthly["net_cashflow"].values
    n             = len(series)
    trend_vals    = decomp.trend.values
    seasonal_vals = decomp.seasonal.values
    residual_vals = decomp.residual.values

    last_trend    = trend_vals[-1]
    slope         = decomp.trend_slope
    residual_std  = float(np.std(residual_vals))

    last_date = monthly["month"].iloc[-1]
    future_dates = pd.date_range(
        start=last_date + pd.DateOffset(months=1),
        periods=n_months,
        freq="MS",
    )

    yhat  = np.zeros(n_months)
    lower = np.zeros(n_months)
    upper = np.zeros(n_months)

    for k in range(n_months):
        # Trend projection
        trend_proj = last_trend + slope * (k + 1)

        # Seasonal: use the value from the same calendar month, 12 months back
        target_month = future_dates[k].month
        same_month_idx = [
            i for i, d in enumerate(monthly["month"])
            if d.month == target_month
        ]
        if same_month_idx:
            seas_val = float(np.mean([seasonal_vals[i] for i in same_month_idx]))
        else:
            seas_val = 0.0

        yhat[k]  = trend_proj + seas_val
        lower[k] = yhat[k] - 1.28 * residual_std
        upper[k] = yhat[k] + 1.28 * residual_std

    # Projected liquidity buffer = cumulative forecast net CF − repayment obligations
    # We assume ₹1500 repayment every month going forward
    repayment_obligations = np.full(n_months, MONTHLY_INSTALLMENT * 4)  # ~4 weeks/month
    cumulative_buffer = np.cumsum(yhat) - np.cumsum(repayment_obligations)

    return ForecastResult(
        dates=future_dates,
        forecast=yhat,
        lower=lower,
        upper=upper,
        cumulative_buffer=cumulative_buffer,
    )


# ─────────────────────────────────────────────
# Step 4: Classification
# ─────────────────────────────────────────────
# Thresholds — tuned on synthetic ground truth
SLOPE_DECLINE_THRESHOLD_PCT = -0.5   # trend slope < -0.5% of mean income/month → declining
SLOPE_FLAT_THRESHOLD_PCT    =  1.0   # |slope| < 1.0% → flat trend
SEASONAL_STRENGTH_MIN       =  0.10  # seasonal component must explain ≥10% variance
SAME_PERIOD_Z_MAX           =  1.5   # within 1.5 SD of historical same-period → normal dip
BUFFER_NEGATIVE_MONTHS      =  0     # genuine_decline: any neg forecast months (0 = don't gate on this)


def classify(decomp: DecompositionResult, fc: ForecastResult) -> tuple[Status, dict]:
    """
    Rule-based classifier. Returns (status, evidence_dict).

    Rules (evaluated in priority order):
      1. genuine_decline  : trend_slope_pct < SLOPE_DECLINE_THRESHOLD_PCT
                            (persistent negative slope is the primary signal)
      2. seasonal_stress  : trend is flat (|slope_pct| < SLOPE_FLAT_THRESHOLD_PCT)
                            AND seasonal component is meaningful (ss >= min)
                            AND the borrower is currently in a dip (z < SAME_PERIOD_Z_MAX)
                            AND the dip is historically normal (|z| within range)
      3. healthy          : positive/flat trend, no current stress signal

    Key distinction:
      - genuine_decline fires on trend slope alone — the decline is structural and
        persistent, independent of whether this particular month is negative.
      - seasonal_stress requires BOTH a flat trend AND a current below-average period,
        confirming the dip is seasonal rather than a new baseline.
      - A vendor with strong festival spikes but no current dip and positive trend
        is correctly classified as healthy, not seasonal_stress.
    """
    sp         = decomp.trend_slope_pct
    z          = decomp.same_period_z
    ss         = decomp.seasonal_strength
    neg_months = int(np.sum(fc.forecast < 0))

    evidence = {
        "trend_slope_pct":          round(sp, 3),
        "same_period_z":            round(z, 3),
        "seasonal_strength":        round(ss, 3),
        "forecast_negative_months": neg_months,
        "forecast_buffer_min":      round(float(fc.cumulative_buffer.min()), 2),
    }

    # Rule 1: genuine decline — negative trend is the primary signal
    if sp < SLOPE_DECLINE_THRESHOLD_PCT:
        return "genuine_decline", evidence

    # Rule 2: seasonal stress — flat trend + current dip is within historical norm
    # z < 0 means the borrower is currently BELOW their historical same-period average
    # (i.e., they are actually in a dip right now, not just seasonally volatile)
    if (
        abs(sp) < SLOPE_FLAT_THRESHOLD_PCT
        and ss >= SEASONAL_STRENGTH_MIN
        and z < 0                         # currently in a below-average period
        and abs(z) < SAME_PERIOD_Z_MAX    # dip is within the normal seasonal range
    ):
        return "seasonal_stress", evidence

    # Rule 3: healthy
    return "healthy", evidence


# ─────────────────────────────────────────────
# Step 5: Full pipeline for one borrower
# ─────────────────────────────────────────────
def analyze_borrower(
    borrower_id: str,
    txn: pd.DataFrame,
) -> AnalysisResult:
    """
    Run the full pipeline for a single borrower.

    Parameters
    ----------
    borrower_id : str
        e.g. "B001"
    txn : pd.DataFrame
        Full transactions DataFrame (all borrowers OK — filtered internally)
    """
    subset = txn[txn["borrower_id"] == borrower_id].copy()
    if subset.empty:
        raise ValueError(f"No transactions found for borrower {borrower_id}")

    monthly = resample_monthly(subset)
    decomp  = decompose(monthly)
    fc      = forecast(monthly, decomp)
    status, evidence = classify(decomp, fc)

    return AnalysisResult(
        borrower_id=borrower_id,
        status=status,
        decomposition=decomp,
        forecast=fc,
        classification_evidence=evidence,
        monthly=monthly,
    )


# ─────────────────────────────────────────────
# Convenience: analyze all borrowers at once
# ─────────────────────────────────────────────
def analyze_all(txn: pd.DataFrame) -> dict[str, AnalysisResult]:
    """Returns {borrower_id: AnalysisResult} for every borrower in txn."""
    results = {}
    for bid in txn["borrower_id"].unique():
        results[bid] = analyze_borrower(bid, txn)
    return results


# ─────────────────────────────────────────────
# Quick validation when run directly
# ─────────────────────────────────────────────
if __name__ == "__main__":
    import sys
    from pathlib import Path

    root = Path(__file__).parent.parent
    txn  = pd.read_csv(root / "app" / "data" / "transactions.csv", parse_dates=["date"])
    bor  = pd.read_csv(root / "app" / "data" / "borrowers.csv")

    label_map = dict(zip(bor["borrower_id"], bor["true_label"]))

    print(f"{'ID':<6} {'Name':<14} {'True Label':<20} {'Predicted':<20} {'Slope%':>8} {'Z':>6} {'SeasStr':>8} {'NegMos':>7}")
    print("─" * 90)

    all_correct = True
    for bid, res in analyze_all(txn).items():
        name   = bor.loc[bor.borrower_id == bid, "name"].values[0]
        true_l = label_map[bid]
        pred_l = res.status
        ev     = res.classification_evidence
        match  = "✓" if true_l == pred_l else "✗"
        if true_l != pred_l:
            all_correct = False
        print(
            f"{bid:<6} {name:<14} {true_l:<20} {pred_l:<20} "
            f"{ev['trend_slope_pct']:>8.2f} "
            f"{ev['same_period_z']:>6.2f} "
            f"{ev['seasonal_strength']:>8.3f} "
            f"{ev['forecast_negative_months']:>7}  {match}"
        )

    print()
    if all_correct:
        print("All 3 borrowers classified correctly.")
    else:
        print("WARNING: Classification mismatch — tune thresholds.")
    sys.exit(0 if all_correct else 1)
