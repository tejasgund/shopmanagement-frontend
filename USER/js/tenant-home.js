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
    </div>
    ${howToPayHtml()}`;
  }

  const overdueTotal = overdue.reduce((s, b) => s + Number(b.pending_amount || 0), 0);
  const isLate = overdue.length > 0;

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
      ${whenLine}
      <div class="tp-amount-meta">${unpaid.length} ${t('home.billsLeft')}</div>
      <button class="tp-btn tp-btn-light tp-btn-block" data-go-tab="bills">${t('home.seeWhat')}</button>
    </div>

    ${howToPayHtml()}`;
}

function howToPayHtml(){
  return `
  <div class="tp-payline">
    <span class="tp-payline-label">${t('home.howToPay')}</span>
    <span class="tp-payline-text">${escapeHtml(paymentMethodsText())}</span>
  </div>`;
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
          <div class="tp-type-top">
            <span class="tp-type-name">${escapeHtml(billTypeLabel(r.type))}</span>
            <span class="tp-type-pending">${currency(r.pending)}</span>
          </div>
          ${progressBarHtml(r.paid, r.billed)}
          <div class="tp-type-foot">
            <span>${currency(r.paid)} ${t('home.paidLabel')} ${t('home.pendingOf')} ${currency(r.billed)}</span>
            <span>${paidPercent(r.paid, r.billed)}%</span>
          </div>
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

    ${meters.length
      ? meters.map(m => shopMeterHtml(m)).join('')
      : `<div class="tp-shop-nometer">${t('meter.noMeter')}</div>`}

    ${agreementNoteHtml(shop.agreement_end_date)}
  </div>`;
}

/* Only mentioned when it's actually close, so it doesn't become wallpaper. */
function agreementNoteHtml(endIso){
  if (!endIso) return '';
  const days = daysBetween(startOfToday(), new Date(endIso));
  if (days > 30) return '';
  if (days < 0){
    return `<div class="tp-shop-note tp-shop-note-warn">${t('common.agreementEnded')}</div>`;
  }
  return `<div class="tp-shop-note">${t('common.agreementEnding')} ${dateFmt(endIso)}
          — ${days} ${getLang() === 'mr' ? 'दिवस' : 'day' + (days !== 1 ? 's' : '')}</div>`;
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
}
