# Lucifer — Our ledger vs Their ledger (mismatch analysis)

> Our ledger: `LUCIFER LEDGER.xlsx` (BCH's Tally, 01-Apr-25 → 31-May-26).
> Their ledger: Lucifer's statement `00000729-bharat cycle hub st.pdf` (to 31-May-26).

## The headline mismatch = ₹1,03,867

| | Closing balance (Dr) |
|---|---|
| **Our ledger** (LUCIFER LEDGER.xlsx) | **₹14,86,026** |
| **Lucifer's ledger** (00000729) | **₹15,89,893** |
| **Mismatch** | **₹1,03,867** |

The two ledgers agree on every purchase and every payment to the rupee. The
**entire ₹1,03,867 difference is discount**: our ledger still carries the two
12-Mar-2026 discount entries (₹80,647 + ₹23,220, both tagged "PENDING") that
Lucifer showed on its 12-Mar statement and then **deleted** from all later
statements. So our books claim ₹1,03,867 more discount than Lucifer now grants.

## Important caveat — our ledger has a double-count

Our ledger records, for invoice **LB/0600**, BOTH:
- the 12-Mar ₹80,647 (18% CD shown then withdrawn), AND
- DIS-304 ₹72,895 (the partial re-grant Lucifer actually booked 24-Mar).

These are the **same** entitlement (both "LB/0600 18%"), so our ledger
over-claims by ₹72,895. Correcting that:

```
Our ledger closing                       14,86,026
+ remove double-counted DIS-304          +72,895
= Our corrected position                 15,58,921
Lucifer's ledger                         15,89,893
True shortfall Lucifer owes (withdrawn)  −30,972   (= 15,89,893 − 15,58,921)
```

So of the ₹1,03,867 gap: **₹72,895 is a bookkeeping double-count to fix in our
Tally**, and **₹30,972 is a genuine discount Lucifer showed then took back** —
that is the real claim from this reversal.

## Action

1. Fix our Tally: remove the duplicate LB/0600 discount so our balance reads
   ₹15,58,921 (before the further claims below), not ₹14,86,026.
2. Then pursue the ₹30,972 withdrawn discount + the wider missed-CD list in
   `discounts.md` (₹3.99L total) + the 11-Jun ₹5,00,000 payment not yet posted.

Net payable after the 11-Jun payment and all legitimate CD claims ≈ **₹6.9 lakh**
(15,89,893 − 5,00,000 − 3,99,268), vs the ₹15,89,893 Lucifer currently shows.
