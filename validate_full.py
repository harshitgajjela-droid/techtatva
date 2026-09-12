"""
Full pipeline validation: runs analysis, restructuring, and explainability
for all 3 borrowers and prints a summary. No Streamlit required.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent / "app"))

import pandas as pd
from analysis      import analyze_all
from restructuring import restructure_all
from explain       import explain_all

root = Path(__file__).parent
txn  = pd.read_csv(root / "app" / "data" / "transactions.csv", parse_dates=["date"])
bor  = pd.read_csv(root / "app" / "data" / "borrowers.csv")

label_map = dict(zip(bor["borrower_id"], bor["true_label"]))
name_map  = dict(zip(bor["borrower_id"], bor["name"]))

print("\nStep 1: Analysis")
analysis = analyze_all(txn)
all_pass = True
for bid, res in sorted(analysis.items()):
    true_l = label_map[bid]
    pred_l = res.status
    ok = "PASS" if true_l == pred_l else "FAIL"
    ev = res.classification_evidence
    if true_l != pred_l:
        all_pass = False
    print(f"  {bid} {name_map[bid]:<14} true={true_l:<20} pred={pred_l:<20} slope={ev['trend_slope_pct']:+.2f}% z={ev['same_period_z']:.2f} seas={ev['seasonal_strength']:.2f} neg={ev['forecast_negative_months']}  [{ok}]")

print("\nStep 2: Restructuring")
schedules = restructure_all(analysis, bor)
for bid, sched in sorted(schedules.items()):
    print(f"  {bid} {name_map[bid]:<14} orig=Rs{sched.original_monthly_installment:,.0f}/mo  prop=Rs{sched.proposed_monthly_installment:,.0f}/mo  orig_tenure={sched.original_tenure_remaining}mo  prop_tenure={sched.proposed_tenure_remaining}mo")

print("\nStep 3: Explanations")
explanations = explain_all(analysis, schedules, bor)
for bid, expl in sorted(explanations.items()):
    print(f"  {bid} {name_map[bid]:<14} headline={expl['headline'][:80]}...")

print("\nStep 4: Forecast shape checks")
for bid, res in sorted(analysis.items()):
    fc = res.forecast
    assert len(fc.dates)             == 6, f"{bid}: expected 6 forecast months"
    assert len(fc.forecast)          == 6
    assert len(fc.lower)             == 6
    assert len(fc.upper)             == 6
    assert len(fc.cumulative_buffer) == 6
    print(f"  {bid} forecast OK  | min_buffer=Rs{fc.cumulative_buffer.min():,.0f}  max_buffer=Rs{fc.cumulative_buffer.max():,.0f}")

print()
if all_pass:
    print("ALL CHECKS PASSED.")
else:
    print("SOME CHECKS FAILED - review classification thresholds.")
    sys.exit(1)
