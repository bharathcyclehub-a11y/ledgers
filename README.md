# Brand Ledger Reconciliation

This directory tracks brand-side ledgers for Bharath Cycle Hub (Bangalore) and reconciles them against:

1. **Promised discounts** from each brand (the main goal — record every promised discount and make sure it is actually credited).
2. **Our bank statement** (verify every payment we sent is recorded on the brand's ledger).

## Structure

```
ledgers/
  README.md                  ← this file
  brands/
    <brand-name>/
      chat/                  ← raw WhatsApp export with the brand rep (evidence)
      <brand>-ledger.html    ← consolidated ledger view (share with the brand)
      payments.csv           ← every payment with txn IDs (for bank matching)
      discounts.md / commitments / findings.md ← promised discounts: what, when, by whom, status
      reconciliation.md      ← working file: differences found, net payable computation
```

## Workflow per brand

1. Transcribe the brand's ledger into `ledger.csv` (one row per invoice) and `payments.csv` (one row per payment they acknowledge receiving).
2. Record promised discounts in `discounts.md` — amount/percentage, which invoices or period they apply to, who promised it and how (call/WhatsApp/email), and whether a credit note was issued.
3. When the bank statement arrives, match each outgoing payment to `payments.csv`. Flag payments we sent that the brand has not recorded.
4. Compute **net payable** in `reconciliation.md`:
   `Net payable = Ledger due − unrecorded payments − promised discounts not yet credited`
5. Keep `reconciliation.md` updated as the single source of truth for what we actually owe.

## Conventions

- Amounts in INR, no thousands separators in CSVs.
- Dates in YYYY-MM-DD. Brand ledgers often omit the year — infer from sequence and note the assumption in the file header.
- Never silently edit the brand's numbers: `ledger.csv` mirrors what the brand sent. Our corrections live in `reconciliation.md`.

## Brands

- **Aoki** — consolidated ledger done (`brands/aoki/aoki-ledger.html`). Net payable ₹5,42,880 with all credits. Bank statement pending.
- **Raleigh / Suncross** (distributor Naren International, Ludhiana; rep Mohineesh Kumar) — deep scan done 2026-06-12 (`brands/raleigh/findings.md`). Balance per Naren 10-Jun-26: ₹38,34,108.85 Dr. Commitments awaiting owner approval (`brands/raleigh/commitments-pending-approval.md`).
- **Lucifer / Lucifire Bikes** (rep Prashant) — deep scan done 2026-06-13 (`brands/lucifer/lucifer-ledger.html`). Due per Lucifer 31-May-26: ₹15,89,893 Dr; real balance ₹10,89,893 after the 11-Jun ₹5L payment. All proven payments are recorded. Phased discounts: 20% steel / 18% alloy / ₹150-per-cycle transport.
- **Hornback** (Hornback E Mobility Pvt Ltd, Telangana; brand "ZOP"/Crayz/Vyper; POC **Aditya Vashishta**, ex-Lucifer SM, now Dlyft — "DL" invoice prefix) — done 2026-06-18 (`brands/hornback/hornback-ledger.html`, `findings.md`, `payments.csv`, POC chats in `chat/`). Per Hornback's official SOA (1-Apr-2024→30-Jun-2026): invoiced ₹26,73,518.19, received ₹22,07,603 (26 receipts, re-totalled — ties exactly), 8 CNs ₹4,20,276, **balance due ₹4,65,915.19**. **DISPUTE: discount is being given at 15% (proven — CN148 = 15% × ₹7,46,553, POC's own note) but Syed says the deal was 20% → ~5% gap ≈ ₹1.3-1.4L.** Plus discount only "from July-2025" (pre-July ≈₹4.16L under-credited ~₹40-60k) + foldable-M1 CN, ₹400/cycle & ₹1,500-Xpand supports to verify. Payments internally consistent (need BCH bank stmt to confirm none missing); balance hit 170+ days overdue (BCH-side delay). Clean ledger. **Need: written 20% agreement** to claim Dispute #1.

- **EMotorad** (seller *Inkodop Technologies*; National Sales Head Sandeep Sir, RSM South Jayachandra V, ex-POC Darshan P now at TVS) — deep scan done 2026-06-17, deepened with full ledger reconstruction. BCH's #1 brand (~50–60% of revenue). **TWO folios**: Bharath Cycle Centre (BCC, code 121) + Bharath Cycle Hub (BCH, code 666). Built from 3 WhatsApp exports (Darshan 9,343 / Sandeep 2,333 / Jaya 701 msgs), EM Statements of Account (BCC+BCH to Jan-2025), franchise-121 ERP export (BCC to Jul-2025), Tally consolidated ledger (FY23-25), EM BIZ app, 17 CN PDFs, and BCH's Service Review deck.
  - **Ledgers** (`brands/emotorad/emotorad-accounts-ledger.html`): BCH closing **₹1,03,38,282 Dr (6-Jan-2025)**; BCC settled to **₹3,48,345.92 Dr (dormant, RSM-confirmed Apr-2026)**; combined 6-Jan-2025 = ₹75,88,512 (matches chat). EM BIZ app **₹70.1L all <60 days (12-May-2026)**, then **₹38L paid 3-Jun-2026** → est. current gross payable **≈₹35–43L**, less unredeemed CNs. Net payable pending a fresh signed both-folio SOA.
  - **Structural finding:** EM posted invoices→Hub but payments+₹74L CN→Centre, so neither folio alone was ever correct (the "years of miscalculation").
  - **Open items (level-3 deep scan):** a 7-reader pass over all 3 chats extracted **846 raw line-items → ≈235 distinct issues (~150 OPEN)** — see `open-items-register.md`. Categories: service/quality (38; incl. brake systemic defect #109192, Rajita Nair CEO+LinkedIn escalation, Bhargav display, consumer-court case, 8-point defect list, Service Review deck 711 chases/28mo), credit notes (22; Trex-Pro, Sravan ₹1.5L, Thailand, 50%-ticket ₹11,233, ₹78,778, online-CN now email-proven by President Sandeep Sinha "liable to get CN"), CD disputes (10), ledger (16; two-folio mis-posting, unrecorded ₹10L, Deepak ₹49k, Laxmi/Vaishnavi, inv 02671, BCC ₹3.48L, security deposit ₹3.5L), orders/dispatch/stock (40; Viper 38 prebookings, 23/46 wrong dispatch, Ladakh), spares OOS (14), EM-owed invoices/PODs (30+), support (19; ATOD, lead-gen never live, Trailblazers).
  - Files: `open-items-register.md`, `findings.md`, `reconciliation.md`, `emotorad-relationship-report.md`, `service-issues.md`, `credit-notes-and-discounts.md`, `darshan-chat-extraction.md`, ledgers `emotorad-accounts-ledger.html` + `emotorad-ledger.html`. Email screenshots archived in `emails/` (2 so far; President "liable to get CN" + online-discount chase).
