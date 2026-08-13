/* ================================================================
   USER/js/tenant-bills.js — "My bills"

   Cards, never a table. The old year-summary table was 6 columns
   with a 640px minimum width, so on a phone it scrolled sideways
   and nobody could read it. Everything here stacks vertically.
   ================================================================ */

let billsFilter = 'unpaid';   // 'unpaid' | 'paid' | 'all'

function renderBillsScreen(){
  const all = [...tp.bills].sort((a, b) =>
    new Date(b.bill_date || b.created_at) - new Date(a.bill_date || a.created_at));

  const unpaid = all.filter(b => Number(b.pending_amount || 0) > 0.004);
  const paid   = all.filter(b => Number(b.pending_amount || 0) <= 0.004);

  let shown = billsFilter === 'paid' ? paid : billsFilter === 'all' ? all : unpaid;

  const totalDue = tpTotalDue();

  return `
  ${totalDue > 0 ? `
  <div class="tp-strip">
    <span>Still to pay</span>
    <strong>${currency(totalDue)}</strong>
  </div>` : `
  <div class="tp-strip tp-strip-ok">
    <span>Everything is paid</span><strong>✓</strong>
  </div>`}

  <div class="tp-chips">
    <button class="tp-chip ${billsFilter==='unpaid'?'active':''}" data-bills-filter="unpaid">To pay (${unpaid.length})</button>
    <button class="tp-chip ${billsFilter==='paid'?'active':''}" data-bills-filter="paid">Paid (${paid.length})</button>
    <button class="tp-chip ${billsFilter==='all'?'active':''}" data-bills-filter="all">All (${all.length})</button>
  </div>

  ${shown.length === 0 ? `
    <div class="tp-empty">
      <div class="tp-empty-title">${billsFilter === 'unpaid' ? 'Nothing to pay' : 'Nothing here'}</div>
      <div class="tp-empty-sub">${billsFilter === 'unpaid'
        ? 'You have no unpaid bills right now.'
        : 'Try another tab above.'}</div>
    </div>`
    : groupBillsByMonth(shown).map(group => `
      <div class="tp-month-head">${escapeHtml(group.label)}</div>
      ${group.bills.map(billCardHtml).join('')}
    `).join('')}
  `;
}

/* Bills grouped under a month heading — how people think about them. */
function groupBillsByMonth(bills){
  const groups = [];
  const byKey = {};
  bills.forEach(b => {
    const d = new Date(b.bill_date || b.created_at);
    const key = isNaN(d) ? 'other' : `${d.getFullYear()}-${d.getMonth()}`;
    const label = isNaN(d) ? 'Other'
      : d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    if (!byKey[key]){ byKey[key] = { label, bills: [] }; groups.push(byKey[key]); }
    byKey[key].bills.push(b);
  });
  return groups;
}

function billCardHtml(b){
  const pending = Number(b.pending_amount || 0);
  const paid    = Number(b.paid_amount || 0);
  const amount  = Number(b.amount || 0);

  // Plain words. A shopkeeper doesn't say "partial" or "pending".
  let state, stateClass;
  if (pending <= 0.004){ state = 'Paid'; stateClass = 'paid'; }
  else if (paid > 0.004){ state = 'Part paid'; stateClass = 'part'; }
  else { state = 'Not paid'; stateClass = 'unpaid'; }

  const isLate = pending > 0.004 && b.due_date && new Date(b.due_date) < startOfToday();

  return `
  <button type="button" class="tp-bill ${isLate ? 'is-late' : ''}" data-bill-id="${b.id}">
    <div class="tp-bill-top">
      <div>
        <div class="tp-bill-type">${escapeHtml(billTypeLabel(b.bill_type))}</div>
        <div class="tp-bill-date">${dateFmt(b.bill_date)}</div>
      </div>
      <span class="tp-state tp-state-${stateClass}">${state}</span>
    </div>

    <div class="tp-bill-amounts">
      <div>
        <div class="tp-bill-figure">${currency(pending > 0.004 ? pending : amount)}</div>
        <div class="tp-bill-caption">${pending > 0.004 ? 'still to pay' : 'paid in full'}</div>
      </div>
      ${paid > 0.004 && pending > 0.004 ? `
      <div class="tp-bill-side">
        <div class="tp-bill-side-val">${currency(paid)}</div>
        <div class="tp-bill-caption">already paid</div>
      </div>` : ''}
    </div>

    ${isLate
      ? `<div class="tp-bill-foot tp-bill-late">Was due ${dateFmt(b.due_date)}</div>`
      : (pending > 0.004 && b.due_date
          ? `<div class="tp-bill-foot">Pay by ${dateFmt(b.due_date)}</div>` : '')}
  </button>`;
}

/* The backend uses "Rent", "Electricity" etc. Show something friendlier
   where it helps, and fall back to whatever the office typed. */
function billTypeLabel(type){
  const map = {
    'Rent': 'Shop rent',
    'Electricity': 'Electricity',
    'Water': 'Water',
    'Maintenance': 'Maintenance',
    'Penalty': 'Late fee',
    'Repair': 'Repair',
    'Damage': 'Damage',
    'Parking': 'Parking',
  };
  return map[type] || type || 'Bill';
}

/* ---- One bill, in full ---- */
function openBillSheet(billId){
  const b = tp.bills.find(x => x.id === billId);
  if (!b) return;

  const pending = Number(b.pending_amount || 0);
  const paid = Number(b.paid_amount || 0);

  // Which payments went to this bill - answers "but I paid this one".
  const forThisBill = tp.payments.filter(p => p.bill_id === b.id)
    .sort((a, c) => new Date(c.payment_date) - new Date(a.payment_date));

  openModal(billTypeLabel(b.bill_type), `
    <div class="tp-sheet">
      <div class="tp-sheet-hero ${pending > 0.004 ? '' : 'is-paid'}">
        <div class="tp-sheet-hero-label">${pending > 0.004 ? 'Still to pay' : 'Fully paid'}</div>
        <div class="tp-sheet-hero-value">${currency(pending > 0.004 ? pending : Number(b.amount || 0))}</div>
      </div>

      <div class="tp-kv"><span>Bill amount</span><strong>${currency(b.amount)}</strong></div>
      <div class="tp-kv"><span>You have paid</span><strong>${currency(paid)}</strong></div>
      ${pending > 0.004 ? `<div class="tp-kv"><span>Left to pay</span><strong class="tp-red">${currency(pending)}</strong></div>` : ''}
      <div class="tp-kv"><span>Bill date</span><strong>${dateFmt(b.bill_date)}</strong></div>
      ${b.due_date ? `<div class="tp-kv"><span>Pay by</span><strong>${dateFmt(b.due_date)}</strong></div>` : ''}
      <div class="tp-kv"><span>Bill number</span><strong>#${b.id}</strong></div>
      ${b.description ? `<div class="tp-sheet-note">${escapeHtml(b.description)}</div>` : ''}

      ${forThisBill.length ? `
        <div class="tp-sheet-sub">Payments put towards this bill</div>
        ${forThisBill.map(p => `
          <div class="tp-kv">
            <span>${dateFmt(p.payment_date)}${p.payment_method ? ' · ' + escapeHtml(p.payment_method) : ''}</span>
            <strong>${currency(p.amount)}</strong>
          </div>`).join('')}
        <div class="tp-sheet-hint">
          If you paid one amount that covered several bills, you'll see the full
          amount under the "I paid" tab.
        </div>` : ''}
    </div>
  `, `<button class="tp-btn tp-btn-primary tp-btn-block" id="tpSheetClose">Close</button>`);

  document.getElementById('tpSheetClose').addEventListener('click', closeModal);
}

function attachBillsHandlers(){
  document.querySelectorAll('[data-bills-filter]').forEach(chip =>
    chip.addEventListener('click', () => {
      billsFilter = chip.dataset.billsFilter;
      switchTab('bills');
    }));
  document.querySelectorAll('[data-bill-id]').forEach(card =>
    card.addEventListener('click', () => openBillSheet(Number(card.dataset.billId))));
}
