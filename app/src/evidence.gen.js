// Screenshot evidence backing each gap. Images live in public/evidence/<brand>/.
// Each shot: { file, date (of the evidence event), source (where found), note (what it proves) }.
// Curated 15-Jul-2026 from the WhatsApp chat exports.
export const EVIDENCE = {
  cultsport: {
    2: [
      { file: '00000295-PHOTO-2026-04-16-15-34-34.jpg', date: '2024-08 orders', source: 'Accounts-group chat (shared 16-Apr-2026)', note: 'Bizom order → invoice status list — the Aug-2024 invoices behind the book-vs-brand reconciliation difference.' },
    ],
    3: [
      { file: '00001194-PHOTO-2025-05-05-17-35-41.jpg', date: '2025-05-05', source: 'Mani WhatsApp chat (L1600)', note: 'Mani’s own typed ledger — "CD - Pending 2,97,172.83" (To-Pay 18,60,055 · Old-Due 62,882).' },
      { file: '00001245-PHOTO-2025-06-05-16-25-39.jpg', date: '2025-06-05', source: 'Mani WhatsApp chat (L1677)', note: 'The same ledger re-sent identically a month later — the CD-pending figure is Mani’s, not ours.' },
    ],
    4: [
      { file: '00001194-PHOTO-2025-05-05-17-35-41.jpg', date: '2025-05-05', source: 'Mani WhatsApp chat (L1601)', note: 'Same typed ledger — "Balance - Old Due 62,882.60".' },
    ],
    13: [
      { file: '00001891-PHOTO-2026-02-25-20-38-18.jpg', date: '2024-08-21', source: 'Mani WhatsApp chat (shared 25-Feb-2026)', note: '₹3,33,366 paid to cultsport (Axis ·2785) on 21-Aug-2024 → Syed "Paid. 0 balance" — the zero-anchor for the account.' },
    ],
    6: [
      { file: 'CN-73701-Cycle-Rent.pdf', doc: true, date: '2025-12-30', source: 'Cultsport tax document (CN 73701)', note: 'Brand-issued Credit Memo 73701 — "CN for Cycle Rent", −150 units × ₹1,500 = −₹2,25,000 (HSN 910992). Proves the ₹2.25L credit; ₹1,34,990 balance still open.' },
    ],
  },
}
