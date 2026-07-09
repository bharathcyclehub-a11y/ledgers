# Trinity Cycles — Gaps Register
_BCH ↔ Trinity · updated 2026-07-07_

**Balance position:** Not yet reconstructed — no BCH ledger exists for Trinity. Only one invoice (TCI/P/26-27/1551, Pargaon) has been reviewed; the Ludhiana invoice is not yet received and no payments/receipts have been tallied.
**Total quantified gap / recoverable:** ₹10,211 currently-capturable (30-day cash discount, deadline 15-Jul-2026). Note: ₹40,843 (4% CD) was potentially available at full but its 1-day window and the 2.5%/1.5% slabs have lapsed as of today. Broader reconciliation TBD — analysis pending.

| # | Gap | Type | Amount (₹) | Status | Evidence (date · source) | Action |
|---|-----|------|-----------:|--------|--------------------------|--------|
| 1 | Invoice 1551 billed 120 cycles vs the "2-each" Pargaon order of 96 (48 lines × 2) — 24 extra cycles (extra Rocco/M500). Confirm quantities were intended, not an over-supply. | invoice-discrepancy | 96 ordered → 120 billed (24-cycle variance; ₹10,21,064 taxable billed) | verify | 15-Jun-2026 · invoice-review-1551.md (line 40) + order-2026-06-09.csv (Pargaon 48 lines / 96 qty) | Confirm the 24 extra cycles were ordered/agreed; if not, seek credit note or return |
| 2 | 30-day cash discount 1% still capturable if paid by 15-Jul-2026 | discount-pending | 10,211 | open | 15-Jun-2026 · invoice-review-1551.md (CD slab, lines 28-35) | Pay before 15-Jul-2026 to secure 1% CD |
| 3 | Higher CD slabs lapsed: 1-day 4% (₹40,843), 10-day 2.5% (₹25,527), 20-day 1.5% (₹15,316) — invoice 15-Jun, today 07-Jul = 22 days elapsed | discount-pending | 40,843 (max, now lapsed) | verify | 15-Jun-2026 · invoice-review-1551.md (lines 28-35); timing per today 07-Jul | Verify actual payment date vs slabs; document CD actually captured vs foregone |
| 4 | After 45 days (from 15-Jun → 30-Jul-2026) Trinity charges 24% p.a. interest on overdue; "NO BILLING IF O/S MORE THAN 60 DAYS" | operational-warranty | TBD (24% p.a. accrues from 30-Jul-2026 if unpaid) | open | 15-Jun-2026 · invoice-review-1551.md (line 35); stock sheet headers "NO BILLING IF O.S MORE THAN 60 DAYS" | Clear invoice 1551 before 30-Jul-2026 to avoid interest and billing block |
| 5 | Ludhiana order (~260 cycles / 66 lines, ₹15,21,480 BDP) placed but no invoice received/reviewed | documentation-gap | ~15,21,480 BDP (order value; taxable/discount TBD) | open | 09-Jun-2026 · order-2026-06-09.csv (Ludhiana 66 lines / 260 qty); invoice-review-1551.md (line 39, "Ludhiana invoice expected") | Obtain Ludhiana invoice; review schemes (Rs.500-less-per-cycle Ariana, etc.) the same way as 1551 |
| 6 | No BCH ledger, no payments/receipts reconciled — overall Trinity balance unknown | balance-unconfirmed | TBD | open | 07-Jul-2026 · no ledger file present in /trinity/ | Reconstruct BCH↔Trinity ledger from invoices, payments and bank (Kotak A/c 9812447652, IFSC KKBK0001753) |

## Notes / still to analyse
- **No ledger reconstructed yet.** The `/trinity/` folder contains only: invoice-review-1551.md, order-2026-06-09.csv, and two Trinity stock/price sheets (09-Jun, 13-Jun). There is no BCH accounting ledger, so no running balance or true-net position can be stated.
- **No ledger HTML produced** for Trinity (unlike other brands).
- **Chat / WhatsApp not yet mined** — no communications reviewed for confirmations, disputes, promised credits, or payment acknowledgements.
- **Balance unconfirmed** — neither BCH's books nor Trinity's statement of account has been obtained/compared; opening balance and payment history are unknown.
- **Only the Pargaon invoice (1551) is analysed.** Its verdict is a BENEFIT: schemes honoured correctly (~17.9% off BDP, ≈22% with 4% CD); free goods verified exact (8 Keysto KS 000 from 8 Schnell M500; 11 Schnell Rocco from 44 Rocco); BDP rates match the 09-Jun stock sheet with no price inflation. So gaps here are open items to confirm, not confirmed losses.
- **Stock sheets carry no discrepancy vs invoice pricing:** BDP and June schemes are identical between the 09-Jun and 13-Jun sheets (0 price changes, 0 scheme changes) for all common items across both Pargaon and Ludhiana. These are Trinity availability/price lists, not BCH stock counts — so no physical-stock discrepancy can be assessed from them.
- **Ludhiana invoice review pending** (Gap 5) — biggest un-analysed exposure (~260 cycles, ₹15.2L BDP order value).
- **Minimum-billing / terms note:** Trinity requires "MINIMUM BILLING 40K WITHOUT GST" and blocks billing if outstanding > 60 days — relevant once the ledger and payment cadence are built.
- Cross-verify the 24-cycle over-bill (Gap 1) line-by-line against invoice 1551's 59 lines to identify exactly which SKUs exceeded the ordered "2 each" quantity.
