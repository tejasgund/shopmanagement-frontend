/* ================================================================
   USER/js/tenant-dashboard.js — split from the old USER/script.js,
   then rebuilt around plain, direct questions ("how much is my rent
   for Feb", "what did I pay last month") instead of dense stat grids
   and multi-click drill-downs — most tenants using this portal are
   not tech-savvy, so the goal is: the answer is either already on
   screen, or two taps away (pick month, pick year).

   Contains: loadTenantPortal(), the function that fetches
   profile/shops/bills/payments and renders the whole dashboard.
   Depends on core.js + ui-helpers.js, and calls into
   tenant-ledger.js (renderTpMonthAnswer, renderTenantLedger).
   ================================================================ */

document.getElementById('tenantRefreshBtn').addEventListener('click', async (e) => {
  e.currentTarget.classList.add('spinning');
  try { await loadTenantPortal(); showToast('Data refreshed', 'success'); }
  finally { e.currentTarget.classList.remove('spinning'); }
});

// Tenant portal filter state (kept for compatibility with any older code paths)
const tpFilters = { complex:'', shop:'', month:'', year:'', status:'', dateFrom:'', dateTo:'' };

async function loadTenantPortal(){
  const content = document.getElementById('tenantContent');
  content.innerHTML = skeletonHtml();
  try {
    const [profile, shops, bills, payments] = await Promise.all([
      api('/api/tenant/profile'),
      api('/api/tenant/shops'),
      api('/api/tenant/bills'),
      api('/api/tenant/payments'),
    ]);
    document.getElementById('tenantName').textContent = profile.name;
    document.getElementById('tenantGreeting').textContent = getTimeGreeting(profile.name);

    // ── Agreement expiry check (shown as a banner only if it needs attention) ──
    let soonestEnd = null;
    shops.forEach(s => {
      if (s.agreement_end_date) {
        const d = new Date(s.agreement_end_date);
        if (!soonestEnd || d < soonestEnd) soonestEnd = d;
      }
    });
    const daysLeft = soonestEnd ? Math.round((soonestEnd - new Date()) / 86400000) : null;

    // ── Core numbers ──
    const totalRent = shops.reduce((s,sh)=>s+Number(sh.shop_rent||0),0);
    const totalDeposit = shops.reduce((s,sh)=>s+Number(sh.shop_deposit||0),0);
    const pendingBills = bills.filter(b=>b.status!=='paid');
    const pendingTotal = pendingBills.reduce((s,b)=>s+Number(b.pending_amount||0),0);
    const paidTotal = payments.reduce((s,p)=>s+Number(p.amount||0),0);
    const nextDue = pendingBills.filter(b=>b.due_date).sort((a,b)=>new Date(a.due_date)-new Date(b.due_date))[0];

    const complexNames = {};
    shops.forEach(s => { if (s.complex_id) complexNames[s.complex_id] = s.complex_name; });

    let depositPaid = 0;
    let depositSourceFailed = false;
    try {
      const depPays = await api('/api/tenant/deposit-payments');
      depositPaid = (depPays||[]).reduce((s,p)=>s+Number(p.amount||0),0);
    } catch(e){
      depositSourceFailed = true;
      const depositBillIds = new Set(bills.filter(b => /deposit/i.test(b.bill_type||'')).map(b=>b.id));
      if (depositBillIds.size > 0) {
        depositPaid = payments.filter(p => depositBillIds.has(p.bill_id)).reduce((s,p)=>s+Number(p.amount||0),0);
      }
    }
    const depositRemaining = Math.max(0, totalDeposit - depositPaid);

    // ── "You paid last month" ──
    const now = new Date();
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth()-1, 1);
    const lastMonthPays = payments.filter(p => {
      if (!p.payment_date) return false;
      const d = new Date(p.payment_date);
      return d.getFullYear() === lastMonthDate.getFullYear() && d.getMonth() === lastMonthDate.getMonth();
    });
    const lastMonthPaidTotal = lastMonthPays.reduce((s,p)=>s+Number(p.amount||0),0);

    // ── Build the HTML ──
    content.innerHTML = `
    ${daysLeft !== null && daysLeft <= 30 ? `
    <div class="warn-box" style="margin-bottom:16px;">
      ${warnIcon()}
      <span>${daysLeft < 0 ? `Your shop agreement expired ${Math.abs(daysLeft)} day${Math.abs(daysLeft)!==1?'s':''} ago.` : `Your shop agreement ends in ${daysLeft} day${daysLeft!==1?'s':''}.`} Please contact your admin.</span>
    </div>` : ''}

    <!-- At a glance: the three questions tenants ask most -->
    <div class="tp-hero-grid">
      <div class="tp-hero-card ${pendingTotal>0?'due':'clear'}">
        <div class="tp-hero-label">${pendingTotal>0?'You currently owe':'You are all paid up'}</div>
        <div class="tp-hero-value">${pendingTotal>0?currency(pendingTotal):'✓'}</div>
        <div class="tp-hero-sub">${nextDue ? `Next due ${dateFmt(nextDue.due_date)}` : (pendingTotal>0 ? 'Across all bills' : 'Nothing pending right now')}</div>
      </div>
      <div class="tp-hero-card">
        <div class="tp-hero-label">You paid last month</div>
        <div class="tp-hero-value">${currency(lastMonthPaidTotal)}</div>
        <div class="tp-hero-sub">${lastMonthPays.length} payment${lastMonthPays.length!==1?'s':''} in ${lastMonthDate.toLocaleString('en-IN',{month:'long'})}</div>
      </div>
      <div class="tp-hero-card">
        <div class="tp-hero-label">Security deposit</div>
        <div class="tp-hero-value" style="font-size:19px;">${currency(depositPaid)} <span style="font-size:12.5px; color:var(--muted); font-weight:600;">of ${currency(totalDeposit)}</span></div>
        ${totalDeposit > 0 ? `<div class="deposit-bar-wrap" style="margin-top:8px;"><div class="deposit-bar" style="width:${Math.min(100,Math.round(depositPaid/totalDeposit*100))}%;"></div></div>` : `<div class="tp-hero-sub">No deposit on file</div>`}
      </div>
    </div>

    <!-- Ask about a month: pick month + year, see that month's bills by type and payments -->
    <div class="card card-pad" style="margin-bottom:16px;">
      <h3 style="font-size:15px; margin:0 0 4px;">Ask about a month</h3>
      <p style="font-size:12.5px; color:var(--muted); margin:0 0 14px;">e.g. "how much was my electricity bill in December" — pick the month and year below.</p>
      <div style="display:flex; gap:10px; margin-bottom:14px; flex-wrap:wrap; align-items:center;">
        <select id="tpAnswerMonth" class="sort-select">
          ${monthNamesShort.map((mn,i)=>`<option value="${i+1}" ${i+1===now.getMonth()+1?'selected':''}>${mn}</option>`).join('')}
        </select>
        <select id="tpAnswerYear" class="sort-select">
          ${Array.from({length:4},(_,i)=>{ const y=now.getFullYear()-i; return `<option value="${y}" ${i===0?'selected':''}>${y}</option>`; }).join('')}
        </select>
      </div>
      <div id="tpAnswerBody"></div>
    </div>

    <!-- Electricity meter: send this month's reading (filled in by tenant-meters.js;
         stays empty if this tenant has no submeter) -->
    <div id="tenantMeterSection"></div>

    <!-- Full-year summary table + PDF -->
    <div class="collapsible-section">
      <div class="collapsible-header open" onclick="toggleCollapse(this)">
        <h3>Full year summary</h3>
        <svg class="collapsible-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="collapsible-body open">
        <div style="display:flex; gap:10px; margin-bottom:12px; align-items:center; flex-wrap:wrap;">
          <label style="font-weight:600; font-size:13px;">Year:</label>
          <select id="tpLedgerYear" class="sort-select" style="padding:6px 10px;">
            ${Array.from({length:6},(_,i) => {
              const y = new Date().getFullYear() - i;
              return `<option value="${y}" ${i===0?'selected':''}>${y}</option>`;
            }).join('')}
          </select>
          <span class="record-count-tag" id="tpLedgerCount">Loading…</span>
          <div style="display:flex; gap:8px; margin-left:auto;">
            <button class="btn btn-ghost btn-sm" onclick="downloadMonthlyLedgerPdf('tenant')">Download PDF</button>
            <button class="btn btn-ghost btn-sm" onclick="printMonthlyLedgerPdf('tenant')">Print</button>
            <button class="btn btn-ghost btn-sm" onclick="shareMonthlyLedgerPdf('tenant')">Share</button>
          </div>
        </div>
        <div id="tpLedgerContainer">
          <div style="text-align:center; padding:20px; color:var(--muted);">Select a year to load ledger.</div>
        </div>
      </div>
    </div>

    <!-- My Shops -->
    <div class="collapsible-section">
      <div class="collapsible-header" onclick="toggleCollapse(this)">
        <h3>My Shops <span class="record-count-tag" style="margin-left:8px;">${shops.length}</span></h3>
        <svg class="collapsible-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="collapsible-body">
        ${shops.length === 0 ? '<div class="empty-compact">No shops assigned to your account.</div>' :
          shops.map(s=>`
          <div class="tenant-card">
            <div class="row1">
              <span class="title mono">${escapeHtml(s.shop_number)}</span>
              <span class="pill ${s.status}"><span class="pill-dot"></span>${escapeHtml(s.status)}</span>
            </div>
            <div class="meta">${escapeHtml(complexNames[s.complex_id]||'Complex #'+s.complex_id)} · ${Number(s.area_sqft||0).toLocaleString('en-IN')} sqft</div>
            <div class="amt-row" style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:8px; border:none; padding:0;">
              <div><div style="font-size:11px; color:var(--muted); font-weight:600; text-transform:uppercase;">Rent/mo</div><div class="mono" style="font-weight:700; font-size:14px;">${currency(s.shop_rent||0)}</div></div>
              <div><div style="font-size:11px; color:var(--muted); font-weight:600; text-transform:uppercase;">Deposit</div><div class="mono" style="font-weight:700; font-size:14px;">${currency(s.shop_deposit||0)}</div></div>
            </div>
            <div class="amt-row" style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:8px; border:none; padding:0;">
              <div><div style="font-size:11px; color:var(--muted); font-weight:600; text-transform:uppercase;">Agreement Start</div><div class="mono" style="font-weight:700; font-size:13px;">${s.agreement_start_date ? dateFmt(s.agreement_start_date) : '—'}</div></div>
              <div><div style="font-size:11px; color:var(--muted); font-weight:600; text-transform:uppercase;">Agreement End</div><div class="mono" style="font-weight:700; font-size:13px;">${s.agreement_end_date ? dateFmt(s.agreement_end_date) : '—'}</div></div>
            </div>
            ${s.agreement_end_date ? `<div style="margin-top:6px;">${daysLeftHtml(s.agreement_end_date)}</div>` : ''}
          </div>`).join('')}
      </div>
    </div>

    <!-- Deposit Summary -->
    <div class="collapsible-section">
      <div class="collapsible-header" onclick="toggleCollapse(this)">
        <h3>Deposit Summary</h3>
        <svg class="collapsible-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="collapsible-body">
        <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:14px;">
          <div class="card stat-card"><div class="label">Required</div><div class="value mono" style="font-size:18px;">${currency(totalDeposit)}</div></div>
          <div class="card stat-card accent-green"><div class="label">Paid</div><div class="value mono" style="font-size:18px;">${currency(depositPaid)}</div></div>
          <div class="card stat-card accent-rust"><div class="label">Remaining</div><div class="value mono" style="font-size:18px;">${currency(depositRemaining)}</div></div>
        </div>
        ${shops.length ? `
        <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:8px;">
          ${shops.map(s=>`<div class="info-card"><div class="info-row"><span class="info-label">${escapeHtml(s.shop_number)}</span><span class="info-val">${currency(s.shop_deposit||0)}</span></div></div>`).join('')}
        </div>` : ''}
        ${depositSourceFailed && depositPaid === 0 ? `
        <div class="warn-box" style="margin-top:12px;">
          ${warnIcon()}
          <span>We couldn't load your deposit payment history right now. The "Required" amount above is accurate, but "Paid" may not reflect deposit payments your admin has already recorded — contact your admin if this looks wrong.</span>
        </div>` : ''}
      </div>
    </div>

    <!-- Profile -->
    <div class="collapsible-section">
      <div class="collapsible-header" onclick="toggleCollapse(this)">
        <h3>My Profile</h3>
        <svg class="collapsible-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="collapsible-body">
        <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:10px;">
          <div><div style="font-size:11px; color:var(--muted); font-weight:700; text-transform:uppercase; letter-spacing:.04em;">Name</div><div style="font-weight:600; margin-top:3px;">${escapeHtml(profile.name)}</div></div>
          <div><div style="font-size:11px; color:var(--muted); font-weight:700; text-transform:uppercase; letter-spacing:.04em;">Mobile</div><div class="mono" style="margin-top:3px;">${escapeHtml(profile.mobile)}</div></div>
          ${profile.email ? `<div><div style="font-size:11px; color:var(--muted); font-weight:700; text-transform:uppercase; letter-spacing:.04em;">Email</div><div style="margin-top:3px;">${escapeHtml(profile.email)}</div></div>` : ''}
          <div><div style="font-size:11px; color:var(--muted); font-weight:700; text-transform:uppercase; letter-spacing:.04em;">Status</div><div style="margin-top:3px;"><span class="pill ${profile.is_active?'active-pill':'inactive-pill'}"><span class="pill-dot"></span>${profile.is_active?'Active':'Inactive'}</span></div></div>
          <div><div style="font-size:11px; color:var(--muted); font-weight:700; text-transform:uppercase; letter-spacing:.04em;">Rent Bill Date</div><div style="margin-top:3px; font-weight:600;">${profile.rent_bill_date ? `Day ${profile.rent_bill_date} of month` : '—'}</div></div>
        </div>
      </div>
    </div>
    `; // ── end content.innerHTML ──

    // ── "Ask about a month" wiring — reuses already-loaded bills/payments, no extra API call ──
    tpBillsData = bills; tpShopsData = shops;
    tpPaysData = payments;
    function renderTpAnswer(){
      const y = document.getElementById('tpAnswerYear').value;
      const m = document.getElementById('tpAnswerMonth').value;
      document.getElementById('tpAnswerBody').innerHTML = renderTpMonthAnswer(y, m);
    }
    document.getElementById('tpAnswerMonth').addEventListener('change', renderTpAnswer);
    document.getElementById('tpAnswerYear').addEventListener('change', renderTpAnswer);
    renderTpAnswer();

    // ── Full year summary (Monthly Ledger) ──
    const ledgerYear = document.getElementById('tpLedgerYear');
    const ledgerContainer = document.getElementById('tpLedgerContainer');
    const ledgerCount = document.getElementById('tpLedgerCount');

    async function loadLedger(year){
      try {
        ledgerCount.textContent = 'Loading…';
        const data = await api(`/api/tenant/ledger/monthly?year=${year}`);
        state._lastTpLedgerData = { tenantName: profile.name, tenantMobile: profile.mobile, year, monthly: data.monthly, summary: data.summary, complexName: [...new Set(data.shops.map(s=>s.complex_name).filter(Boolean))].join(', ') };
        ledgerContainer.innerHTML = renderTenantLedger(data);
        const totalBills = data.monthly.reduce((s,m) => s + m.bills_count, 0);
        ledgerCount.textContent = `${totalBills} bills`;
      } catch (err) {
        ledgerContainer.innerHTML = errorBannerHtml(err.message);
        ledgerContainer.querySelector('#retryBtn')?.addEventListener('click', () => loadLedger(year));
        ledgerCount.textContent = 'Error';
      }
    }

    if (ledgerYear) {
      ledgerYear.addEventListener('change', function() { loadLedger(this.value); });
      loadLedger(ledgerYear.value);
    }

    // ── Collapsible toggles ──
    document.querySelectorAll('.month-row-head').forEach(h => {
      h.addEventListener('click', () => {
        const body = h.nextElementSibling;
        body.classList.toggle('open');
      });
    });

    // ── Electricity meter section (renders itself, or stays hidden if this
    //    tenant has no submeter). Not awaited so it can't delay the page. ──
    loadTenantMeterSection();

  } catch (err) {
    content.innerHTML = errorBannerHtml(err.message);
    document.getElementById('retryBtn')?.addEventListener('click', loadTenantPortal);
  }
}
