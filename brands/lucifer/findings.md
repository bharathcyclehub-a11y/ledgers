# Lucifer (Lucifire Bikes) — Deep-Scan Findings & Missing Links

**Scanned 13-Jun-2026:** full WhatsApp export "Prashant Lucifire Bike P" (Apr-2024 → 11-Jun-2026): 1,079 chat lines, 88 images, 56 PDFs — raw files in `brands/lucifer/chat/`. Supplier: Lucifer Bikes Pvt Ltd, Rohtak (GSTIN 06AAECL6390H1ZC); payments to HDFC A/c …7722. Rep: Prashant.

## Ledger position (Lucifer's own books)

Latest statement (00000729, period to 02-Jun-26, last txn 31-May-26):
**Closing ₹15,89,893 Dr.** Verified internally: opening 2,53,142 + debits 66,56,616 − credits 53,19,865 = 15,89,893 ✓. FY24-25 closed at ₹2,53,142 Dr (carried as opening).

## Are all payments recovered? — YES, with two exceptions

12 payments have proof in the chat (10 screenshots + 2 bank-SMS). 11 of them are credited in Lucifer's ledger to the exact rupee. Findings:

1. **11-Jun-26 ₹5,00,000 (IMPS 616220748924) — PAID, NOT YET POSTED.** The latest
   ledger was generated 4-Jun, before this payment. So Lucifer's "due ₹15,89,893"
   is overstated by ₹5L. **Real balance after this posts ≈ ₹10,89,893.** This is
   the single biggest missing link. Get a fresh ledger showing this credit.
2. **17-Feb-26 ₹3,00,000 (Rcpt 1203, ref 0000604816429002) — CREDITED, NO PROOF
   in this chat.** It's in our favour (they credited it) but there's no screenshot
   /SMS for it — confirm in the bank statement it was genuinely sent by BCH.

Every other payment (₹42,01,317 across 11 receipts) matches a screenshot/SMS and
a ledger receipt line. Full map in `payments.csv`.

## Our ledger vs their ledger — ₹1,03,867 mismatch

Our LUCIFER LEDGER.xlsx closes ₹14,86,026; Lucifer closes ₹15,89,893. Gap =
₹1,03,867, entirely the two 12-Mar discounts (₹80,647 LB/0600 + ₹23,220 LB/0689)
they showed then deleted. ⚠ Our ledger double-counts LB/0600 (carries both the
₹80,647 and DIS-304 ₹72,895) — fix our Tally up by ₹72,895 → true position
₹15,58,921. Genuine withdrawn discount = ₹30,972. See `our-vs-their-ledger.md`.

## Discounts — see discounts.md. CD rate: 20% (to May-25) → 18% (Jun-25→Mar-26) → 17% (FY26-27, confirm). Key claimables (total ₹3,99,268):

- **₹30,972 withdrawn** (12-Mar reversal, net of DIS-304); **₹539 + ₹1,050** under-credits on DIS-90/DIS-210.
- **Missed CD**: LB/0468 ₹1,944 · LB/814 ₹15,570 · LB/849 ₹25,380.
- **FY26-27 invoices (₹18.84L) no CD yet** — LB/041 ₹1,39,130 + LB/0272 ₹1,65,933 @17% + ₹18,750 transport. Confirm 17% rate; claim within 60 days.
- **CN-48 ₹45,218** = delivery shortage (5 boxes short on LB/0364); ₹1,875 unloading still to reimburse.

## Goods disputes / shortage (missing links on stock)

1. **5-box shortage on LB/0364** (14-Oct-25, 123→125 box dispute). Handwritten on
   invoice 283: "5 box shortage, total received = 125 box". Chat 2-Nov: "missing
   5 cycles". **CN-48 (27-Feb-26, ₹45,218, 5 bikes: 3 Elante Jr + 1 Robber + 1
   Invalid)** likely settles this — confirm CN-48 = the 5 missing boxes, not a
   separate return.
2. **₹1,875 unloading charge** paid by BCH on LB/0364 (handwritten on 283) — claimable.
3. **7-10 cycles chain/chainwheel defects** (18-Nov-25) — 8 chainwheels + chains
   promised as replacement, not credited.
4. **Wrong wheel + missing chain cover** (13-Feb-26) — disc wheel sent on non-disc
   cycle; replacement promised.
5. **Max-dealer cross-dispatch** (2-Nov-25): some BCH-ordered cycles went to dealer
   "Max"; reconciliation of who got what was never closed.

## Open items / to get from Prashant

- [ ] Fresh ledger reflecting the 11-Jun ₹5,00,000 payment
- [ ] Confirm 17-Feb ₹3,00,000 (Rcpt 1203) in BCH bank statement
- [ ] Restore the ₹30,972 March discount that was reversed
- [ ] CD on FY26-27 invoices LB/26-27/041 + 0272 (₹18.84L) — rate + journal
- [ ] Confirm CN-48 covers the 5-box LB/0364 shortage; claim ₹1,875 unloading
- [ ] CNs for chain/chainwheel/wheel defect replacements
