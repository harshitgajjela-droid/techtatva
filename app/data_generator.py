"""
data_generator.py
Generates 2 years of synthetic weekly transaction history for 3 borrower archetypes.

Borrowers:
  B001 - Ravi Kumar  - Farmer  - seasonal_stress   (harvest peaks, dry season dips, flat trend)
  B002 - Meena Devi  - Vendor  - healthy           (festival spikes, stable baseline, positive trend)
  B003 - Arjun Singh - Laborer - genuine_decline   (steady income erosion over last 12 months)

Output:
  app/data/borrowers.csv     — borrower metadata
  app/data/transactions.csv  — weekly transactions for all borrowers
"""

import numpy as np
import pandas as pd
from pathlib import Path

# ─────────────────────────────────────────────
# Reproducibility
# ─────────────────────────────────────────────
RNG = np.random.default_rng(42)

# ─────────────────────────────────────────────
# Shared parameters
# ─────────────────────────────────────────────
START_DATE = "2023-01-02"   # Monday
WEEKS      = 104            # 2 years of weekly data
DATES      = pd.date_range(start=START_DATE, periods=WEEKS, freq="W-MON")

# Loan schedule: monthly installment paid in the first week of each calendar month
MONTHLY_INSTALLMENT = 1_500   # ₹ per month, same for all borrowers in this demo


def _first_week_of_month(dates: pd.DatetimeIndex) -> np.ndarray:
    """Returns a boolean mask — True for the first week of each calendar month."""
    seen: set = set()
    mask = np.zeros(len(dates), dtype=bool)
    for i, d in enumerate(dates):
        key = (d.year, d.month)
        if key not in seen:
            seen.add(key)
            mask[i] = True
    return mask


REPAYMENT_MASK = _first_week_of_month(DATES)


# ─────────────────────────────────────────────
# Helper: add calibrated noise
# ─────────────────────────────────────────────
def _noise(scale: float, size: int) -> np.ndarray:
    return RNG.normal(0, scale, size)


# ─────────────────────────────────────────────
# B001 — Ravi Kumar, Farmer, seasonal_stress
# ─────────────────────────────────────────────
def generate_farmer(dates: pd.DatetimeIndex) -> pd.DataFrame:
    """
    Income pattern:
      - Two harvest peaks per year: Kharif (Oct) and Rabi (Apr).
      - Lean months: Jun–Aug (before kharif), Jan–Feb (before rabi).
      - Flat long-term trend — same pattern repeats across both years.
      - Seasonal amplitude: ~40% of base income.
    """
    n = len(dates)
    week_of_year = dates.isocalendar().week.to_numpy(dtype=float)

    base_income = 4_000  # ₹/week

    # Two sinusoidal peaks per year (weeks ~15 and ~42)
    seasonal = (
        0.45 * np.sin(2 * np.pi * (week_of_year - 15) / 52)
        + 0.20 * np.sin(4 * np.pi * (week_of_year - 10) / 52)
    )

    income = base_income * (1 + seasonal) + _noise(300, n)
    income = np.maximum(income, 500)   # floor: some odd-job income always exists

    # Expenses: fixed rent-like component + variable food/transport
    fixed_expenses  = 1_800 * np.ones(n)
    variable_expenses = 800 + 200 * np.sin(2 * np.pi * week_of_year / 52) + _noise(150, n)
    expenses = fixed_expenses + np.maximum(variable_expenses, 200)

    # Loan repayment
    repayment = np.where(REPAYMENT_MASK, MONTHLY_INSTALLMENT, 0).astype(float)

    net_cashflow = income - expenses - repayment

    return pd.DataFrame({
        "date": dates,
        "borrower_id": "B001",
        "income": income.round(2),
        "expenses": expenses.round(2),
        "loan_repayment": repayment.round(2),
        "net_cashflow": net_cashflow.round(2),
    })


# ─────────────────────────────────────────────
# B002 — Meena Devi, Vendor, healthy
# ─────────────────────────────────────────────
def generate_vendor(dates: pd.DatetimeIndex) -> pd.DataFrame:
    """
    Income pattern:
      - Festival spikes: Diwali (Oct–Nov), New Year, Holi (Mar).
      - Slight positive trend: business growing ~5% per year.
      - Expenses grow slightly but slower than income.
      - Buffer always positive even in slow months.
    """
    n = len(dates)
    t = np.arange(n)
    week_of_year = dates.isocalendar().week.to_numpy(dtype=float)

    base_income = 5_000
    trend       = 5.0 * t           # ~₹260/year growth
    festival    = (
        600  * np.exp(-0.5 * ((week_of_year - 44) / 3) ** 2)   # Diwali peak ~week 44
        + 400 * np.exp(-0.5 * ((week_of_year - 11) / 2) ** 2)  # Holi ~week 11
        + 300 * np.exp(-0.5 * ((week_of_year -  1) / 2) ** 2)  # New Year ~week 1
    )
    income = base_income + trend + festival + _noise(350, n)
    income = np.maximum(income, 1_500)

    fixed_expenses    = 2_000 * np.ones(n)
    variable_expenses = 1_000 + 2.0 * t + _noise(200, n)   # slight growth
    expenses = fixed_expenses + np.maximum(variable_expenses, 300)

    repayment = np.where(REPAYMENT_MASK, MONTHLY_INSTALLMENT, 0).astype(float)

    net_cashflow = income - expenses - repayment

    return pd.DataFrame({
        "date": dates,
        "borrower_id": "B002",
        "income": income.round(2),
        "expenses": expenses.round(2),
        "loan_repayment": repayment.round(2),
        "net_cashflow": net_cashflow.round(2),
    })


# ─────────────────────────────────────────────
# B003 — Arjun Singh, Laborer, genuine_decline
# ─────────────────────────────────────────────
def generate_laborer(dates: pd.DatetimeIndex) -> pd.DataFrame:
    """
    Income pattern:
      - Relatively flat for first year (construction work, consistent).
      - Negative trend kicks in ~week 52: site closures, health issues.
      - No seasonal pattern to speak of — the decline is structural.
      - Expenses stay constant; income falls → buffer goes negative.
    """
    n = len(dates)
    t = np.arange(n)

    base_income = 4_500

    # Flat first year, then accelerating decline
    decline = np.where(
        t < 52,
        0.0,
        -18.0 * (t - 52)           # ~₹936/year decline rate from week 52 onward
    )

    # Mild seasonal noise (NOT a real pattern — just work-schedule randomness)
    week_of_year = dates.isocalendar().week.to_numpy(dtype=float)
    mild_seasonal = 200 * np.sin(2 * np.pi * week_of_year / 52)

    income = base_income + decline + mild_seasonal + _noise(400, n)
    income = np.maximum(income, 300)

    fixed_expenses    = 2_200 * np.ones(n)
    variable_expenses = 900 + _noise(180, n)
    expenses = fixed_expenses + np.maximum(variable_expenses, 200)

    repayment = np.where(REPAYMENT_MASK, MONTHLY_INSTALLMENT, 0).astype(float)

    net_cashflow = income - expenses - repayment

    return pd.DataFrame({
        "date": dates,
        "borrower_id": "B003",
        "income": income.round(2),
        "expenses": expenses.round(2),
        "loan_repayment": repayment.round(2),
        "net_cashflow": net_cashflow.round(2),
    })


# ─────────────────────────────────────────────
# Borrower metadata
# ─────────────────────────────────────────────
BORROWER_META = pd.DataFrame([
    {
        "borrower_id":      "B001",
        "name":             "Ravi Kumar",
        "archetype":        "farmer",
        "true_label":       "seasonal_stress",
        "seasonal_pattern": "Kharif harvest (Oct), Rabi harvest (Apr); lean Jun–Aug and Jan–Feb",
        "trend":            "flat",
        "loan_amount":      75_000,
        "monthly_installment": MONTHLY_INSTALLMENT,
        "loan_tenure_months": 48,
        "loan_start":       "2023-01-01",
    },
    {
        "borrower_id":      "B002",
        "name":             "Meena Devi",
        "archetype":        "vendor",
        "true_label":       "healthy",
        "seasonal_pattern": "Festival spikes Diwali (Oct–Nov), Holi (Mar), New Year (Jan)",
        "trend":            "positive",
        "loan_amount":      60_000,
        "monthly_installment": MONTHLY_INSTALLMENT,
        "loan_tenure_months": 36,
        "loan_start":       "2023-01-01",
    },
    {
        "borrower_id":      "B003",
        "name":             "Arjun Singh",
        "archetype":        "laborer",
        "true_label":       "genuine_decline",
        "seasonal_pattern": "None — income decline is structural, not seasonal",
        "trend":            "negative",
        "loan_amount":      50_000,
        "monthly_installment": MONTHLY_INSTALLMENT,
        "loan_tenure_months": 30,
        "loan_start":       "2023-01-01",
    },
])


# ─────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────
def generate_all(output_dir: str = "app/data") -> tuple[pd.DataFrame, pd.DataFrame]:
    """Generate all borrower transactions, save CSVs, return (borrowers_df, transactions_df)."""
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    farmer  = generate_farmer(DATES)
    vendor  = generate_vendor(DATES)
    laborer = generate_laborer(DATES)

    transactions = pd.concat([farmer, vendor, laborer], ignore_index=True)
    transactions["date"] = pd.to_datetime(transactions["date"])

    borrowers_path    = out / "borrowers.csv"
    transactions_path = out / "transactions.csv"

    BORROWER_META.to_csv(borrowers_path, index=False)
    transactions.to_csv(transactions_path, index=False)

    print(f"[data_generator] Saved {len(BORROWER_META)} borrowers  → {borrowers_path}")
    print(f"[data_generator] Saved {len(transactions)} rows         → {transactions_path}")

    return BORROWER_META, transactions


if __name__ == "__main__":
    generate_all()
