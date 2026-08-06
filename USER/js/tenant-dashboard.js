/* ================================================================
   USER/js/tenant-dashboard.js — split from the old USER/script.js
   Contains: TENANT PORTAL — loadTenantPortal(), the function that
   fetches profile/shops/bills/payments and renders the whole
   dashboard. Depends on core.js + ui-helpers.js, and calls into
   tenant-ledger.js (renderTpBillDrill, renderTpPayDrill, renderTenantLedger).
   ================================================================ */

/* ================================================================
   TENANT PORTAL
   ================================================================ */
/* ================================================================
   TENANT PORTAL
   ================================================================ */
document.getElementById('tenantRefreshBtn').addEventListener('click', async (e) => {
  e.currentTarget.classList.add('spinning');
  try { await loadTenantPortal(); showToast('Data refreshed', 'success'); }
  finally { e.currentTarget.classList.remove('spinning'); }
});

// Tenant portal filter state
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
    // ── add agreement‑days reminder ──
    let soonestEnd = null;
    shops.forEach(s => {
        if (s.agreement_end_date) {
            const d = new Date(s.agreement_end_date);
            if (!soonestEnd || d < soonestEnd) soonestEnd = d;
        }
    });
    let daysLeft = soonestEnd ? Math.round((soonestEnd - new Date()) / 86400000) : null;
    let agreementMsg = '';
    if (daysLeft !== null) {
        if (daysLeft < 0) agreementMsg = ' ⚠️ Agreement expired!';
        else if (daysLeft <= 30) agreementMsg = ` ⏳ ${daysLeft} days left on agreement`;
        else agreementMsg = ` 📅 ${daysLeft} days left on agreement`;
    }
    const greeting = getTimeGreeting(profile.name) + agreementMsg;
    document.getElementById('tenantGreeting').textContent = greeting;

    // Compute summary
    const totalRent = shops.reduce((s,sh)=>s+Number(sh.shop_rent||0),0);
    const totalDeposit = shops.reduce((s,sh)=>s+Number(sh.shop_deposit||0),0);
    const pendingBills = bills.filter(b=>b.status!=='paid');
    const pendingTotal = pendingBills.reduce((s,b)=>s+Number(b.pending_amount||0),0);
    const paidTotal = payments.reduce((s,p)=>s+Number(p.amount||0),0);
    const nextDue = pendingBills.filter(b=>b.due_date).sort((a,b)=>new Date(a.due_date)-new Date(b.due_date))[0];

    // Complex names come straight from /api/tenant/shops (complex_name per shop) —
    // /api/complex itself is admin-only and would 403 for a tenant.
    const complexNames = {};
    shops.forEach(s => { if (s.complex_id) complexNames[s.complex_id] = s.complex_name; });

    let depositPaid = 0;
    let depositRemaining = totalDeposit;
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
    depositRemaining = Math.max(0, totalDeposit - depositPaid);

    // ── Build the HTML ──
    content.innerHTML = `
    <!-- Summary Cards -->
        <div class="tp-stat-grid">
      <div class="tp-stat"><div class="tp-label">Assigned Shops</div><div class="tp-value">${shops.length}</div></div>
      <div class="tp-stat accent-green"><div class="tp-label">Monthly Rent</div><div class="tp-value" style="font-size:16px;">${currency(totalRent)}</div></div>
      <div class="tp-stat"><div class="tp-label">Deposit Required</div><div class="tp-value" style="font-size:16px;">${currency(totalDeposit)}</div></div>
      <div class="tp-stat accent-green"><div class="tp-label">Deposit Paid</div><div class="tp-value" style="font-size:16px;">${currency(depositPaid)}</div></div>
      <div class="tp-stat ${depositRemaining>0?'accent-rust':'accent-green'}"><div class="tp-label">Deposit Status</div><div class="tp-value" style="font-size:14px;">${depositRemaining<=0 && totalDeposit>0 ? 'Fully paid' : currency(depositRemaining)+' due'}</div></div>
      <div class="tp-stat accent-rust"><div class="tp-label">Pending Rent</div><div class="tp-value" style="font-size:16px;">${currency(pendingTotal)}</div></div>
      <div class="tp-stat accent-green"><div class="tp-label">Total Paid</div><div class="tp-value" style="font-size:16px;">${currency(paidTotal)}</div></div>
      <div class="tp-stat accent-partial"><div class="tp-label">Next Due Date</div><div class="tp-value" style="font-size:14px;">${nextDue ? dateFmt(nextDue.due_date) : '—'}</div></div>
      <!-- NEW: Agreement expiry -->
      <div class="tp-stat ${(daysLeft !== null && daysLeft <= 30) ? 'accent-rust' : 'accent-green'}" style="grid-column: span 1;">
        <div class="tp-label">Agreement Days Left</div>
        <div class="tp-value" style="font-size:14px;">${daysLeft !== null ? (daysLeft < 0 ? '⚠️ Expired' : daysLeft + ' days') : '—'}</div>
      </div>
    </div>

    <!-- Profile Section -->
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
          <div><div style="font-size:11px; color:var(--muted); font-weight:700; text-transform:uppercase; letter-spacing:.04em;">Tenant ID</div><div class="mono" style="margin-top:3px;">#${profile.id}</div></div>
          <div><div style="font-size:11px; color:var(--muted); font-weight:700; text-transform:uppercase; letter-spacing:.04em;">Status</div><div style="margin-top:3px;"><span class="pill ${profile.is_active?'active-pill':'inactive-pill'}"><span class="pill-dot"></span>${profile.is_active?'Active':'Inactive'}</span></div></div>
          <div><div style="font-size:11px; color:var(--muted); font-weight:700; text-transform:uppercase; letter-spacing:.04em;">Shops</div><div style="margin-top:3px; font-weight:700;">${shops.length}</div></div>
          <div><div style="font-size:11px; color:var(--muted); font-weight:700; text-transform:uppercase; letter-spacing:.04em;">Rent Bill Date</div><div style="margin-top:3px; font-weight:600;">${profile.rent_bill_date ? `Day ${profile.rent_bill_date} of month` : '—'}</div></div>
          <div><div style="font-size:11px; color:var(--muted); font-weight:700; text-transform:uppercase; letter-spacing:.04em;">Auto-billing</div><div style="margin-top:3px;"><span class="pill ${profile.auto_rent_bill_enabled?'active-pill':'inactive-pill'}"><span class="pill-dot"></span>${profile.auto_rent_bill_enabled?'Auto ON':'Auto OFF'}</span></div></div>
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
            <div class="amt-row" style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:4px; border:none; padding:0;">
              <div><div style="font-size:11px; color:var(--muted); font-weight:600; text-transform:uppercase;">Days Left</div><div style="font-weight:700; font-size:14px;">${s.agreement_end_date ? daysLeftHtml(s.agreement_end_date) : '—'}</div></div>
              <div><div style="font-size:11px; color:var(--muted); font-weight:600; text-transform:uppercase;">Status</div><div style="font-weight:700; font-size:14px;">${s.agreement_end_date ? daysLeftHtml(s.agreement_end_date) : '—'}</div></div>
            </div>
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
        ${totalDeposit > 0 ? `
        <div class="deposit-progress">
          <div style="display:flex; justify-content:space-between; font-size:12px; color:var(--muted); margin-bottom:4px;">
            <span>Progress</span><span>${Math.round(depositPaid/totalDeposit*100)}%</span>
          </div>
          <div class="deposit-bar-wrap"><div class="deposit-bar" style="width:${Math.min(100,Math.round(depositPaid/totalDeposit*100))}%;"></div></div>
        </div>` : ''}
        ${shops.length ? `
        <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:8px; margin-top:14px;">
          ${shops.map(s=>`<div class="info-card"><div class="info-row"><span class="info-label">${escapeHtml(s.shop_number)}</span><span class="info-val">${currency(s.shop_deposit||0)}</span></div></div>`).join('')}
        </div>` : ''}
        ${depositSourceFailed && depositPaid === 0 ? `
        <div class="warn-box" style="margin-top:12px;">
          ${warnIcon()}
          <span>We couldn't load your deposit payment history right now. The "Required" amount above is accurate, but "Paid" may not reflect deposit payments your admin has already recorded — contact your admin if this looks wrong.</span>
        </div>` : ''}
      </div>
    </div>

    <!-- Bills Section -->
    <div class="collapsible-section">
      <div class="collapsible-header" onclick="toggleCollapse(this)">
        <h3>Bills <span class="record-count-tag" style="margin-left:8px;">${bills.length}</span></h3>
        <svg class="collapsible-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="collapsible-body">
        <div id="tpBillCrumb" class="drill-crumb"></div>
        <div id="tpBillDrillArea"></div>
      </div>
    </div>

    <!-- Payments Section -->
<div class="collapsible-section">
  <div class="collapsible-header" onclick="toggleCollapse(this)">
    <h3>Payment History <span class="record-count-tag" style="margin-left:8px;">${payments.length}</span></h3>
    <svg class="collapsible-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
  </div>
  <div class="collapsible-body">
    <div id="tpPayCrumb" class="drill-crumb"></div>
    <div id="tpPayDrillArea"></div>
  </div>
</div>

    <!-- Monthly Ledger (NEW) -->
    <div class="collapsible-section">
      <div class="collapsible-header" onclick="toggleCollapse(this)">
        <h3>Monthly Ledger</h3>
        <svg class="collapsible-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="collapsible-body">
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
    `; // ── end content.innerHTML ──

    // ── Bills & Payments year→month drill-down ──
    tpBillsData = bills; tpShopsData = shops;
    tpBillDrill = { year:null, month:null };
    renderTpBillDrill();

    tpPaysData = payments;
    tpPayDrill = { year:null, month:null };
    renderTpPayDrill();



    // ── Monthly Ledger (NEW) ──
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
      ledgerYear.addEventListener('change', function() {
        loadLedger(this.value);
      });
      // Load initial year
      loadLedger(ledgerYear.value);
    }

    // ── Collapsible toggles (existing) ──
    document.querySelectorAll('.month-row-head').forEach(h => {
      h.addEventListener('click', () => {
        const body = h.nextElementSibling;
        body.classList.toggle('open');
      });
    });

  } catch (err) {
    content.innerHTML = errorBannerHtml(err.message);
    document.getElementById('retryBtn')?.addEventListener('click', loadTenantPortal);
  }
}

