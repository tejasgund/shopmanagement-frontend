/* ================================================================
   USER/js/tenant-bills.js — "My bills"

   One block per month. Each block heads with that month's totals and
   a progress bar, then the individual bills inside it. Cards only —
   the old 6-column table needed 640px and couldn't be read on a phone.
   ================================================================ */

let billsFilter = 'unpaid';   // 'unpaid' | 'paid' | 'all'

function renderBillsScreen(){
  const all = [...tp.bills].sort((a, b) =>
    new Date(b.bill_date || b.created_at) - new Date(a.bill_date || a.created_at));

  const unpaid = all.filter(b => Number(b.pending_amount || 0) > 0.004);
  const paid   = all.filter(b => Number(b.pending_amount || 0) <= 0.004);
  const shown  = billsFilter === 'paid' ? paid : billsFilter === 'all' ? all : unpaid;

  const totalDue = tpTotalDue();

  return `
  ${totalDue > 0 ? `
  <div class="tp-strip">
    <span>${t('bills.stillToPay')}</span>
    <strong>${currency(totalDue)}</strong>
  </div>` : `
  <div class="tp-strip tp-strip-ok">
    <span>${t('bills.allPaid')}</span><strong>✓</strong>
  </div>`}

  <div class="tp-chips">
    <button class="tp-chip ${billsFilter==='unpaid'?'active':''}" data-bills-filter="unpaid">${t('bills.toPay')} (${unpaid.length})</button>
    <button class="tp-chip ${billsFilter==='paid'?'active':''}" data-bills-filter="paid">${t('bills.paid')} (${paid.length})</button>
    <button class="tp-chip ${billsFilter==='all'?'active':''}" data-bills-filter="all">${t('bills.all')} (${all.length})</button>
  </div>

  ${shown.length === 0 ? `
    <div class="tp-empty">
      <div class="tp-empty-title">${billsFilter === 'unpaid' ? t('bills.nothingToPay') : t('bills.nothingHere')}</div>
      <div class="tp-empty-sub">${billsFilter === 'unpaid' ? t('bills.nothingToPaySub') : t('bills.tryOther')}</div>
    </div>`
    : groupBillsByMonth(shown).map(monthBlockHtml).join('')}
  `;
}

/* Bills bucketed by the month they were raised, with that month's totals. */
function groupBillsByMonth(bills){
  const groups = [];
  const byKey = {};

  bills.forEach(b => {
    const d = new Date(b.bill_date || b.created_at);
    const key = isNaN(d) ? 'other' : `${d.getFullYear()}-${d.getMonth()}`;
    const label = isNaN(d) ? '—' : monthYearFmt(d);

    if (!byKey[key]){
      byKey[key] = { key, label, bills: [], billed: 0, paid: 0, pending: 0 };
      groups.push(byKey[key]);
    }
    const g = byKey[key];
    g.bills.push(b);
    g.billed  += Number(b.amount || 0);
    g.paid    += Number(b.paid_amount || 0);
    g.pending += Number(b.pending_amount || 0);
  });

  return groups;
}

function monthBlockHtml(g){
  const settled = g.pending <= 0.004;

  return `
  <div class="tp-month-block ${settled ? 'is-settled' : ''}">
    <div class="tp-month-block-head">
      <div class="tp-month-name">${escapeHtml(g.label)}</div>
      <div class="tp-month-figure ${settled ? 'is-ok' : ''}">
        ${settled ? `${t('state.paid')} ✓` : currency(g.pending)}
      </div>
    </div>

    ${progressBarHtml(g.paid, g.billed)}

    <div class="tp-month-legend">
      <span>${t('bills.billed')} <strong>${currency(g.billed)}</strong></span>
      <span>${t('home.paidLabel')} <strong>${currency(g.paid)}</strong></span>
      ${!settled ? `<span class="tp-red">${t('bills.stillLeft')} <strong>${currency(g.pending)}</strong></span>` : ''}
    </div>

    <div class="tp-month-bills">
      ${g.bills.map(billCardHtml).join('')}
    </div>
  </div>`;
}

function billCardHtml(b){
  const pending = Number(b.pending_amount || 0);
  const paid    = Number(b.paid_amount || 0);
  const amount  = Number(b.amount || 0);

  let state, stateClass;
  if (pending <= 0.004){ state = t('state.paid'); stateClass = 'paid'; }
  else if (paid > 0.004){ state = t('state.partPaid'); stateClass = 'part'; }
  else { state = t('state.notPaid'); stateClass = 'unpaid'; }

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
        <div class="tp-bill-caption">${pending > 0.004 ? t('bill.stillToPay') : t('bill.paidInFull')}</div>
      </div>
      ${paid > 0.004 && pending > 0.004 ? `
      <div class="tp-bill-side">
        <div class="tp-bill-side-val">${currency(paid)}</div>
        <div class="tp-bill-caption">${t('bill.alreadyPaid')}</div>
      </div>` : ''}
    </div>

    ${isLate
      ? `<div class="tp-bill-foot tp-bill-late">${t('bill.wasDue')} ${dateFmt(b.due_date)}</div>`
      : (pending > 0.004 && b.due_date
          ? `<div class="tp-bill-foot">${t('bill.dueDate')} ${dateFmt(b.due_date)}</div>` : '')}
  </button>`;
}

/* ---- One bill, in full ---- */
function openBillSheet(billId){
  const b = tp.bills.find(x => x.id === billId);
  if (!b) return;

  const pending = Number(b.pending_amount || 0);
  const paid = Number(b.paid_amount || 0);

  const forThisBill = tp.payments.filter(p => p.bill_id === b.id)
    .sort((a, c) => new Date(c.payment_date) - new Date(a.payment_date));

  openModal(billTypeLabel(b.bill_type), `
    <div class="tp-sheet">
      <div class="tp-sheet-hero ${pending > 0.004 ? '' : 'is-paid'}">
        <div class="tp-sheet-hero-label">${pending > 0.004 ? t('bill.leftToPay') : t('bill.fullyPaid')}</div>
        <div class="tp-sheet-hero-value">${currency(pending > 0.004 ? pending : Number(b.amount || 0))}</div>
      </div>

      ${pending > 0.004 ? payOnlineSectionHtml(b, pending) : ''}

      ${progressBarHtml(paid, Number(b.amount || 0))}

      <div class="tp-kv"><span>${t('bill.amount')}</span><strong>${currency(b.amount)}</strong></div>
      <div class="tp-kv"><span>${t('bill.youPaid')}</span><strong>${currency(paid)}</strong></div>
      ${pending > 0.004 ? `<div class="tp-kv"><span>${t('bill.leftToPay')}</span><strong class="tp-red">${currency(pending)}</strong></div>` : ''}
      <div class="tp-kv"><span>${t('bill.date')}</span><strong>${dateFmt(b.bill_date)}</strong></div>
      ${b.due_date ? `<div class="tp-kv"><span>${t('bill.dueDate')}</span><strong>${dateFmt(b.due_date)}</strong></div>` : ''}
      <div class="tp-kv"><span>${t('bill.number')}</span><strong>#${b.id}</strong></div>
      ${b.description ? `<div class="tp-sheet-note">${escapeHtml(b.description)}</div>` : ''}

      ${forThisBill.length ? `
        <div class="tp-sheet-sub">${t('bill.paymentsFor')}</div>
        ${forThisBill.map(p => `
          <div class="tp-kv">
            <span>${dateFmt(p.payment_date)}${p.payment_method ? ' · ' + escapeHtml(p.payment_method) : ''}</span>
            <strong>${currency(p.amount)}</strong>
          </div>`).join('')}
        <div class="tp-sheet-hint">${t('bill.lumpHint')}</div>` : ''}
    </div>
  `, `<button class="tp-btn tp-btn-primary tp-btn-block" id="tpSheetClose">${t('common.close')}</button>`);

  document.getElementById('tpSheetClose').addEventListener('click', closeModal);
  document.getElementById('tpPayBtn')?.addEventListener('click', () => startRazorpayPayment(b.id));
}

/* ================================================================
   PAY ONLINE (Razorpay Standard Checkout)

   Amount is editable (partial payments allowed, same as the office
   accepts) but always capped client-side at the pending balance - the
   server caps it again independently, so this is a UX nicety, not the
   real guard.
   ================================================================ */
function payOnlineSectionHtml(b, pending){
  if (!(tp.publicSettings && tp.publicSettings.razorpay_enabled)) return '';
  const maxPay = pending.toFixed(2);
  return `
  <div class="tp-pay-online">
    <label class="tp-field-label" for="tpPayAmount">${t('pay.amountLabel')}</label>
    <div class="tp-pay-row">
      <input type="number" id="tpPayAmount" class="tp-text-input" inputmode="decimal"
             step="0.01" min="1" max="${maxPay}" value="${maxPay}">
      <button type="button" class="tp-btn tp-btn-primary" id="tpPayBtn" data-pay-bill="${b.id}">
        ${t('pay.payOnline')}
      </button>
    </div>
    <div class="tp-field-error" id="tpPayErr" style="display:none;"></div>
  </div>`;
}

/* The actual Razorpay checkout flow (create-order -> modal -> verify) lives
   in core.js as tpStartRazorpayPayment() so this file and tenant-home.js
   (the "pay everything at once" button) share one implementation instead
   of two copies that could drift apart. This is just the bill-sheet-shaped
   wrapper: read the amount input, validate against THIS bill's pending
   balance, then hand off. */
function startRazorpayPayment(billId){
  const b = tp.bills.find(x => x.id === billId);
  if (!b) return;

  const pending = Number(b.pending_amount || 0);
  const input = document.getElementById('tpPayAmount');
  const amount = parseFloat(input.value);

  document.getElementById('tpPayErr').style.display = 'none';
  if (isNaN(amount) || amount <= 0){
    showFieldError('tpPayErr', t('pay.invalidAmount'));
    return;
  }
  if (amount > pending + 0.004){
    showFieldError('tpPayErr', t('pay.exceedsPending'));
    return;
  }

  tpStartRazorpayPayment({
    billId: b.id,
    amount,
    description: `${billTypeLabel(b.bill_type)} — ${t('bill.number')} #${b.id}`,
    btnEl: document.getElementById('tpPayBtn'),
    errElId: 'tpPayErr',
    onDone: closeModal,
  });
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
