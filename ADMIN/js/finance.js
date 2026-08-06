/* ================================================================
   ADMIN/js/finance.js — split from the old ADMIN/script.js
   Contains: the FINANCIAL SUMMARY MODAL (opened from Users), the
   "Tenant View" nav item (financeView/renderAdminTenantDashboard),
   and the "Ledger" nav item (ledgerView/renderLedgerDashboard) —
   these two nav items share a lot of tenant-financials rendering
   code so they were kept together in the original file.
   ================================================================ */
/* ================================================================
   FINANCIAL SUMMARY MODAL (Admin view for a tenant)
   ================================================================ */
async function openFinancialSummaryModal(userId, name){
  openModal(`Financial summary — ${name}`, `<div style="text-align:center; padding:24px 0;"><div class="spinner dark" style="margin:0 auto;"></div><div style="margin-top:10px; color:var(--muted); font-size:13px;">Loading…</div></div>`, ``);
  document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
  try {
    const d = await api(`/api/user/${userId}/financial-summary`);
    document.getElementById('modalBody').innerHTML = `
      <div class="stat-row" style="grid-template-columns:repeat(2,1fr); margin-bottom:14px;">
        <div class="card stat-card"><div class="label">Monthly rent</div><div class="value mono" style="font-size:20px;">${currency(d.rent_summary?.total_monthly_rent)}</div></div>
        <div class="card stat-card accent-rust"><div class="label">Pending rent</div><div class="value mono" style="font-size:20px;">${currency(d.rent_summary?.total_pending_rent)}</div></div>
        <div class="card stat-card"><div class="label">Deposit required</div><div class="value mono" style="font-size:20px;">${currency(d.deposit_summary?.total_deposit_required)}</div></div>
        <div class="card stat-card ${d.deposit_summary?.remaining_deposit > 0 ? 'accent-rust':'accent-green'}"><div class="label">Deposit remaining</div><div class="value mono" style="font-size:20px;">${currency(d.deposit_summary?.remaining_deposit)}</div></div>
      </div>

      ${d.shops_summary?.shops?.length > 0 ? `
      <h4 style="font-size:13.5px; margin:0 0 8px;">Shops (${d.shops_summary.total_shops})</h4>
      <div class="table-wrap" style="margin-bottom:16px;">
        <table><thead><tr><th>Shop</th><th>Complex</th><th class="num">Rent</th><th class="num">Deposit</th><th>Agreement Ends</th><th>Days Left</th><th></th></tr></thead>
        <tbody>${d.shops_summary.shops.map(s=>`<tr><td class="mono">${escapeHtml(s.shop_number)}</td><td>${escapeHtml(s.complex_name)}</td><td class="num">${currency(s.shop_rent)}</td><td class="num">${currency(s.shop_deposit)}</td><td>${dateFmt(s.agreement_end_date)}</td><td>${daysLeftHtml(s.agreement_end_date)}</td><td><button class="btn-icon" data-edit-agreement="${s.id}" data-shop-number="${escapeHtml(s.shop_number)}" data-start="${s.agreement_start_date||''}" data-end="${s.agreement_end_date||''}" title="Edit agreement dates">✎</button></td></tr>`).join('')}</tbody>
        </table>
      </div>` : ''}

      ${d.bills?.length > 0 ? `
      <h4 style="font-size:13.5px; margin:0 0 8px;">Bills</h4>
      <div class="table-wrap" style="margin-bottom:16px;">
        <table><thead><tr><th>Shop</th><th>Type</th><th class="num">Amount</th><th class="num">Pending</th><th>Status</th><th>Due</th></tr></thead>
        <tbody>${d.bills.map(b=>`<tr><td class="mono">${escapeHtml(b.shop_number)}</td><td>${escapeHtml(b.bill_type)}</td><td class="num">${currency(b.amount)}</td><td class="num">${currency(b.pending_amount)}</td><td>${stampHtml(b.status)}</td><td>${dateFmt(b.due_date)}</td></tr>`).join('')}</tbody>
        </table>
      </div>` : ''}

      ${d.payment_history?.length > 0 ? `
      <h4 style="font-size:13.5px; margin:0 0 8px;">Payment history</h4>
      <div class="table-wrap" style="margin-bottom:16px;">
        <table><thead><tr><th>Date</th><th>Shop</th><th>Type</th><th class="num">Amount</th><th>Method</th></tr></thead>
        <tbody>${d.payment_history.map(p=>`<tr><td>${dateFmt(p.payment_date)}</td><td class="mono">${escapeHtml(p.shop_number)}</td><td>${escapeHtml(p.bill_type)}</td><td class="num">${currency(p.amount)}</td><td>${escapeHtml(p.payment_method)}</td></tr>`).join('')}</tbody>
        </table>
      </div>` : ''}

      ${d.deposit_payment_history?.length > 0 ? `
      <h4 style="font-size:13.5px; margin:0 0 8px;">Deposit payment history</h4>
      <div class="table-wrap">
        <table><thead><tr><th>Date</th><th>Shop</th><th class="num">Amount</th><th>Remarks</th></tr></thead>
        <tbody>${d.deposit_payment_history.map(p=>`<tr><td>${dateFmt(p.payment_date)}</td><td class="mono">${escapeHtml(p.shop_number)}</td><td class="num">${currency(p.amount)}</td><td>${escapeHtml(p.remarks||'—')}</td></tr>`).join('')}</tbody>
        </table>
      </div>` : ''}
    `;
    document.getElementById('modalFoot').innerHTML = `<button class="btn btn-ghost" onclick="closeModal()">Close</button>`;
    document.querySelectorAll('[data-edit-agreement]').forEach(btn => {
      btn.addEventListener('click', () => openEditAgreementModal(
        userId, name,
        Number(btn.dataset.editAgreement),
        btn.dataset.shopNumber,
        btn.dataset.start,
        btn.dataset.end
      ));
    });
  } catch(err) {
    document.getElementById('modalBody').innerHTML = `<div class="error-banner"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><span>${escapeHtml(err.message)}</span></div>`;
    document.getElementById('modalFoot').innerHTML = `<button class="btn btn-ghost" onclick="closeModal()">Close</button>`;
  }
}

function openEditAgreementModal(userId, userName, shopId, shopNumber, startIso, endIso, onDone){
  const goBack = onDone || (() => openFinancialSummaryModal(userId, userName));
  const startVal = startIso ? startIso.slice(0,10) : '';
  const endVal   = endIso ? endIso.slice(0,10) : '';
  openModal(`Edit agreement — ${shopNumber}`, `
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
      <div class="form-field">
        <label for="editAgreementStart">Start date</label>
        <input type="date" id="editAgreementStart" value="${startVal}">
      </div>
      <div class="form-field">
        <label for="editAgreementEnd">End date</label>
        <input type="date" id="editAgreementEnd" value="${endVal}">
      </div>
    </div>
  `, `
    <button class="btn btn-ghost" id="cancelBtn">Cancel</button>
    <button class="btn btn-primary" id="saveAgreementBtn">Save</button>
  `);
  document.getElementById('cancelBtn').addEventListener('click', goBack);
  document.getElementById('saveAgreementBtn').addEventListener('click', async () => {
    await withSavingState('saveAgreementBtn', async () => {
      const agreement_start_date = document.getElementById('editAgreementStart').value || null;
      const agreement_end_date   = document.getElementById('editAgreementEnd').value || null;
      await api(`/api/user/${userId}/shop/${shopId}/agreement`, {
        method: 'PUT',
        body: { agreement_start_date, agreement_end_date },
      });
      state.loaded.shops = false;   // <-- invalidate cache so fresh data is fetched
      showToast('Agreement dates updated', 'success');
      // Also refresh the shops view if it's currently visible
      if (state.view === 'shops') {
        state.loaded.shops = false;
        await renderView('shops');
      }
      await goBack();
    }, 'Saving…');
  });
}

/* ================================================================
   FINANCE VIEW
   ================================================================ */
async function financeView(){
  const complexes = await ensureLoaded('complexes','/api/complex');
  const users = await ensureLoaded('users','/api/user');
  const shops = await ensureLoaded('shops','/api/shop');
  // (shops are loaded but not used directly here; will be used in populate)
  return `
  <div class="card card-pad" style="margin-bottom:18px;">
    <div style="display:flex; gap:14px; align-items:flex-end; flex-wrap:wrap;">
      <div class="field" style="margin-bottom:0;">
        <label for="fiComplex">Complex</label>
        <select id="fiComplex">
          <option value="">All complexes</option>
          ${complexes.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}
        </select>
      </div>
      <div class="field" style="margin-bottom:0;">
        <label for="fiStatus">Status</label>
        <select id="fiStatus">
          <option value="all">All</option>
          <option value="active">Active (has shops)</option>
          <option value="inactive">Inactive (no shops)</option>
        </select>
      </div>
      <div class="field" style="margin-bottom:0;">
        <label for="fiUser">Tenant</label>
        <select id="fiUser">
          <option value="">— select tenant —</option>
        </select>
      </div>
      <div class="field" style="margin-bottom:0; position:relative;">
        <label for="fiSearch">Quick search</label>
        <input id="fiSearch" placeholder="Name or mobile…" style="padding:11px 13px; border:1.5px solid var(--line); border-radius:var(--radius-sm); font-size:13.5px; width:200px;">
      </div>
      <button class="btn btn-primary" id="loadTenantSummaryBtn">Load Tenant Summary</button>
    </div>
  </div>
  <div id="tenantSummaryContainer">
    <div class="empty-state">${emptyIcon()}<h3>Select a tenant and click Load</h3><p>Choose a tenant from the dropdown above to view their full dashboard.</p></div>
  </div>
  `;
}


async function ledgerView(){
  const complexes = await ensureLoaded('complexes','/api/complex');
  const users = await ensureLoaded('users','/api/user');
  const shops = await ensureLoaded('shops','/api/shop');
  const currentYear = new Date().getFullYear();
  return `
  <div class="card card-pad" style="margin-bottom:18px;">
    <div style="display:flex; gap:14px; align-items:flex-end; flex-wrap:wrap;">
      <div class="field" style="margin-bottom:0;">
        <label for="ldStatus">Status</label>
        <select id="ldStatus">
          <option value="all">All</option>
          <option value="active">Active (has shops)</option>
          <option value="inactive">Inactive (no shops)</option>
        </select>
      </div>
      <div class="field" style="margin-bottom:0;">
        <label for="ldUser">Tenant</label>
        <select id="ldUser">
          <option value="">— select tenant —</option>
        </select>
      </div>
      <div class="field" style="margin-bottom:0;">
        <label for="ldYear">Year</label>
        <select id="ldYear">
          ${Array.from({length:6},(_,i) => {
            const y = currentYear - i;
            return `<option value="${y}" ${i===0?'selected':''}>${y}</option>`;
          }).join('')}
        </select>
      </div>
      <div class="field" style="margin-bottom:0; position:relative;">
        <label for="ldSearch">Quick search</label>
        <input id="ldSearch" placeholder="Name or mobile…" style="padding:11px 13px; border:1.5px solid var(--line); border-radius:var(--radius-sm); font-size:13.5px; width:200px;">
      </div>
      <button class="btn btn-primary" id="loadLedgerBtn">Load Ledger</button>
    </div>
  </div>
  <div id="ledgerContainer">
    <div class="empty-state">${emptyIcon()}<h3>Select a tenant and click Load</h3><p>Choose a tenant and year to view their monthly ledger.</p></div>
  </div>
  `;
}

function attachFinanceHandlers(){
  // ── Helper: populate tenant dropdown based on status filter ──
  function populateTenantDropdown(statusFilter) {
    const users = state.cache.users || [];
    const shops = state.cache.shops || [];
    // Build map of user_id -> has active shop assignment
    const userShopMap = {};
    shops.forEach(s => {
      if (s.assigned_to) {
        userShopMap[s.assigned_to.id] = true;
      }
    });

    let filtered = users.filter(u => u.role === 'tenant');
    if (statusFilter === 'active') {
      filtered = filtered.filter(u => userShopMap[u.id] === true);
    } else if (statusFilter === 'inactive') {
      filtered = filtered.filter(u => userShopMap[u.id] !== true);
    }
    // Sort by name
    filtered.sort((a,b) => a.name.localeCompare(b.name));

    const sel = document.getElementById('fiUser');
    sel.innerHTML = '<option value="">— select tenant —</option>' +
      filtered.map(u => `<option value="${u.id}">${escapeHtml(u.name)} · ${escapeHtml(u.mobile)}</option>`).join('');

    // Clear selection if the previously selected tenant is no longer in the list
    const currentVal = sel.value;
    if (currentVal && !filtered.some(u => u.id === Number(currentVal))) {
      sel.value = '';
    }

    // Enable/disable Load button
    const loadBtn = document.getElementById('loadTenantSummaryBtn');
    loadBtn.disabled = (filtered.length === 0);

    // Clear the summary container when filter changes
    const container = document.getElementById('tenantSummaryContainer');
    if (container) {
      container.innerHTML = `<div class="empty-state">${emptyIcon()}<h3>Select a tenant and click Load</h3><p>Choose a tenant from the dropdown above to view their full dashboard.</p></div>`;
    }
  }

  // ── Initial population (default status = 'all') ──
  populateTenantDropdown('all');

  // ── Status filter change ──
  document.getElementById('fiStatus').addEventListener('change', function() {
    populateTenantDropdown(this.value);
  });

  // ── Quick search (finds tenant and selects it if visible) ──
  let _fiSearchTimer;
  const fiSearch = document.getElementById('fiSearch');
  if (fiSearch) {
    fiSearch.addEventListener('input', () => {
      clearTimeout(_fiSearchTimer);
      _fiSearchTimer = setTimeout(() => {
        const q = fiSearch.value.trim().toLowerCase();
        if (!q) return;
        const users = state.cache.users || [];
        const match = users.find(u => u.role === 'tenant' && (u.name.toLowerCase().includes(q) || u.mobile.includes(q)));
        if (match) {
          const sel = document.getElementById('fiUser');
          const options = Array.from(sel.options);
          const found = options.some(opt => opt.value === String(match.id));
          if (found) {
            sel.value = match.id;
          } else {
            showToast('Tenant not visible with current status filter. Try changing Status to "All".', 'default');
          }
        }
      }, 300);
    });
  }

  // ── Load button ──
  document.getElementById('loadTenantSummaryBtn').addEventListener('click', loadTenantSummary);

  // ── (Optional) Auto‑load when tenant changes ──
  // document.getElementById('fiUser').addEventListener('change', loadTenantSummary);
}
async function loadTenantSummary(){
  const container = document.getElementById('tenantSummaryContainer');
  const uid = document.getElementById('fiUser').value;
  const complexId = document.getElementById('fiComplex').value;

  if (!uid) {
    container.innerHTML = `<div class="empty-state">${emptyIcon()}<h3>Select a tenant</h3><p>Choose a tenant from the dropdown and click Load.</p></div>`;
    return;
  }

  container.innerHTML = skeletonHtml();

  try {
    const user = state.cache.users.find(u => u.id === Number(uid));
    const data = await api(`/api/user/${uid}/financial-summary`);
    container.innerHTML = renderAdminTenantDashboard(data, user, complexId);
    // Attach bill filters
    attachAdminTenantBillFilters(container);
    // Attach collapsible toggles
    container.querySelectorAll('.collapsible-header').forEach(h => {
      h.addEventListener('click', function() {
        this.classList.toggle('open');
        const body = this.nextElementSibling;
        if (body) body.classList.toggle('open');
      });
    });
    container.querySelectorAll('.month-row-head').forEach(h => {
      h.addEventListener('click', function() {
        const body = this.nextElementSibling;
        if (body) body.classList.toggle('open');
      });
    });
  } catch (err) {
    container.innerHTML = errorBannerHtml(err.message);
    document.getElementById('retryBtn')?.addEventListener('click', loadTenantSummary);
  }
}



function attachLedgerHandlers(){
  // Populate tenant dropdown based on status
  function populateLedgerTenants(statusFilter) {
    const users = state.cache.users || [];
    const shops = state.cache.shops || [];
    const userShopMap = {};
    shops.forEach(s => {
      if (s.assigned_to) userShopMap[s.assigned_to.id] = true;
    });

    let filtered = users.filter(u => u.role === 'tenant');
    if (statusFilter === 'active') {
      filtered = filtered.filter(u => userShopMap[u.id] === true);
    } else if (statusFilter === 'inactive') {
      filtered = filtered.filter(u => userShopMap[u.id] !== true);
    }
    filtered.sort((a,b) => a.name.localeCompare(b.name));

    const sel = document.getElementById('ldUser');
    sel.innerHTML = '<option value="">— select tenant —</option>' +
      filtered.map(u => `<option value="${u.id}">${escapeHtml(u.name)} · ${escapeHtml(u.mobile)}</option>`).join('');

    // Clear selection if previous tenant no longer in list
    const currentVal = sel.value;
    if (currentVal && !filtered.some(u => u.id === Number(currentVal))) sel.value = '';

    const loadBtn = document.getElementById('loadLedgerBtn');
    loadBtn.disabled = (filtered.length === 0);
    // Clear container on filter change
    const container = document.getElementById('ledgerContainer');
    if (container) {
      container.innerHTML = `<div class="empty-state">${emptyIcon()}<h3>Select a tenant and click Load</h3><p>Choose a tenant and year to view their monthly ledger.</p></div>`;
    }
  }

  // Initial load
  populateLedgerTenants('all');

  // Status change
  document.getElementById('ldStatus').addEventListener('change', function() {
    populateLedgerTenants(this.value);
  });

  // Quick search
  let _ldSearchTimer;
  const ldSearch = document.getElementById('ldSearch');
  if (ldSearch) {
    ldSearch.addEventListener('input', () => {
      clearTimeout(_ldSearchTimer);
      _ldSearchTimer = setTimeout(() => {
        const q = ldSearch.value.trim().toLowerCase();
        if (!q) return;
        const users = state.cache.users || [];
        const match = users.find(u => u.role === 'tenant' && (u.name.toLowerCase().includes(q) || u.mobile.includes(q)));
        if (match) {
          const sel = document.getElementById('ldUser');
          const options = Array.from(sel.options);
          const found = options.some(opt => opt.value === String(match.id));
          if (found) {
            sel.value = match.id;
          } else {
            showToast('Tenant not visible with current status filter. Try changing Status to "All".', 'default');
          }
        }
      }, 300);
    });
  }

  // Load button
  document.getElementById('loadLedgerBtn').addEventListener('click', loadLedger);

  // (Optional) auto-load on tenant change
  // document.getElementById('ldUser').addEventListener('change', loadLedger);
}

async function loadLedger(){
  const container = document.getElementById('ledgerContainer');
  const uid = document.getElementById('ldUser').value;
  const year = document.getElementById('ldYear').value;

  if (!uid) {
    container.innerHTML = `<div class="empty-state">${emptyIcon()}<h3>Select a tenant</h3><p>Choose a tenant and click Load.</p></div>`;
    return;
  }

  container.innerHTML = skeletonHtml();

  try {
    const data = await api(`/api/ledger/monthly?user_id=${uid}&year=${year}`);
    state._lastAdminLedgerData = { tenantName: data.tenant.name, tenantMobile: data.tenant.mobile, year, monthly: data.monthly, summary: data.summary, complexName: [...new Set(data.shops.map(s=>s.complex_name).filter(Boolean))].join(', ') };
    container.innerHTML = renderLedgerDashboard(data);
  } catch (err) {
    container.innerHTML = errorBannerHtml(err.message);
    document.getElementById('retryBtn')?.addEventListener('click', loadLedger);
  }
}




function renderLedgerDashboard(data){
  const tenant = data.tenant;
  const summary = data.summary;
  const monthly = data.monthly;
  const shops = data.shops;
  const bills = data.bills;
  const payments = data.payments;
  const deposits = data.deposits;

  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const monthlyRows = monthly.map((m, idx) => {
    const statusColor = m.status === 'Paid' ? 'var(--success)' :
                        m.status === 'Partial' ? 'var(--partial)' :
                        m.status === 'Pending' ? 'var(--rust)' : 'var(--muted)';
    return `
      <tr>
        <td><strong>${monthNames[idx]}</strong></td>
        <td class="num">${m.bills_count}</td>
        <td class="num">${m.bills_count ? currency(m.billed) : '–'}</td>
        <td class="num">${m.bills_count ? currency(m.paid) : '–'}</td>
        <td class="num">${m.bills_count ? currency(m.remaining) : '–'}</td>
        <td><span style="color:${statusColor}; font-weight:600;">${m.status}</span></td>
      </tr>
    `;
  }).join('');

  // Year total row
  const totalBilled = monthly.reduce((s,m) => s + m.billed, 0);
  const totalPaid = monthly.reduce((s,m) => s + m.paid, 0);
  const totalRemaining = monthly.reduce((s,m) => s + m.remaining, 0);
  const totalBillsCount = monthly.reduce((s,m) => s + m.bills_count, 0);
  const overallStatus = totalRemaining === 0 ? 'Paid' : (totalPaid > 0 ? 'Partial' : 'Pending');

  return `
    <!-- Tenant name -->
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
      <h2 style="font-size:18px;">${escapeHtml(tenant.name)} <span style="font-size:14px; font-weight:400; color:var(--muted);">· ${escapeHtml(tenant.mobile)}</span></h2>
      <span class="crumb">Year ${document.getElementById('ldYear').value}</span>
    </div>

    <!-- Summary Cards -->
    <div class="stat-row">
      <div class="card stat-card"><div class="label">Outstanding Dues</div><div class="value mono">${currency(summary.outstanding_dues)}</div></div>
      <div class="card stat-card accent-green"><div class="label">Total Billed</div><div class="value mono">${currency(summary.total_billed)}</div></div>
      <div class="card stat-card accent-green"><div class="label">Total Paid</div><div class="value mono">${currency(summary.total_paid)}</div></div>
      <div class="card stat-card"><div class="label">Deposit on File</div><div class="value mono">${currency(summary.deposit_on_file)}</div></div>
    </div>

    <!-- Monthly Ledger Table -->
    <div class="card card-pad" style="margin-bottom:18px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
        <h3 style="font-size:15.5px; margin:0;">Month-wise ledger</h3>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-ghost btn-sm" onclick="downloadMonthlyLedgerPdf('admin')">Download PDF</button>
          <button class="btn btn-ghost btn-sm" onclick="printMonthlyLedgerPdf('admin')">Print</button>
          <button class="btn btn-ghost btn-sm" onclick="shareMonthlyLedgerPdf('admin')">Share</button>
        </div>
      </div>
      <div class="table-wrap" style="border:none; border-radius:0; box-shadow:none; padding:0;">
        <table>
          <thead>
            <tr>
              <th>Month</th>
              <th class="num">Bills</th>
              <th class="num">Billed</th>
              <th class="num">Paid</th>
              <th class="num">Remaining</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${monthlyRows}
            <tr style="font-weight:700; background:var(--paper); border-top:2px solid var(--line);">
              <td>Year total</td>
              <td class="num">${totalBillsCount}</td>
              <td class="num">${currency(totalBilled)}</td>
              <td class="num">${currency(totalPaid)}</td>
              <td class="num">${currency(totalRemaining)}</td>
              <td><span style="color:${overallStatus === 'Paid' ? 'var(--success)' : 'var(--rust)'}; font-weight:700;">${overallStatus}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Shops -->
    <div class="collapsible-section">
      <div class="collapsible-header" onclick="toggleCollapse(this)">
        <h3>Shops (${shops.length})</h3>
        <svg class="collapsible-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="collapsible-body">
        ${shops.length === 0 ? '<div class="empty-compact">No shops assigned.</div>' :
          shops.map(s => `
            <div class="tenant-card">
              <div class="row1"><span class="title mono">${escapeHtml(s.shop_number)}</span></div>
              <div class="meta">Area: ${s.area_sqft} sqft · Rent: ${currency(s.shop_rent)} · Deposit: ${currency(s.shop_deposit)}</div>
            </div>
          `).join('')}
      </div>
    </div>

    <!-- Bills -->
    <div class="collapsible-section">
      <div class="collapsible-header" onclick="toggleCollapse(this)">
        <h3>Bills (${bills.length})</h3>
        <svg class="collapsible-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="collapsible-body">
        ${bills.length === 0 ? '<div class="empty-compact">No bills for this year.</div>' :
          `<div class="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Type</th><th class="num">Amount</th><th class="num">Paid</th><th class="num">Pending</th><th>Status</th></tr></thead>
              <tbody>
                ${bills.map(b => `
                  <tr>
                    <td>${dateFmt(b.bill_date)}</td>
                    <td>${escapeHtml(b.bill_type)}</td>
                    <td class="num">${currency(b.amount)}</td>
                    <td class="num">${currency(b.paid_amount)}</td>
                    <td class="num">${currency(b.pending_amount)}</td>
                    <td>${stampHtml(b.status)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>`}
      </div>
    </div>

    <!-- Payments -->
    <div class="collapsible-section">
      <div class="collapsible-header" onclick="toggleCollapse(this)">
        <h3>Payments (${payments.length})</h3>
        <svg class="collapsible-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="collapsible-body">
        ${payments.length === 0 ? '<div class="empty-compact">No payments for this year.</div>' :
          payments.map(p => `
            <div class="tenant-card">
              <div class="row1"><span class="title mono">${currency(p.amount)}</span><span class="meta">${escapeHtml(p.payment_method)}</span></div>
              <div class="meta">${dateFmt(p.payment_date)}</div>
            </div>
          `).join('')}
      </div>
    </div>

    <!-- Deposits -->
    <div class="collapsible-section">
      <div class="collapsible-header" onclick="toggleCollapse(this)">
        <h3>Deposits (${deposits.length})</h3>
        <svg class="collapsible-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="collapsible-body">
        ${deposits.length === 0 ? '<div class="empty-compact">No deposit payments for this year.</div>' :
          deposits.map(d => `
            <div class="tenant-card">
              <div class="row1"><span class="title mono">${currency(d.amount)}</span></div>
              <div class="meta">${dateFmt(d.payment_date)}${d.remarks ? ' · '+escapeHtml(d.remarks) : ''}</div>
            </div>
          `).join('')}
      </div>
    </div>
  `;
}




function renderAdminTenantDashboard(data, user, complexFilter){
  // data from /api/user/{id}/financial-summary
  const shops = data.shops || [];
  const bills = data.bills || [];
  const payments = data.payment_history || [];
  const depositPayments = data.deposit_payment_history || [];

  // Apply complex filter if needed
  let filteredShops = shops;
  if (complexFilter) {
    // We need to know complex_id for each shop – it's in the data
    filteredShops = shops.filter(s => s.complex_id === Number(complexFilter));
  }
  // If complex filter is applied, we should also filter bills to only those shops?
  // But bills are already linked to shops; we can filter bills by shop_id in filteredShops.
  const shopIds = new Set(filteredShops.map(s => s.id));
  const filteredBills = bills.filter(b => shopIds.has(b.shop_id));
  const filteredPayments = payments.filter(p => shopIds.has(p.shop_id));

  // Compute summary from filtered data
  const totalRent = filteredShops.reduce((sum, s) => sum + Number(s.shop_rent || 0), 0);
  const totalDeposit = filteredShops.reduce((sum, s) => sum + Number(s.shop_deposit || 0), 0);
  const pendingBills = filteredBills.filter(b => b.status !== 'paid');
  const pendingTotal = pendingBills.reduce((sum, b) => sum + Number(b.pending_amount || 0), 0);
  const paidTotal = filteredBills.reduce((sum, b) => sum + Number(b.paid_amount || 0), 0);
  const depositPaid = depositPayments.reduce((sum, d) => sum + Number(d.amount || 0), 0);
  const depositRemaining = Math.max(0, totalDeposit - depositPaid);
  const nextDue = pendingBills.filter(b => b.due_date).sort((a,b) => new Date(a.due_date) - new Date(b.due_date))[0];

  // Get complex names
  const complexes = state.cache.complexes || [];
  const complexMap = Object.fromEntries(complexes.map(c => [c.id, c.name]));

  // Build HTML (reusing the tenant portal design)
  return `
    <!-- Summary Cards -->
    <div class="tp-stat-grid">
      <div class="tp-stat"><div class="tp-label">Assigned Shops</div><div class="tp-value">${filteredShops.length}</div></div>
      <div class="tp-stat accent-green"><div class="tp-label">Monthly Rent</div><div class="tp-value" style="font-size:16px;">${currency(totalRent)}</div></div>
      <div class="tp-stat"><div class="tp-label">Deposit Required</div><div class="tp-value" style="font-size:16px;">${currency(totalDeposit)}</div></div>
      <div class="tp-stat accent-green"><div class="tp-label">Deposit Paid</div><div class="tp-value" style="font-size:16px;">${currency(depositPaid)}</div></div>
      <div class="tp-stat ${depositRemaining>0?'accent-rust':'accent-green'}"><div class="tp-label">Deposit Status</div><div class="tp-value" style="font-size:14px;">${depositRemaining<=0 && totalDeposit>0 ? 'Fully paid' : currency(depositRemaining)+' due'}</div></div>
      <div class="tp-stat accent-rust"><div class="tp-label">Pending Rent</div><div class="tp-value" style="font-size:16px;">${currency(pendingTotal)}</div></div>
      <div class="tp-stat accent-green"><div class="tp-label">Total Paid</div><div class="tp-value" style="font-size:16px;">${currency(paidTotal)}</div></div>
      <div class="tp-stat accent-partial"><div class="tp-label">Next Due Date</div><div class="tp-value" style="font-size:14px;">${nextDue ? dateFmt(nextDue.due_date) : '—'}</div></div>
    </div>

    <!-- Profile Section -->
    <div class="collapsible-section">
      <div class="collapsible-header">
        <h3>My Profile</h3>
        <svg class="collapsible-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="collapsible-body">
        <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:10px;">
          <div><div style="font-size:11px; color:var(--muted); font-weight:700; text-transform:uppercase; letter-spacing:.04em;">Name</div><div style="font-weight:600; margin-top:3px;">${escapeHtml(user.name)}</div></div>
          <div><div style="font-size:11px; color:var(--muted); font-weight:700; text-transform:uppercase; letter-spacing:.04em;">Mobile</div><div class="mono" style="margin-top:3px;">${escapeHtml(user.mobile)}</div></div>
          ${user.email ? `<div><div style="font-size:11px; color:var(--muted); font-weight:700; text-transform:uppercase; letter-spacing:.04em;">Email</div><div style="margin-top:3px;">${escapeHtml(user.email)}</div></div>` : ''}
          <div><div style="font-size:11px; color:var(--muted); font-weight:700; text-transform:uppercase; letter-spacing:.04em;">Tenant ID</div><div class="mono" style="margin-top:3px;">#${user.id}</div></div>
          <div><div style="font-size:11px; color:var(--muted); font-weight:700; text-transform:uppercase; letter-spacing:.04em;">Status</div><div style="margin-top:3px;"><span class="pill ${user.is_active?'active-pill':'inactive-pill'}"><span class="pill-dot"></span>${user.is_active?'Active':'Inactive'}</span></div></div>
          <div><div style="font-size:11px; color:var(--muted); font-weight:700; text-transform:uppercase; letter-spacing:.04em;">Shops</div><div style="margin-top:3px; font-weight:700;">${filteredShops.length}</div></div>
        </div>
      </div>
    </div>

    <!-- My Shops -->
    <div class="collapsible-section">
      <div class="collapsible-header">
        <h3>My Shops <span class="record-count-tag" style="margin-left:8px;">${filteredShops.length}</span></h3>
        <svg class="collapsible-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="collapsible-body">
        ${filteredShops.length === 0 ? '<div class="empty-compact">No shops assigned.</div>' :
          filteredShops.map(s => `
          <div class="tenant-card">
            <div class="row1">
              <span class="title mono">${escapeHtml(s.shop_number)}</span>
              <span class="pill ${s.status}"><span class="pill-dot"></span>${escapeHtml(s.status)}</span>
            </div>
            <div class="meta">${escapeHtml(complexMap[s.complex_id] || 'Complex #'+s.complex_id)} · ${Number(s.area_sqft||0).toLocaleString('en-IN')} sqft</div>
            <div class="amt-row" style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:8px; border:none; padding:0;">
              <div><div style="font-size:11px; color:var(--muted); font-weight:600; text-transform:uppercase;">Rent/mo</div><div class="mono" style="font-weight:700; font-size:14px;">${currency(s.shop_rent||0)}</div></div>
              <div><div style="font-size:11px; color:var(--muted); font-weight:600; text-transform:uppercase;">Deposit</div><div class="mono" style="font-weight:700; font-size:14px;">${currency(s.shop_deposit||0)}</div></div>
            </div>
          </div>`).join('')}
      </div>
    </div>

    <!-- Deposit Summary -->
    <div class="collapsible-section">
      <div class="collapsible-header">
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
        ${filteredShops.length ? `
        <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:8px; margin-top:14px;">
          ${filteredShops.map(s => `<div class="info-card"><div class="info-row"><span class="info-label">${escapeHtml(s.shop_number)}</span><span class="info-val">${currency(s.shop_deposit||0)}</span></div></div>`).join('')}
        </div>` : ''}
      </div>
    </div>

    <!-- Bills Section -->
    <div class="collapsible-section">
      <div class="collapsible-header">
        <h3>Bills <span class="record-count-tag" style="margin-left:8px;">${filteredBills.length}</span></h3>
        <svg class="collapsible-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="collapsible-body">
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px;">
          <select id="tpBillStatus" class="sort-select" style="font-size:12.5px; padding:7px 10px;">
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="partial">Partial</option>
            <option value="paid">Paid</option>
          </select>
          <select id="tpBillShop" class="sort-select" style="font-size:12.5px; padding:7px 10px;">
            <option value="">All shops</option>
            ${filteredShops.map(s => `<option value="${s.id}">${escapeHtml(s.shop_number)}</option>`).join('')}
          </select>
          <select id="tpBillMonth" class="sort-select" style="font-size:12.5px; padding:7px 10px;">
            <option value="">Any month</option>
            ${Array.from({length:12},(_,i)=>`<option value="${i+1}">${new Date(2000,i).toLocaleString('en-IN',{month:'short'})}</option>`).join('')}
          </select>
          <input id="tpBillYear" type="number" placeholder="Year" min="2020" max="2099" style="width:80px; padding:7px 10px; border:1.5px solid var(--line); border-radius:var(--radius-sm); font-size:12.5px;">
          <button class="btn btn-ghost btn-sm" onclick="clearAdminTpBillFilters()">Clear</button>
        </div>
        <div id="tpBillList">
          ${filteredBills.length === 0 ? '<div class="empty-compact">No bills found.</div>' :
            filteredBills.map(b => `
            <div class="tenant-card tp-bill-row" data-status="${b.status}" data-shop-id="${b.shop_id}" data-due="${b.due_date||''}">
              <div class="row1"><span class="title">${escapeHtml(b.bill_type)}</span>${stampHtml(b.status)}</div>
              <div class="meta">Bill #${b.id} · ${escapeHtml(filteredShops.find(s=>s.id===b.shop_id)?.shop_number||'Shop #'+b.shop_id)} · billed ${dateFmt(b.bill_date)} · due ${dateFmt(b.due_date)}</div>
              ${b.description ? `<div class="meta" style="margin-top:2px;">${escapeHtml(b.description)}</div>` : ''}
              <div class="amt-row"><span>Total ${currency(b.amount)} · Paid ${currency(b.paid_amount||0)}</span><span class="big" style="color:${b.pending_amount>0?'var(--rust)':'var(--success)'};">${currency(b.pending_amount)} due</span></div>
            </div>`).join('')}
        </div>
        <div id="tpBillEmpty" class="empty-compact" style="display:none;">No bills match your filters.</div>
      </div>
    </div>
    <!-- Monthly Summary -->
    <div class="collapsible-section">
      <div class="collapsible-header">
        <h3>Monthly Summary</h3>
        <svg class="collapsible-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="collapsible-body">
        ${renderAdminMonthSummary(filteredBills, filteredPayments)}
      </div>
    </div>
  `;
}

function renderAdminMonthSummary(bills, payments){
  // Group by year-month (same as tenant portal)
  const months = {};
  bills.forEach(b => {
    const d = b.bill_date || b.created_at || b.due_date;
    if (!d) return;
    const dt = new Date(d);
    const key = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
    if (!months[key]) months[key] = { bills:[], payments:[] };
    months[key].bills.push(b);
  });
  payments.forEach(p => {
    const d = p.payment_date;
    if (!d) return;
    const dt = new Date(d);
    const key = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
    if (!months[key]) months[key] = { bills:[], payments:[] };
    months[key].payments.push(p);
  });

  const sortedKeys = Object.keys(months).sort((a,b)=>b.localeCompare(a));
  if (!sortedKeys.length) return '<div class="empty-compact">No billing history yet.</div>';

  return sortedKeys.map(key => {
    const [yr, mo] = key.split('-');
    const mName = new Date(Number(yr), Number(mo)-1).toLocaleString('en-IN',{month:'long', year:'numeric'});
    const mBills = months[key].bills;
    const mPays = months[key].payments;
    const rent = mBills.reduce((s,b)=>s+Number(b.amount||0),0);
    const paid = mPays.reduce((s,p)=>s+Number(p.amount||0),0);
    const pending = mBills.reduce((s,b)=>s+Number(b.pending_amount||0),0);
    return `
    <div class="month-row">
      <div class="month-row-head">
        <div class="m-name">${mName}</div>
        <div class="m-badges">
          <span style="font-size:12px; color:var(--muted);">${currency(rent)} billed</span>
          ${pending>0?`<span class="stamp pending" style="transform:none; font-size:10px;">${currency(pending)} due</span>`:`<span class="stamp paid" style="transform:none; font-size:10px;">paid</span>`}
        </div>
      </div>
      <div class="month-row-body">
        <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-bottom:10px;">
          <div><div style="font-size:11px; color:var(--muted); font-weight:600; text-transform:uppercase;">Rent</div><div class="mono" style="font-weight:700;">${currency(rent)}</div></div>
          <div><div style="font-size:11px; color:var(--muted); font-weight:600; text-transform:uppercase;">Paid</div><div class="mono" style="color:var(--success); font-weight:700;">${currency(paid)}</div></div>
          <div><div style="font-size:11px; color:var(--muted); font-weight:600; text-transform:uppercase;">Pending</div><div class="mono" style="color:${pending>0?'var(--rust)':'var(--success)'}; font-weight:700;">${currency(pending)}</div></div>
        </div>
        ${mBills.length ? `<div style="font-size:12px; font-weight:600; color:var(--muted); margin-bottom:6px; text-transform:uppercase; letter-spacing:.04em;">Bills</div>
          ${mBills.map(b => `<div style="display:flex; justify-content:space-between; font-size:13px; padding:5px 0; border-bottom:1px dashed var(--line);">
            <span>${escapeHtml(b.bill_type)} · #${b.id}</span><span style="display:flex; gap:8px; align-items:center;">${stampHtml(b.status)} ${currency(b.pending_amount)} due</span>
          </div>`).join('')}` : ''}
        ${mPays.length ? `<div style="font-size:12px; font-weight:600; color:var(--muted); margin:10px 0 6px; text-transform:uppercase; letter-spacing:.04em;">Payments</div>
          ${mPays.map(p => `<div style="display:flex; justify-content:space-between; font-size:13px; padding:5px 0; border-bottom:1px dashed var(--line);">
            <span>${dateFmt(p.payment_date)} · ${escapeHtml(p.payment_method)}</span><span class="mono" style="color:var(--success); font-weight:700;">${currency(p.amount)}</span>
          </div>`).join('')}` : ''}
      </div>
    </div>`;
  }).join('');
}

// Admin tenant bill filters (identical to tenant portal but uses our container)
function attachAdminTenantBillFilters(container){
  const applyFilters = () => {
    const status = container.querySelector('#tpBillStatus')?.value || '';
    const shopId = container.querySelector('#tpBillShop')?.value || '';
    const month = container.querySelector('#tpBillMonth')?.value || '';
    const year = container.querySelector('#tpBillYear')?.value || '';
    const rows = container.querySelectorAll('.tp-bill-row');
    let count = 0;
    rows.forEach(r => {
      let show = true;
      if (status && r.dataset.status !== status) show = false;
      if (shopId && String(r.dataset.shopId) !== shopId) show = false;
      if (month) { const d = r.dataset.due; if (!d || String(new Date(d).getMonth()+1) !== month) show = false; }
      if (year) { const d = r.dataset.due; if (!d || String(new Date(d).getFullYear()) !== year) show = false; }
      r.style.display = show ? '' : 'none';
      if (show) count++;
    });
    const emp = container.querySelector('#tpBillEmpty');
    const lst = container.querySelector('#tpBillList');
    if (emp) emp.style.display = count === 0 ? 'block' : 'none';
    if (lst) lst.style.display = count === 0 ? 'none' : '';
  };

  container.querySelector('#tpBillStatus')?.addEventListener('change', applyFilters);
  container.querySelector('#tpBillShop')?.addEventListener('change', applyFilters);
  container.querySelector('#tpBillMonth')?.addEventListener('change', applyFilters);
  container.querySelector('#tpBillYear')?.addEventListener('input', applyFilters);

  // Global clear function for this container's filters
  window.clearAdminTpBillFilters = function() {
    container.querySelector('#tpBillStatus').value = '';
    container.querySelector('#tpBillShop').value = '';
    container.querySelector('#tpBillMonth').value = '';
    container.querySelector('#tpBillYear').value = '';
    applyFilters();
  };

  applyFilters();
}
function renderUserFinancePanel(d, u){
  const rs = d.rent_summary || {};
  const ds = d.deposit_summary || {};
  const ss = d.shops_summary || {};
  return `
  <div class="user-finance-card">
    <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-bottom:14px;">
      <div>
        <div class="ufc-name">${escapeHtml(u?.name||'Tenant')}</div>
        <div class="ufc-meta">${escapeHtml(u?.mobile||'')}${u?.email?' · '+escapeHtml(u.email):''}</div>
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-primary btn-sm" data-panel-pay="1">Record Payment</button>
        <button class="btn btn-ghost btn-sm" data-panel-deposit="1">Record Deposit</button>
      </div>
    </div>
    <div class="stat-row" style="grid-template-columns:repeat(3,1fr); margin-bottom:14px;">
      <div class="card stat-card"><div class="label">Shops</div><div class="value">${ss.total_shops||0}</div></div>
      <div class="card stat-card accent-green"><div class="label">Monthly Rent</div><div class="value mono" style="font-size:17px;">${currency(rs.total_monthly_rent)}</div></div>
      <div class="card stat-card accent-rust"><div class="label">Pending Rent</div><div class="value mono" style="font-size:17px;">${currency(rs.total_pending_rent)}</div></div>
      <div class="card stat-card"><div class="label">Deposit Required</div><div class="value mono" style="font-size:17px;">${currency(ds.total_deposit_required)}</div></div>
      <div class="card stat-card accent-green"><div class="label">Deposit Paid</div><div class="value mono" style="font-size:17px;">${currency(ds.total_deposit_paid)}</div></div>
      <div class="card stat-card ${ds.remaining_deposit>0?'accent-rust':'accent-green'}"><div class="label">Remaining Deposit</div><div class="value mono" style="font-size:17px;">${currency(ds.remaining_deposit)}</div></div>
    </div>
    ${ss.shops?.length ? `
    <h4 style="font-size:13px; margin:0 0 8px; color:var(--muted); text-transform:uppercase; letter-spacing:.05em;">Assigned Shops</h4>
    <div class="table-wrap" style="margin-bottom:0;">
      <table><thead><tr><th>Shop</th><th>Complex</th><th class="num">Rent/mo</th><th class="num">Deposit</th><th>Agreement Ends</th><th>Days Left</th></tr></thead>
      <tbody>${ss.shops.map(s=>`<tr><td class="mono">${escapeHtml(s.shop_number)}</td><td>${escapeHtml(s.complex_name)}</td><td class="num">${currency(s.shop_rent)}</td><td class="num">${currency(s.shop_deposit)}</td><td>${dateFmt(s.agreement_end_date)}</td><td>${daysLeftHtml(s.agreement_end_date)}</td></tr>`).join('')}</tbody>
      </table>
    </div>` : ''}
    ${d.bills?.length ? `
    <h4 style="font-size:13px; margin:14px 0 8px; color:var(--muted); text-transform:uppercase; letter-spacing:.05em;">Recent Bills</h4>
    <div class="table-wrap">
      <table><thead><tr><th>Shop</th><th>Type</th><th class="num">Amount</th><th class="num">Pending</th><th>Status</th><th>Due</th></tr></thead>
      <tbody>${d.bills.slice(0,8).map(b=>`<tr><td class="mono">${escapeHtml(b.shop_number)}</td><td>${escapeHtml(b.bill_type)}</td><td class="num">${currency(b.amount)}</td><td class="num">${currency(b.pending_amount)}</td><td>${stampHtml(b.status)}</td><td>${dateFmt(b.due_date)}</td></tr>`).join('')}</tbody>
      </table>
    </div>` : ''}
    ${d.payment_history?.length ? `
    <h4 style="font-size:13px; margin:14px 0 8px; color:var(--muted); text-transform:uppercase; letter-spacing:.05em;">Payment History</h4>
    <div class="table-wrap">
      <table><thead><tr><th>Date</th><th>Shop</th><th>Type</th><th class="num">Amount</th><th>Method</th></tr></thead>
      <tbody>${d.payment_history.slice(0,10).map(p=>`<tr><td>${dateFmt(p.payment_date)}</td><td class="mono">${escapeHtml(p.shop_number)}</td><td>${escapeHtml(p.bill_type)}</td><td class="num">${currency(p.amount)}</td><td>${escapeHtml(p.payment_method)}</td></tr>`).join('')}</tbody>
      </table>
    </div>` : ''}
    ${d.deposit_payment_history?.length ? `
    <h4 style="font-size:13px; margin:14px 0 8px; color:var(--muted); text-transform:uppercase; letter-spacing:.05em;">Deposit Payment History</h4>
    <div class="table-wrap">
      <table><thead><tr><th>Date</th><th>Shop</th><th class="num">Amount</th><th>Remarks</th></tr></thead>
      <tbody>${d.deposit_payment_history.map(p=>`<tr><td>${dateFmt(p.payment_date)}</td><td class="mono">${escapeHtml(p.shop_number)}</td><td class="num">${currency(p.amount)}</td><td>${escapeHtml(p.remarks||'—')}</td></tr>`).join('')}</tbody>
      </table>
    </div>` : ''}
  </div>`;
}

async function loadFinanceOverview(){
  const resultsEl = document.getElementById('financeResults');
  const btn = document.getElementById('loadFinanceBtn');
  const orig = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Loading…';
  resultsEl.innerHTML = skeletonHtml();
  try {
    const params = new URLSearchParams();
    const cid = document.getElementById('fiComplex').value;
    const uid = document.getElementById('fiUser').value;
    const mo = document.getElementById('fiMonth').value;
    const yr = document.getElementById('fiYear').value;
    if (cid) params.set('complex_id', cid);
    if (uid) params.set('user_id', uid);
    if (mo) params.set('month', mo);
    if (yr) params.set('year', yr);
    const d = await api(`/api/finance/overview?${params}`);
    const s = d.summary;
    resultsEl.innerHTML = `
      <div class="stat-row" style="margin-bottom:18px;">
        <div class="card stat-card accent-green"><div class="label">Rent collected</div><div class="value mono">${currency(s.total_rent_collected)}</div><div class="sub">of ${currency(s.total_rent_billed)} billed</div></div>
        <div class="card stat-card accent-rust"><div class="label">Rent pending</div><div class="value mono">${currency(s.total_rent_pending)}</div></div>
        <div class="card stat-card"><div class="label">Deposit collected</div><div class="value mono">${currency(s.total_deposit_collected)}</div><div class="sub">of ${currency(s.total_deposit_required)} required</div></div>
        <div class="card stat-card accent-rust"><div class="label">Deposit remaining</div><div class="value mono">${currency(s.total_deposit_remaining)}</div></div>
        <div class="card stat-card"><div class="label">Payments</div><div class="value">${s.payment_count}</div><div class="sub">${s.deposit_payment_count} deposit payments</div></div>
      </div>

      ${d.tenants?.length ? `
      <h3 style="font-size:15.5px; margin:0 0 12px;">Tenant breakdown</h3>
      <div class="table-wrap" style="margin-bottom:18px;">
        <table>
          <thead><tr><th>Tenant</th><th>Complex</th><th>Shops</th><th class="num">Monthly rent</th><th class="num">Rent pending</th><th class="num">Deposit paid</th><th class="num">Deposit remaining</th><th>Last payment</th></tr></thead>
          <tbody>
            ${d.tenants.map(t=>`<tr>
              <td><strong>${escapeHtml(t.user_name)}</strong><div style="font-size:12px; color:var(--muted);">${escapeHtml(t.mobile)}</div></td>
              <td>${escapeHtml(t.complex_name)}</td>
              <td class="mono">${(t.shops||[]).join(', ')}</td>
              <td class="num">${currency(t.monthly_rent)}</td>
              <td class="num">${t.rent_pending > 0 ? `<span style="color:var(--rust); font-weight:700;">${currency(t.rent_pending)}</span>` : `<span style="color:var(--success);">${currency(t.rent_pending)}</span>`}</td>
              <td class="num">${currency(t.deposit_paid)}</td>
              <td class="num">${t.deposit_remaining > 0 ? `<span style="color:var(--rust);">${currency(t.deposit_remaining)}</span>` : '—'}</td>
              <td>${dateFmt(t.last_payment_date)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>` : ''}

      ${d.recent_payments?.length ? `
      <h3 style="font-size:15.5px; margin:0 0 12px;">Recent rent payments</h3>
      <div class="table-wrap" style="margin-bottom:18px;">
        <table><thead><tr><th>Tenant</th><th>Shop</th><th>Type</th><th class="num">Amount</th><th>Method</th><th>Date</th></tr></thead>
        <tbody>${d.recent_payments.map(p=>`<tr><td>${escapeHtml(p.user_name)}</td><td class="mono">${escapeHtml(p.shop_number)}</td><td>${escapeHtml(p.bill_type)}</td><td class="num">${currency(p.amount)}</td><td>${escapeHtml(p.payment_method)}</td><td>${dateFmt(p.payment_date)}</td></tr>`).join('')}</tbody>
        </table>
      </div>` : ''}

      ${d.recent_deposit_payments?.length ? `
      <h3 style="font-size:15.5px; margin:0 0 12px;">Recent deposit payments</h3>
      <div class="table-wrap">
        <table><thead><tr><th>Tenant</th><th>Shop</th><th class="num">Amount</th><th>Date</th><th>Remarks</th></tr></thead>
        <tbody>${d.recent_deposit_payments.map(p=>`<tr><td>${escapeHtml(p.user_name)}</td><td class="mono">${escapeHtml(p.shop_number)}</td><td class="num">${currency(p.amount)}</td><td>${dateFmt(p.payment_date)}</td><td>${escapeHtml(p.remarks||'—')}</td></tr>`).join('')}</tbody>
        </table>
      </div>` : ''}
    `;
  } catch(err){
    resultsEl.innerHTML = errorBannerHtml(err.message);
    document.getElementById('retryBtn')?.addEventListener('click', loadFinanceOverview);
  } finally { btn.disabled=false; btn.innerHTML=orig; }
}
