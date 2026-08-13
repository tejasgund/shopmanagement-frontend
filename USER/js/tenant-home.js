/* ================================================================
   USER/js/tenant-home.js — the answer screen.

   A tenant opens this app to find out one thing: do I owe anything,
   and by when. That gets the whole top of the screen in the biggest
   type on the page. Everything else is secondary.
   ================================================================ */

function renderHomeScreen(){
  const due = tpTotalDue();
  const unpaid = tpUnpaidBills();
  const overdue = tpOverdueBills();
  const next = tpNextDueBill();

  return `
    ${homeAmountCardHtml(due, unpaid, overdue, next)}
    ${homeMeterPromptHtml()}
    ${homeRecentHtml()}
    ${homeShopsHtml()}
  `;
}

/* ---- The big number ---- */
function homeAmountCardHtml(due, unpaid, overdue, next){
  if (due <= 0){
    return `
    <div class="tp-amount-card tp-clear">
      <div class="tp-amount-icon">✓</div>
      <div class="tp-amount-label">You're all paid up</div>
      <div class="tp-amount-sub">Nothing is due right now. We'll show it here when your next bill is ready.</div>
    </div>`;
  }

  const overdueTotal = overdue.reduce((s, b) => s + Number(b.pending_amount || 0), 0);
  const isLate = overdue.length > 0;

  // The date line matters as much as the amount — "by when" is the second
  // question every tenant asks.
  let whenLine;
  if (isLate){
    const worst = overdue.sort((a, b) => new Date(a.due_date) - new Date(b.due_date))[0];
    const days = daysBetween(new Date(worst.due_date), startOfToday());
    whenLine = `<div class="tp-late-line">Late by ${days} day${days !== 1 ? 's' : ''}</div>`;
  } else if (next){
    const days = daysBetween(startOfToday(), new Date(next.due_date));
    whenLine = `<div class="tp-due-line">Please pay by <strong>${dateFmt(next.due_date)}</strong>${
      days === 0 ? ' — that\'s today' : days > 0 ? ` — ${days} day${days !== 1 ? 's' : ''} left` : ''}</div>`;
  } else {
    whenLine = `<div class="tp-due-line">No due date set</div>`;
  }

  return `
    ${isLate ? `
    <div class="tp-alert tp-alert-late">
      <strong>${currency(overdueTotal)} is overdue.</strong>
      Please pay as soon as you can, or speak to the office.
    </div>` : ''}

    <div class="tp-amount-card ${isLate ? 'tp-late' : ''}">
      <div class="tp-amount-label">You need to pay</div>
      <div class="tp-amount-value">${currency(due)}</div>
      ${whenLine}
      <div class="tp-amount-meta">${unpaid.length} bill${unpaid.length !== 1 ? 's' : ''} not fully paid</div>
      <button class="tp-btn tp-btn-light tp-btn-block" data-go-tab="bills">See what this is for</button>
    </div>

    <div class="tp-payline">
      <span class="tp-payline-label">How to pay</span>
      <span class="tp-payline-text">${escapeHtml(paymentMethodsText())}</span>
    </div>`;
}

/* ---- Meter nudge (only if they actually have a meter) ---- */
function homeMeterPromptHtml(){
  if (!tp.meters.length) return '';

  const waiting = tp.meters.filter(m => m.has_pending);
  const needsReading = tp.meters.filter(m => !m.has_pending);
  const lastRejected = tp.readings.find(r => r.status === 'rejected');
  const stillRejected = lastRejected &&
    !tp.readings.some(r => r.meter_id === lastRejected.meter_id &&
                           new Date(r.reading_date) > new Date(lastRejected.reading_date));

  if (stillRejected){
    return `
    <div class="tp-prompt tp-prompt-warn">
      <div class="tp-prompt-text">
        <strong>Your meter photo wasn't accepted</strong>
        <div>${escapeHtml(lastRejected.rejection_reason || 'Please send a clearer photo.')}</div>
      </div>
      <button class="tp-btn tp-btn-primary tp-btn-sm" data-go-tab="meter">Send again</button>
    </div>`;
  }

  if (needsReading.length){
    return `
    <div class="tp-prompt">
      <div class="tp-prompt-text">
        <strong>Send your meter reading</strong>
        <div>Take a photo of your electricity meter so the office can prepare your bill.</div>
      </div>
      <button class="tp-btn tp-btn-primary tp-btn-sm" data-go-tab="meter">Send now</button>
    </div>`;
  }

  if (waiting.length){
    return `
    <div class="tp-prompt tp-prompt-ok">
      <div class="tp-prompt-text">
        <strong>Meter reading sent</strong>
        <div>The office is checking your photo. Your bill will appear here once it's confirmed.</div>
      </div>
    </div>`;
  }
  return '';
}

/* ---- Last thing that happened ---- */
function homeRecentHtml(){
  const groups = groupedPayments().slice(0, 2);
  if (!groups.length) return '';

  return `
  <div class="tp-block">
    <div class="tp-block-head">
      <h2>What you paid recently</h2>
      <button class="tp-link" data-go-tab="payments">See all</button>
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

/* ---- Their shop(s) ---- */
function homeShopsHtml(){
  if (!tp.shops.length) return '';

  return `
  <div class="tp-block">
    <div class="tp-block-head"><h2>${tp.shops.length > 1 ? 'My shops' : 'My shop'}</h2></div>
    ${tp.shops.map(s => `
      <div class="tp-row">
        <div>
          <div class="tp-row-title">${escapeHtml(s.shop_number || '—')}</div>
          <div class="tp-row-sub">${escapeHtml(s.complex_name || '')}</div>
        </div>
        <div class="tp-row-right">
          <div class="tp-row-amount">${currency(s.shop_rent)}</div>
          <div class="tp-row-sub">rent / month</div>
        </div>
      </div>
      ${s.agreement_end_date ? agreementNoteHtml(s.agreement_end_date) : ''}
    `).join('')}
  </div>`;
}

function agreementNoteHtml(endIso){
  const days = daysBetween(startOfToday(), new Date(endIso));
  if (days > 60) return '';        // only mention it when it's actually near
  if (days < 0){
    return `<div class="tp-inline-note tp-inline-warn">Your agreement ended on ${dateFmt(endIso)}. Please speak to the office.</div>`;
  }
  return `<div class="tp-inline-note">Your agreement ends on ${dateFmt(endIso)} — ${days} day${days !== 1 ? 's' : ''} away.</div>`;
}

function attachHomeHandlers(){
  document.querySelectorAll('[data-go-tab]').forEach(btn =>
    btn.addEventListener('click', () => tpGoTo(btn.dataset.goTab)));
}
