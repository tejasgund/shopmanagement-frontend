/* ================================================================
   USER/js/tenant-home.js — the answer screen.

   Three blocks, in the order a tenant cares about them:
     1. How much do I owe, and by when
     2. What is that made up of  (rent / electricity / …) with bars
     3. My shop(s) and the meter — with the big "add reading" button
   ================================================================ */

function renderHomeScreen(){
  const due = tpTotalDue();
  const unpaid = tpUnpaidBills();
  const overdue = tpOverdueBills();
  const next = tpNextDueBill();

  return `
    ${homeAmountCardHtml(due, unpaid, overdue, next)}
    ${homePendingByTypeHtml()}
    ${homeShopBlocksHtml()}
    ${homeRecentPaymentsHtml()}
  `;
}

/* ================================================================
   BLOCK 1 — the big number
   ================================================================ */
function homeAmountCardHtml(due, unpaid, overdue, next){
  if (due <= 0){
    return `
    <div class="tp-amount-card tp-clear">
      <div class="tp-amount-icon">✓</div>
      <div class="tp-amount-label">${t('home.allPaid')}</div>
      <div class="tp-amount-sub">${t('home.allPaidSub')}</div>
    </div>`;
  }

  const overdueTotal = overdue.reduce((s, b) => s + Number(b.pending_amount || 0), 0);
  const isLate = overdue.length > 0;

  // The big number already includes late fees, because pending_amount does.
  // Saying so under it is the difference between a tenant trusting the figure
  // and ringing the office about it.
  const feeTotal = unpaid.reduce(
    (sum, b) => sum + Number((b.penalty && b.penalty.penalty_amount) || 0), 0);
  const feeLine = feeTotal > 0.004
    ? `<div class="tp-fee-note">${t('home.includesLateFee')} <strong>${currency(feeTotal)}</strong></div>`
    : '';

  let whenLine;
  if (isLate){
    const worst = [...overdue].sort((a, b) => new Date(a.due_date) - new Date(b.due_date))[0];
    const days = daysBetween(new Date(worst.due_date), startOfToday());
    // Word order differs between the two languages, so build the whole line
    // per language rather than gluing fragments together.
    whenLine = getLang() === 'mr'
      ? `<div class="tp-late-line">${days} दिवस उशीर झाला</div>`
      : `<div class="tp-late-line">Late by ${days} day${days !== 1 ? 's' : ''}</div>`;
  } else if (next){
    const days = daysBetween(startOfToday(), new Date(next.due_date));
    const tail = days === 0 ? ` — ${t('home.today')}`
               : days > 0 ? ` — ${days} ${t('home.daysLeft')}` : '';
    whenLine = `<div class="tp-due-line">${t('home.payBy')} <strong>${dateFmt(next.due_date)}</strong>${tail}</div>`;
  } else {
    whenLine = '';
  }

  return `
    ${isLate ? `
    <div class="tp-alert tp-alert-late">
      <strong>${currency(overdueTotal)}</strong> ${t('home.overdueMsg')}
    </div>` : ''}

    <div class="tp-amount-card ${isLate ? 'tp-late' : ''}">
      <div class="tp-amount-label">${t('home.youOwe')}</div>
      <div class="tp-amount-value">${currency(due)}</div>
      ${feeLine}
      ${whenLine}
      ${(tp.publicSettings && tp.publicSettings.razorpay_enabled) ? `
      <button class="tp-btn tp-btn-white tp-btn-block" id="tpHomePayCta">${t('pay.payBill')}</button>` : ''}
      <button class="tp-btn tp-btn-light tp-btn-block" data-go-tab="bills">${t('home.seeWhat')}</button>
    </div>`;
}

/* ---- Pay bill (Razorpay) — the tenant's whole pending balance in one go.
   Full or partial; the backend FIFO-allocates whatever is paid across
   every bill owed, oldest due date first, entirely automatically. ---- */
function openPayTotalModal(){
  const due = tpTotalDue();
  if (due <= 0) return;
  const maxPay = due.toFixed(2);

  openModal(t('pay.payBill'), `
    <div class="tp-sheet">
      <div class="tp-sheet-hero">
        <div class="tp-sheet-hero-label">${t('home.youOwe')}</div>
        <div class="tp-sheet-hero-value">${currency(due)}</div>
      </div>

      <div class="tp-pay-online">
        <label class="tp-field-label" for="tpHomePayAmount">${t('pay.amountLabel')}</label>
        <div class="tp-pay-row">
          <input type="number" id="tpHomePayAmount" class="tp-text-input" inputmode="decimal"
                 step="0.01" min="1" max="${maxPay}" value="${maxPay}">
          <button type="button" class="tp-btn tp-btn-primary" id="tpHomePayBtn">${t('pay.payOnline')}</button>
        </div>
        <div class="tp-field-error" id="tpHomePayErr" style="display:none;"></div>
        <div class="tp-field-hint">${t('pay.multiHint')}</div>
      </div>
    </div>
  `, `<button class="tp-btn tp-btn-ghost tp-btn-block" id="tpHomePayClose">${t('common.close')}</button>`);

  document.getElementById('tpHomePayClose').addEventListener('click', closeModal);
  document.getElementById('tpHomePayBtn').addEventListener('click', () => {
    const input = document.getElementById('tpHomePayAmount');
    const amount = parseFloat(input.value);
    const currentDue = tpTotalDue();   // re-check freshness at the moment of the click

    document.getElementById('tpHomePayErr').style.display = 'none';
    if (isNaN(amount) || amount <= 0){
      showFieldError('tpHomePayErr', t('pay.invalidAmount'));
      return;
    }
    if (amount > currentDue + 0.004){
      showFieldError('tpHomePayErr', t('pay.exceedsPending'));
      return;
    }

    tpStartRazorpayPayment({
      billId: null,
      amount,
      description: t('pay.totalDescription'),
      btnEl: document.getElementById('tpHomePayBtn'),
      errElId: 'tpHomePayErr',
      onDone: closeModal,
    });
  });
}

/* ================================================================
   BLOCK 2 — what the total is made of, by bill type
   Each type shows how much of it is already paid, with a bar, so a
   tenant can see at a glance that (say) rent is nearly clear but the
   electricity bill hasn't been touched.
   ================================================================ */
function pendingByType(){
  const byType = {};
  tp.bills.forEach(b => {
    const pending = Number(b.pending_amount || 0);
    const amount  = Number(b.amount || 0);
    const paid    = Number(b.paid_amount || 0);
    if (pending <= 0.004) return;                 // only what's still owed

    const key = b.bill_type || 'Other';
    if (!byType[key]) byType[key] = { type: key, pending: 0, billed: 0, paid: 0, count: 0 };
    byType[key].pending += pending;
    byType[key].billed  += amount;
    byType[key].paid    += paid;
    byType[key].count   += 1;
  });
  return Object.values(byType).sort((a, b) => b.pending - a.pending);
}

function homePendingByTypeHtml(){
  const rows = pendingByType();
  if (!rows.length) return '';

  return `
  <div class="tp-block">
    <div class="tp-block-head"><h2>${t('home.pendingByType')}</h2></div>
    <div class="tp-type-list">
      ${rows.map(r => `
        <div class="tp-type-row">
          <span class="tp-type-name">${escapeHtml(billTypeLabel(r.type))}</span>
          <span class="tp-type-pending">${currency(r.pending)}</span>
        </div>`).join('')}
    </div>
  </div>`;
}

/* ================================================================
   BLOCK 3 — one block per shop, with its meter and the big button
   ================================================================ */
function homeShopBlocksHtml(){
  if (!tp.shops.length) return '';

  return `
  <div class="tp-section-title">${t('home.myShops')}</div>
  ${tp.shops.map(shopBlockHtml).join('')}`;
}

function shopBlockHtml(shop){
  const meters = tp.meters.filter(m => m.shop_id === shop.id);

  // Deposit is recorded per shop, so only count the payments for this one.
  // Older records may not carry shop_id; if none match, fall back to the
  // tenant's whole deposit total when they have a single shop.
  const perShop = tp.deposits.filter(d => d.shop_id === shop.id);
  const depositPaid = (perShop.length || tp.shops.length > 1)
    ? perShop.reduce((s, d) => s + Number(d.amount || 0), 0)
    : tp.deposits.reduce((s, d) => s + Number(d.amount || 0), 0);
  const depositDue = Number(shop.shop_deposit || 0);
  const depositLeft = Math.max(0, depositDue - depositPaid);

  const start = shop.agreement_start_date;
  const end   = shop.agreement_end_date;
  const daysLeft = end ? daysBetween(startOfToday(), new Date(end)) : null;

  return `
  <div class="tp-shop-block">
    <div class="tp-shop-head">
      <div class="tp-shop-number">${escapeHtml(shop.shop_number || '—')}</div>
      <div class="tp-shop-rent">
        <span>${currency(shop.shop_rent)}</span>
        <small>${t('shop.perMonth')}</small>
      </div>
    </div>

    <div class="tp-shop-facts">
      <div class="tp-fact">
        <span class="tp-fact-label">${t('shop.complex')}</span>
        <span class="tp-fact-value">${escapeHtml(shop.complex_name || '—')}</span>
      </div>
      <div class="tp-fact">
        <span class="tp-fact-label">${t('shop.rent')}</span>
        <span class="tp-fact-value">${currency(shop.shop_rent)}</span>
      </div>
    </div>

    <!-- Agreement -->
    <div class="tp-shop-sub">${t('shop.agreement')}</div>
    <div class="tp-shop-facts">
      <div class="tp-fact">
        <span class="tp-fact-label">${t('shop.agreementStart')}</span>
        <span class="tp-fact-value">${start ? dateFmt(start) : '—'}</span>
      </div>
      <div class="tp-fact">
        <span class="tp-fact-label">${t('shop.agreementEnd')}</span>
        <span class="tp-fact-value">${end ? dateFmt(end) : '—'}</span>
      </div>
      ${daysLeft !== null ? `
      <div class="tp-fact">
        <span class="tp-fact-label">${t('shop.daysRemaining')}</span>
        <span class="tp-fact-value ${daysLeft < 0 ? 'tp-red' : daysLeft <= 30 ? 'tp-warn' : ''}">
          ${daysLeft < 0
            ? t('shop.agreementOver')
            : `${daysLeft} ${getLang() === 'mr' ? 'दिवस' : 'day' + (daysLeft !== 1 ? 's' : '')}`}
        </span>
      </div>` : ''}
    </div>

    <!-- Deposit -->
    ${depositDue > 0 || depositPaid > 0 ? `
    <div class="tp-shop-sub">${t('shop.deposit')}</div>
    <div class="tp-shop-facts">
      <div class="tp-fact">
        <span class="tp-fact-label">${t('shop.depositNeeded')}</span>
        <span class="tp-fact-value">${currency(depositDue)}</span>
      </div>
      <div class="tp-fact">
        <span class="tp-fact-label">${t('shop.depositPaid')}</span>
        <span class="tp-fact-value">${currency(depositPaid)}</span>
      </div>
      <div class="tp-fact">
        <span class="tp-fact-label">${t('shop.depositLeft')}</span>
        <span class="tp-fact-value ${depositLeft > 0 ? 'tp-red' : 'tp-green'}">
          ${depositLeft > 0 ? currency(depositLeft) : t('shop.depositDone')}
        </span>
      </div>
    </div>` : ''}

    ${meters.length
      ? meters.map(m => shopMeterHtml(m)).join('')
      : `<div class="tp-shop-nometer">${t('meter.noMeter')}</div>`}
  </div>`;
}

function shopMeterHtml(m){
  // The date of the reading this meter was last billed up to. tenant/meters
  // only gives us the number, so find the matching approved reading.
  const lastApproved = tp.readings
    .filter(r => r.meter_id === m.id && r.status === 'approved')
    .sort((a, b) => new Date(b.reading_date) - new Date(a.reading_date))[0];

  return `
  <div class="tp-meter-strip">
    <div class="tp-fact">
      <span class="tp-fact-label">${t('meter.number')}</span>
      <span class="tp-fact-value mono">${escapeHtml(m.meter_number)}</span>
    </div>
    <div class="tp-fact">
      <span class="tp-fact-label">${t('meter.prevReading')}</span>
      <span class="tp-fact-value tp-fact-big mono">${Number(m.previous_reading).toLocaleString('en-IN')}</span>
    </div>
    <div class="tp-fact">
      <span class="tp-fact-label">${t('meter.prevDate')}</span>
      <span class="tp-fact-value">${lastApproved ? dateFmt(lastApproved.reading_date) : t('meter.noneYet')}</span>
    </div>

    ${m.has_pending
      ? `<div class="tp-meter-pending">${t('meter.waiting')}</div>`
      : `<button class="tp-btn tp-btn-primary tp-btn-block tp-btn-lg tp-add-reading"
                 data-send-reading="${m.id}">${t('meter.addReading')}</button>`}
  </div>`;
}

/* ================================================================
   Recent payments (short)
   ================================================================ */
function homeRecentPaymentsHtml(){
  const groups = groupedPayments().slice(0, 2);
  if (!groups.length) return '';

  return `
  <div class="tp-block">
    <div class="tp-block-head">
      <h2>${t('pay.recent')}</h2>
      <button class="tp-link" data-go-tab="payments">${t('pay.seeAll')}</button>
    </div>
    ${groups.map(g => `
      <div class="tp-row">
        <div>
          <div class="tp-row-title">${currency(g.total)}</div>
          <div class="tp-row-sub">${dateFmt(g.date)}${g.method ? ' · ' + escapeHtml(g.method) : ''}</div>
        </div>
        <div class="tp-row-right"><span class="tp-tick">✓</span></div>
      </div>`).join('')}
  </div>`;
}

function attachHomeHandlers(){
  document.querySelectorAll('[data-go-tab]').forEach(btn =>
    btn.addEventListener('click', () => tpGoTo(btn.dataset.goTab)));
  // The big "add reading" button lives on Home as well as the Meter tab.
  document.querySelectorAll('[data-send-reading]').forEach(btn =>
    btn.addEventListener('click', () => openSendReadingModal(Number(btn.dataset.sendReading))));
  document.getElementById('tpHomePayCta')?.addEventListener('click', openPayTotalModal);
}
