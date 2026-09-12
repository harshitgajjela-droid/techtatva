"""
Standalone validation: runs the analysis pipeline on all 3 borrowers
and checks that predicted labels match ground truth.
"""
import sys
import pandas as pd
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "app"))

from analysis import analyze_all

root = Path(__file__).parent
txn  = pd.read_csv(root / "app" / "data" / "transactions.csv", parse_dates=["date"])
bor  = pd.read_csv(root / "app" / "data" / "borrowers.csv")

label_map = dict(zip(bor["borrower_id"], bor["true_label"]))
name_map  = dict(zip(bor["borrower_id"], bor["name"]))

print(f"\n{'ID':<6} {'Name':<14} {'True Label':<20} {'Predicted':<20} {'Slope%':>8} {'Z':>7} {'SeasStr':>9} {'NegMos':>7}  OK?")
print("-" * 100)

all_correct = True
for bid, res in sorted(analyze_all(txn).items()):
    name   = name_map[bid]
    true_l = label_map[bid]
    pred_l = res.status
    ev     = res.classification_evidence
    ok     = "PASS" if true_l == pred_l else "FAIL"
    if true_l != pred_l:
        all_correct = False
    print(
        f"{bid:<6} {name:<14} {true_l:<20} {pred_l:<20} "
        f"{ev['trend_slope_pct']:>8.2f} "
        f"{ev['same_period_z']:>7.2f} "
        f"{ev['seasonal_strength']:>9.3f} "
        f"{ev['forecast_negative_months']:>7}  {ok}"
    )

print()
if all_correct:
    print("All 3 borrowers classified correctly.")
else:
    print("WARNING: Classification mismatch - check thresholds.")

sys.exit(0 if all_correct else 1)
