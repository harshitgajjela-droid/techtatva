import pandas as pd

txn = pd.read_csv("app/data/transactions.csv", parse_dates=["date"])
bor = pd.read_csv("app/data/borrowers.csv")

print("=== Borrowers ===")
print(bor[["borrower_id", "name", "archetype", "true_label", "trend"]].to_string(index=False))

print("\n=== Transaction summary per borrower ===")
for bid, grp in txn.groupby("borrower_id"):
    name  = bor.loc[bor.borrower_id == bid, "name"].values[0]
    label = bor.loc[bor.borrower_id == bid, "true_label"].values[0]
    print(f"\n{bid}  {name}  [{label}]")
    print(f"  Rows        : {len(grp)}")
    print(f"  Date range  : {grp.date.min().date()} to {grp.date.max().date()}")
    print(f"  Avg income  : Rs {grp.income.mean():.0f}/week")
    print(f"  Avg expenses: Rs {grp.expenses.mean():.0f}/week")
    print(f"  Avg net CF  : Rs {grp.net_cashflow.mean():.0f}/week")
    print(f"  Min net CF  : Rs {grp.net_cashflow.min():.0f}")
    print(f"  Max net CF  : Rs {grp.net_cashflow.max():.0f}")
    print(f"  Neg CF weeks: {(grp.net_cashflow < 0).sum()} / {len(grp)}")

print("\n=== Null check ===")
print(txn.isnull().sum())
print("\nAll done.")
