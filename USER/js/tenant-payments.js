/* ================================================================
   USER/js/tenant-payments.js — "I paid"

   THE COMPLAINT THIS SCREEN EXISTS TO FIX:

   A tenant hands over ₹6,000. The office runs auto-allocate, which
   splits it across three bills, creating three payment rows:
       ₹4,000 -> June rent
       ₹1,500 -> Electricity
       ₹500   -> Maintenance
   The old portal listed those three rows separately, so the tenant
   scrolled looking for "6,000", never found it, and rang up saying
   "I paid 6,000 and it isn't showing."

   They paid ONCE. So we show it once:

       You paid ₹6,000        5 Aug · UPI
         June rent            ₹4,000
         Electricity          ₹1,500
         Maintenance          ₹500

   Grouping rule: rows that share `payment_group` (if the backend
   sends it) are one payment. Without that field we fall back to
   grouping by date + method, which covers the auto-allocate case
   because every row it creates carries the same date and method.
   ================================================================ */

function groupedPayments(){
  const rows = [...tp.payments];
  const groups = [];
  const byKey = {};

  rows.forEach(p => {
    // Prefer an explicit group id from the backend; otherwise same day +
    // same method is treated as one handover.
    const key = p.payment_group || p.receipt_no ||
      `${String(p.payment_date || '').slice(0, 10)}|${(p.payment_method || '').toLowerCase()}`;

    if (!byKey[key]){
      byKey[key] = {
        key,
        date: p.payment_date,
        method: p.payment_method || '',
        total: 0,
        parts: [],
        exact: Boolean(p.payment_group || p.receipt_no),
      };
      groups.push(byKey[key]);
    }
    byKey[key].total += Number(p.amount || 0);
    byKey[key].parts.push(p);
    // Keep the earliest timestamp of the group as its date.
    if (new Date(p.payment_date) < new Date(byKey[key].date)) byKey[key].date = p.payment_date;
  });

  groups.forEach(g => g.parts.sort((a, b) => Number(b.amount) - Number(a.amount)));
  return groups.sort((a, b) => new Date(b.date) - new Date(a.date));
}

function renderPaymentsScreen(){
  const groups = groupedPayments();

  if (!groups.length){
    return `
    <div class="tp-empty">
      <div class="tp-empty-title">No payments yet</div>
      <div class="tp-empty-sub">Once the office records a payment from you, it will show up here.</div>
    </div>`;
  }

  // "This year" total is the number tenants most often want to check.
  const thisYear = new Date().getFullYear();
  const yearTotal = groups
    .filter(g => new Date(g.date).getFullYear() === thisYear)
    .reduce((s, g) => s + g.total, 0);

  return `
  <div class="tp-strip tp-strip-ok">
    <span>You paid in ${thisYear}</span>
    <strong>${currency(yearTotal)}</strong>
  </div>

  <div class="tp-hint-line">
    Each entry below is one payment you made. Tap it to see which bills it went towards.
  </div>

  ${groupsByMonthHtml(groups)}
  `;
}

function groupsByMonthHtml(groups){
  const months = [];
  const byKey = {};
  groups.forEach(g => {
    const d = new Date(g.date);
    const key = isNaN(d) ? 'other' : `${d.getFullYear()}-${d.getMonth()}`;
    const label = isNaN(d) ? 'Other' : d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    if (!byKey[key]){ byKey[key] = { label, total: 0, groups: [] }; months.push(byKey[key]); }
    byKey[key].groups.push(g);
    byKey[key].total += g.total;
  });

  return months.map(m => `
    <div class="tp-month-head tp-month-head-total">
      <span>${escapeHtml(m.label)}</span>
      <span class="tp-month-total">${currency(m.total)}</span>
    </div>
    ${m.groups.map(paymentGroupCardHtml).join('')}
  `).join('');
}

function paymentGroupCardHtml(g){
  const splitAcross = g.parts.length > 1;

  return `
  <button type="button" class="tp-payment" data-payment-key="${escapeHtml(g.key)}">
    <div class="tp-payment-top">
      <div>
        <div class="tp-payment-label">You paid</div>
        <div class="tp-payment-value">${currency(g.total)}</div>
      </div>
      <span class="tp-tick-big">✓</span>
    </div>
    <div class="tp-payment-meta">
      ${dateFmt(g.date)}${g.method ? ' · ' + escapeHtml(g.method) : ''}
    </div>
    ${splitAcross ? `
      <div class="tp-payment-split">
        Put towards ${g.parts.length} bills — tap to see
      </div>` : ''}
  </button>`;
}

/* ---- One payment, broken down ---- */
function openPaymentSheet(key){
  const g = groupedPayments().find(x => x.key === key);
  if (!g) return;

  const billFor = (id) => tp.bills.find(b => b.id === id);

  openModal('Your payment', `
    <div class="tp-sheet">
      <div class="tp-sheet-hero is-paid">
        <div class="tp-sheet-hero-label">You paid</div>
        <div class="tp-sheet-hero-value">${currency(g.total)}</div>
        <div class="tp-sheet-hero-sub">${dateFmt(g.date)}${g.method ? ' · ' + escapeHtml(g.method) : ''}</div>
      </div>

      <div class="tp-sheet-sub">${g.parts.length > 1
        ? 'This one payment was put towards these bills'
        : 'This payment was put towards'}</div>

      ${g.parts.map(p => {
        const b = billFor(p.bill_id);
        return `
        <div class="tp-kv">
          <span>${b ? escapeHtml(billTypeLabel(b.bill_type)) : 'Bill'}
            <span class="tp-kv-sub">#${p.bill_id}${b && b.bill_date ? ' · ' + dateFmt(b.bill_date) : ''}</span>
          </span>
          <strong>${currency(p.amount)}</strong>
        </div>`;
      }).join('')}

      <div class="tp-kv tp-kv-total"><span>Total</span><strong>${currency(g.total)}</strong></div>

      ${g.parts.some(p => p.remarks) ? `
        <div class="tp-sheet-note">${escapeHtml(g.parts.find(p => p.remarks).remarks)}</div>` : ''}

      ${g.parts.length > 1 ? `
        <div class="tp-sheet-hint">
          You paid this amount once. The office divided it between the bills above,
          oldest first — that's why you may see smaller amounts against each bill.
        </div>` : ''}
    </div>
  `, `<button class="tp-btn tp-btn-primary tp-btn-block" id="tpPaySheetClose">Close</button>`);

  document.getElementById('tpPaySheetClose').addEventListener('click', closeModal);
}

function attachPaymentsHandlers(){
  document.querySelectorAll('[data-payment-key]').forEach(card =>
    card.addEventListener('click', () => openPaymentSheet(card.dataset.paymentKey)));
}
