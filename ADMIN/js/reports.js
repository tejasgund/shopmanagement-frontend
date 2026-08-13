/* ================================================================
   ADMIN/js/reports.js — split from the old ADMIN/script.js
   Contains: REPORTS VIEW — Business Overview, Tenant Statement,
   Summary, Rent Collection, Deposits, Occupancy, and User-wise
   report tabs, plus their chart helpers and PDF export/print/share
   functions (also reused by the Finance section's monthly ledger).
   ================================================================ */
/* ================================================================
   REPORTS VIEW (updated with tabs)
   ================================================================ */
let reportDateRange = { start: null, end: null };

async function reportsView(){
  const complexes = await ensureLoaded('complexes','/api/complex');
  const users = await ensureLoaded('users','/api/user');
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const startVal = reportDateRange.start || monthStart.toISOString().slice(0,10);
  const endVal = reportDateRange.end || today.toISOString().slice(0,10);

  return `
  <div class="path-toggle" id="reportTabToggle" style="margin-bottom:18px;">
    <button class="path-btn active" data-rtab="business-overview">Business Overview</button>
    <button class="path-btn" data-rtab="tenant-statement">Tenant Statement</button>
    <button class="path-btn" data-rtab="summary">Summary</button>
    <button class="path-btn" data-rtab="rent-collection">Rent Collection</button>
    <button class="path-btn" data-rtab="deposit">Deposits</button>
    <button class="path-btn" data-rtab="occupancy">Occupancy</button>
    <button class="path-btn" data-rtab="user-wise">User-wise</button>
  </div>

  <div class="card card-pad" style="margin-bottom:18px;">
    <div style="display:flex; gap:14px; align-items:flex-end; flex-wrap:wrap;">
      <div class="field" style="margin-bottom:0;">
        <label for="repStart">From</label>
        <input type="date" id="repStart" value="${startVal}">
      </div>
      <div class="field" style="margin-bottom:0;">
        <label for="repEnd">To</label>
        <input type="date" id="repEnd" value="${endVal}">
      </div>
      <div class="field" style="margin-bottom:0;">
        <label for="repComplex">Complex</label>
        <select id="repComplex">
          <option value="">All complexes</option>
          ${complexes.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}
        </select>
      </div>
      <div class="field" style="margin-bottom:0;">
        <label for="repUser">Tenant</label>
        <select id="repUser">
          <option value="">All tenants</option>
          ${users.filter(u=>u.role==='tenant').map(u=>`<option value="${u.id}">${escapeHtml(u.name)}</option>`).join('')}
        </select>
      </div>
      <button class="btn btn-primary" id="genReportBtn">Generate report</button>
      <button class="btn btn-ghost" id="exportReportBtn" style="display:none;">Download</button>
    </div>
  </div>
  <div id="reportResults"><div class="empty-state">${emptyIcon()}<h3>No report generated yet</h3><p>Choose a report type tab, set filters, and click Generate.</p></div></div>
  `;
}

function attachReportsHandlers(){
  let _activeTab = 'business-overview';
  document.querySelectorAll('[data-rtab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-rtab]').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      _activeTab = btn.dataset.rtab;
    });
  });
  document.getElementById('genReportBtn').addEventListener('click', () => generateReport(_activeTab));
}

async function generateReport(tab){
  const start = document.getElementById('repStart').value;
  const end = document.getElementById('repEnd').value;
  const complexId = document.getElementById('repComplex').value;
  const userId = document.getElementById('repUser').value;
  reportDateRange = { start, end };
  const resultsEl = document.getElementById('reportResults');
  const btn = document.getElementById('genReportBtn');
  const original = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> Generating…`;
  resultsEl.innerHTML = skeletonHtml();

  try {
    await Promise.all([ensureLoaded('users','/api/user'), ensureLoaded('shops','/api/shop')]);

    if (tab === 'tenant-statement'){
      if (!userId){
        resultsEl.innerHTML = emptyStateHtml('Pick a tenant', 'Select a tenant from the "Tenant" filter above, then click Generate to see their full bill and payment history.', emptyIcon());
        document.getElementById('exportReportBtn').style.display = 'none';
      } else {
        const params = new URLSearchParams();
        params.set('user_id', userId);
        if (start) params.set('start_date', new Date(start).toISOString());
        if (end) params.set('end_date', new Date(new Date(end).setHours(23,59,59)).toISOString());
        const rep = await api(`/api/reports/tenant-statement?${params}`);
        state._lastReportData = { tab, rep, start, end, complexId };
        resultsEl.innerHTML = renderTenantStatementHtml(rep, start, end);
        document.getElementById('exportReportBtn').style.display = 'inline-flex';
        document.getElementById('exportReportBtn').onclick = () => exportReportPdf();
      }

    } else if (tab === 'business-overview'){
      const params = new URLSearchParams();
      if (start) params.set('start_date', new Date(start).toISOString());
      if (end) params.set('end_date', new Date(new Date(end).setHours(23,59,59)).toISOString());
      if (complexId) params.set('complex_id', complexId);
      const rep = await api(`/api/reports/business-overview?${params}`);
      state._lastReportData = { tab, rep, start, end, complexId };
      resultsEl.innerHTML = renderBusinessOverviewHtml(rep, start, end);
      attachBusinessOverviewHandlers(rep);
      document.getElementById('exportReportBtn').style.display = 'inline-flex';
      document.getElementById('exportReportBtn').onclick = () => exportReportPdf();

    } else if (tab === 'summary'){
      const params = new URLSearchParams();
      if (start) params.set('start_date', new Date(start).toISOString());
      if (end) params.set('end_date', new Date(new Date(end).setHours(23,59,59)).toISOString());
      const rep = await api(`/api/reports/summary?${params}`);
      state._lastReport = rep;
      state._lastReportData = { tab, rep, start, end, complexId };
      resultsEl.innerHTML = renderReportHtml(rep, start, end);
      document.getElementById('exportReportBtn').style.display = 'inline-flex';
      document.getElementById('exportReportBtn').onclick = () => exportReportPdf();

    } else if (tab === 'rent-collection'){
      const params = new URLSearchParams();
      if (start) params.set('start_date', new Date(start).toISOString());
      if (end) params.set('end_date', new Date(new Date(end).setHours(23,59,59)).toISOString());
      if (complexId) params.set('complex_id', complexId);
      if (userId) params.set('user_id', userId);
      const rep = await api(`/api/reports/rent-collection?${params}`);
      state._lastReportData = { tab, rep, start, end, complexId };
      const s = rep.summary;
      resultsEl.innerHTML = `
        <div class="stat-row" style="margin-bottom:18px;">
          <div class="card stat-card"><div class="label">Total billed</div><div class="value mono">${currency(s.total_billed)}</div><div class="sub">${s.bills_count} bills</div></div>
          <div class="card stat-card accent-green"><div class="label">Collected</div><div class="value mono">${currency(s.total_collected)}</div><div class="sub">${s.paid_count} paid</div></div>
          <div class="card stat-card accent-rust"><div class="label">Pending</div><div class="value mono">${currency(s.total_pending)}</div><div class="sub">${s.pending_count} pending · ${s.partial_count} partial</div></div>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Bill</th><th>Tenant</th><th>Mobile</th><th>Complex</th><th>Shop</th><th>Type</th><th>Description</th><th class="num">Amount</th><th class="num">Paid</th><th class="num">Pending</th><th>Status</th><th>Bill Date</th><th>Due</th></tr></thead>
            <tbody>
              ${rep.records.map(r=>`<tr>
                <td class="mono">#${r.bill_id}</td>
                <td>${tenantLinkHtml(r.user_id, r.user_name)}</td>
                <td class="mono">${escapeHtml(r.mobile)}</td>
                <td>${escapeHtml(r.complex_name)}</td>
                <td class="mono">${escapeHtml(r.shop_number)}</td>
                <td>${escapeHtml(r.bill_type)}</td>
                <td>${escapeHtml(r.description || '—')}</td>
                <td class="num">${currency(r.amount)}</td>
                <td class="num">${currency(r.paid_amount)}</td>
                <td class="num">${r.pending_amount > 0 ? `<span style="color:var(--rust);font-weight:700;">${currency(r.pending_amount)}</span>` : currency(r.pending_amount)}</td>
                <td>${stampHtml(r.status)}</td>
                <td>${dateFmt(r.bill_date)}</td>
                <td>${dateFmt(r.due_date)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      `;
      document.getElementById('exportReportBtn').style.display = 'inline-flex';
      document.getElementById('exportReportBtn').onclick = () => exportReportPdf();

    } else if (tab === 'deposit'){
      const params = new URLSearchParams();
      if (complexId) params.set('complex_id', complexId);
      if (userId) params.set('user_id', userId);
      const rep = await api(`/api/reports/deposit?${params}`);
      state._lastReportData = { tab, rep, start, end, complexId };
      const s = rep.summary;
      const statusColor = (st) => st==='full'?'var(--success)':st==='partial'?'var(--partial)':'var(--rust)';
      resultsEl.innerHTML = `
        <div class="stat-row" style="margin-bottom:18px;">
          <div class="card stat-card"><div class="label">Deposit required</div><div class="value mono">${currency(s.total_deposit_required)}</div></div>
          <div class="card stat-card accent-green"><div class="label">Collected</div><div class="value mono">${currency(s.total_deposit_collected)}</div><div class="sub">${s.tenants_with_full_deposit} tenants fully paid</div></div>
          <button type="button" id="depRemainingCard" data-filtered="0" class="card stat-card accent-rust glance-card" style="text-align:left; cursor:pointer;" title="Click to show only tenants with a balance owing"><div class="label">Remaining</div><div class="value mono">${currency(s.total_deposit_remaining)}</div><div class="sub">${s.tenants_with_partial_deposit} partial · ${s.tenants_with_no_deposit} none</div></button>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Tenant</th><th>Mobile</th><th>Complex</th><th>Shop</th><th class="num">Required</th><th class="num">Paid</th><th class="num">Remaining</th><th>Status</th><th>Last payment</th></tr></thead>
            <tbody id="depositRecordsBody">
              ${rep.records.map(r=>`<tr data-remaining="${r.deposit_remaining > 0 ? '1' : '0'}">
                <td>${tenantLinkHtml(r.user_id, r.user_name)}</td>
                <td class="mono">${escapeHtml(r.mobile)}</td>
                <td>${escapeHtml(r.complex_name)}</td>
                <td class="mono">${escapeHtml(r.shop_number)}</td>
                <td class="num">${currency(r.deposit_required)}</td>
                <td class="num">${currency(r.deposit_paid)}</td>
                <td class="num">${r.deposit_remaining > 0 ? `<span style="color:var(--rust);font-weight:700;">${currency(r.deposit_remaining)}</span>` : '—'}</td>
                <td><span style="color:${statusColor(r.deposit_status)}; font-weight:700; font-size:12px; text-transform:uppercase;">${r.deposit_status}</span></td>
                <td>${dateFmt(r.last_deposit_date)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      `;
      attachDepositReportHandlers();
      document.getElementById('exportReportBtn').style.display = 'inline-flex';
      document.getElementById('exportReportBtn').onclick = () => exportReportPdf();

    } else if (tab === 'occupancy'){
      const params = new URLSearchParams();
      if (complexId) params.set('complex_id', complexId);
      const rep = await api(`/api/reports/occupancy?${params}`);
      state._lastReportData = { tab, rep, start, end, complexId };
      const s = rep.summary;
      resultsEl.innerHTML = `
        <div class="stat-row" style="margin-bottom:18px;">
          <button type="button" data-occ-filter="all" class="card stat-card glance-card" style="text-align:left; cursor:pointer;"><div class="label">Total shops</div><div class="value">${s.total_shops}</div></button>
          <button type="button" data-occ-filter="occupied" class="card stat-card accent-green glance-card" style="text-align:left; cursor:pointer;"><div class="label">Occupied</div><div class="value">${s.occupied}</div></button>
          <button type="button" data-occ-filter="available" class="card stat-card glance-card" style="text-align:left; cursor:pointer;"><div class="label">Available</div><div class="value">${s.available}</div></button>
          <div class="card stat-card"><div class="label">Occupancy rate</div><div class="value">${s.occupancy_rate_percent}%</div></div>
        </div>
        ${rep.by_complex?.length ? `
        <h3 style="font-size:15.5px; margin:0 0 12px;">By complex</h3>
        <div class="table-wrap" style="margin-bottom:18px;">
          <table><thead><tr><th>Complex</th><th class="num">Total</th><th class="num">Occupied</th><th class="num">Available</th><th class="num">Rate</th><th class="num">Rent potential</th><th class="num">Rent actual</th></tr></thead>
          <tbody>${rep.by_complex.map(c=>`<tr>
            <td>${escapeHtml(c.complex_name)}</td>
            <td class="num">${c.total_shops}</td>
            <td class="num">${c.occupied}</td>
            <td class="num">${c.available}</td>
            <td class="num">${c.occupancy_rate_percent}%</td>
            <td class="num">${currency(c.monthly_rent_potential)}</td>
            <td class="num">${currency(c.monthly_rent_actual)}</td>
          </tr>`).join('')}</tbody>
          </table>
        </div>` : ''}
        <h3 style="font-size:15.5px; margin:0 0 12px;" id="occShopDetailsHeading">Shop details</h3>
        <div class="table-wrap">
          <table><thead><tr><th>Shop</th><th>Complex</th><th class="num">Area (sqft)</th><th class="num">Rent</th><th>Status</th><th>Tenant</th></tr></thead>
          <tbody id="occShopDetailsBody">${rep.shop_details.map(s=>`<tr data-shop-status="${s.status}">
            <td class="mono"><strong>${escapeHtml(s.shop_number)}</strong></td>
            <td>${escapeHtml(s.complex_name)}</td>
            <td class="num">${Number(s.area_sqft).toLocaleString('en-IN')}</td>
            <td class="num">${currency(s.shop_rent)}</td>
            <td><span class="pill ${s.status}"><span class="pill-dot"></span>${s.status}</span></td>
            <td>${s.tenant_name ? `${tenantLinkHtml(s.tenant_id, s.tenant_name)} <span style="color:var(--muted); font-size:12px;">${escapeHtml(s.tenant_mobile||'')}</span>` : '<span style="color:var(--muted);">—</span>'}</td>
          </tr>`).join('')}</tbody>
          </table>
        </div>
      `;
      attachOccupancyHandlers();
      document.getElementById('exportReportBtn').style.display = 'inline-flex';
      document.getElementById('exportReportBtn').onclick = () => exportReportPdf();

    } else if (tab === 'user-wise'){
      const params = new URLSearchParams();
      if (start) params.set('start_date', new Date(start).toISOString());
      if (end) params.set('end_date', new Date(new Date(end).setHours(23,59,59)).toISOString());
      if (complexId) params.set('complex_id', complexId);
      const recs = await api(`/api/reports/user-wise?${params}`);
      state._lastReportData = { tab, rep: recs, start, end, complexId };
      resultsEl.innerHTML = `
        <div class="table-wrap">
          <table>
            <thead><tr><th>Tenant</th><th>Shops</th><th class="num">Billed</th><th class="num">Collected</th><th class="num">Pending</th><th class="num">Deposit paid</th><th class="num">Deposit rem.</th><th>Payments</th><th>Last payment</th></tr></thead>
            <tbody>
              ${recs.map(r=>`<tr>
                <td>${tenantLinkHtml(r.user_id, r.user_name)}<div style="font-size:12px; color:var(--muted);">${escapeHtml(r.mobile)}</div></td>
                <td class="mono" style="font-size:12.5px;">${r.shops?.map(s=>escapeHtml(s.shop_number)).join(', ')||'—'}</td>
                <td class="num">${currency(r.total_billed)}</td>
                <td class="num">${currency(r.total_collected)}</td>
                <td class="num">${r.total_pending > 0 ? `<span style="color:var(--rust);font-weight:700;">${currency(r.total_pending)}</span>` : '—'}</td>
                <td class="num">${currency(r.deposit_paid)}</td>
                <td class="num">${r.deposit_remaining > 0 ? `<span style="color:var(--rust);">${currency(r.deposit_remaining)}</span>` : '—'}</td>
                <td class="num">${r.payment_count}</td>
                <td>${dateFmt(r.last_payment_date)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      `;
      document.getElementById('exportReportBtn').style.display = 'inline-flex';
      document.getElementById('exportReportBtn').onclick = () => exportReportPdf();
    }
  } catch (err) {
    resultsEl.innerHTML = errorBannerHtml(err.message);
    document.getElementById('retryBtn')?.addEventListener('click', () => generateReport(tab));
  } finally {
    btn.disabled = false; btn.innerHTML = original;
  }
}

function renderReportHtml(rep, start, end){
  const occ = rep.occupancy, col = rep.collections, due = rep.outstanding_dues;
  const occupancyRate = occ.total_shops > 0 ? Math.round((occ.occupied / occ.total_shops) * 100) : 0;
  const users = state.cache.users || [];
  const shops = state.cache.shops || [];
  const userName = (id) => users.find(u=>u.id===id)?.name || `#${id}`;
  const shopNum = (id) => shops.find(s=>s.id===id)?.shop_number || `#${id}`;

  return `
  <div class="card-pad" style="padding:0 0 14px;"><div class="crumb">Report period: ${start ? dateFmt(start) : 'all time'} — ${end ? dateFmt(end) : 'today'}</div></div>

  <div class="stat-row">
    <div class="card stat-card"><div class="label">Occupancy</div><div class="value">${occupancyRate}%</div><div class="sub">${occ.occupied}/${occ.total_shops} shops occupied</div></div>
    <div class="card stat-card accent-green"><div class="label">Collected</div><div class="value mono">${currency(col.total_collected_in_range)}</div><div class="sub">${col.payments_received_count} payments</div></div>
    <div class="card stat-card"><div class="label">Billed</div><div class="value mono">${currency(col.total_billed_in_range)}</div><div class="sub">${col.bills_raised_count} bills raised</div></div>
    <div class="card stat-card accent-rust"><div class="label">Outstanding (all-time)</div><div class="value mono">${currency(due.total_outstanding)}</div><div class="sub">${due.bill_count} unpaid bills</div></div>
  </div>

  <div class="card" style="margin-bottom:18px;">
    <div class="card-pad" style="padding-bottom:0;"><h3 style="font-size:15.5px;">Shop occupancy breakdown</h3></div>
    <div class="card-pad" style="padding-top:14px; display:flex; gap:18px; flex-wrap:wrap;">
      <span class="pill occupied"><span class="pill-dot"></span>${occ.occupied} occupied</span>
      <span class="pill available"><span class="pill-dot"></span>${occ.available} available</span>
      ${occ.maintenance > 0 ? `<span class="pill" style="background:var(--partial-soft); color:var(--partial);"><span class="pill-dot" style="background:var(--partial);"></span>${occ.maintenance} maintenance</span>` : ''}
    </div>
  </div>

  ${Object.keys(col.collected_by_method).length > 0 ? `
  <div class="card" style="margin-bottom:18px;">
    <div class="card-pad" style="padding-bottom:0;"><h3 style="font-size:15.5px;">Collections by payment method</h3></div>
    <div class="table-wrap" style="border:none; border-radius:0; box-shadow:none; margin-top:10px;">
      <table><tbody>
        ${Object.entries(col.collected_by_method).map(([method,amt]) => `<tr><td>${escapeHtml(method)}</td><td class="num">${currency(amt)}</td></tr>`).join('')}
      </tbody></table>
    </div>
  </div>` : ''}

  <div class="card">
    <div class="card-pad" style="padding-bottom:0;"><h3 style="font-size:15.5px;">Outstanding dues</h3></div>
    ${due.bills.length === 0 ? emptyStateHtml('No outstanding dues', 'All bills are fully paid.', emptyIcon()) : `
    <div class="table-wrap" style="border:none; border-radius:0; box-shadow:none; margin-top:10px;">
      <table>
        <thead><tr><th>Bill</th><th>Tenant</th><th>Shop</th><th>Type</th><th>Description</th><th class="num">Pending</th><th>Status</th><th>Bill Date</th><th>Due</th></tr></thead>
        <tbody>
          ${due.bills.map(b => `<tr>
            <td class="mono">#${b.bill_id}</td>
            <td>${escapeHtml(userName(b.user_id))}</td>
            <td class="mono">${escapeHtml(shopNum(b.shop_id))}</td>
            <td>${escapeHtml(b.bill_type)}</td>
            <td>${escapeHtml(b.description || '—')}</td>
            <td class="num">${currency(b.pending_amount)}</td>
            <td>${stampHtml(b.status)}</td>
            <td>${dateFmt(b.bill_date)}</td>
            <td>${dateFmt(b.due_date)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`}
  </div>`;
}

function downloadReportText(rep, start, end){
  const occ = rep.occupancy, col = rep.collections, due = rep.outstanding_dues;
  const users = state.cache.users || [];
  const shops = state.cache.shops || [];
  const userName = (id) => users.find(u=>u.id===id)?.name || `#${id}`;
  const shopNum = (id) => shops.find(s=>s.id===id)?.shop_number || `#${id}`;

  const lines = [
    'TENANT MANAGEMENT — BUSINESS REPORT',
    `Period: ${start ? dateFmt(start) : 'all time'} to ${end ? dateFmt(end) : 'today'}`,
    `Generated: ${new Date().toLocaleString('en-IN')}`,
    '',
    '--- OCCUPANCY ---',
    `Total shops: ${occ.total_shops}`,
    `Occupied: ${occ.occupied}`,
    `Available: ${occ.available}`,
    `Maintenance: ${occ.maintenance}`,
    '',
    '--- COLLECTIONS (in range) ---',
    `Total billed: ${currency(col.total_billed_in_range)}`,
    `Total collected: ${currency(col.total_collected_in_range)}`,
    `Bills raised: ${col.bills_raised_count}`,
    `Payments received: ${col.payments_received_count}`,
    ...Object.entries(col.collected_by_method).map(([m,a]) => `  ${m}: ${currency(a)}`),
    '',
    '--- OUTSTANDING DUES (all-time) ---',
    `Total outstanding: ${currency(due.total_outstanding)}`,
    `Unpaid bills: ${due.bill_count}`,
    ...due.bills.map(b => `  #${b.bill_id} | ${userName(b.user_id)} | Shop ${shopNum(b.shop_id)} | ${b.bill_type} | ${currency(b.pending_amount)} pending | due ${dateFmt(b.due_date)}`),
  ];

  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `business-report-${start||'all'}-to-${end||'today'}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ---------- Business Overview tab: renderer + SVG charts ---------- */

function svgBarChart({width=560, height=200, bars, valueFormatter=(v)=>v, barColorFn=null, defaultColor='var(--ink)'}){
  const max = Math.max(1, ...bars.map(b=>b.value));
  const padL = 46, padB = 28, padT = 10, padR = 10;
  const plotW = width - padL - padR, plotH = height - padT - padB;
  const bw = plotW / bars.length;
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map(f => {
    const y = padT + plotH - f*plotH;
    const val = Math.round(max*f);
    return `<line x1="${padL}" y1="${y}" x2="${width-padR}" y2="${y}" stroke="var(--line)" stroke-width="1"/>
            <text x="${padL-8}" y="${y+4}" font-size="10" fill="var(--muted)" text-anchor="end">${valueFormatter(val)}</text>`;
  }).join('');
  const barsHtml = bars.map((b,i)=>{
    const bh = (b.value/max) * plotH;
    const x = padL + i*bw + bw*0.2;
    const y = padT + plotH - bh;
    const w = bw*0.6;
    const color = barColorFn ? barColorFn(b) : defaultColor;
    return `<rect x="${x}" y="${y}" width="${w}" height="${Math.max(bh,1)}" fill="${color}" rx="2"/>
            <text x="${x+w/2}" y="${padT+plotH+18}" font-size="10.5" fill="var(--muted)" text-anchor="middle">${escapeHtml(b.label)}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" style="overflow:visible;">${gridLines}${barsHtml}</svg>`;
}

function svgGroupedTrendChart({width=640, height=220, months, valueFormatter=(v)=>v}){
  const max = Math.max(1, ...months.flatMap(m=>[m.billed, m.collected]));
  const padL = 52, padB = 28, padT = 12, padR = 10;
  const plotW = width - padL - padR, plotH = height - padT - padB;
  const groupW = plotW / months.length;
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map(f => {
    const y = padT + plotH - f*plotH;
    const val = Math.round(max*f);
    return `<line x1="${padL}" y1="${y}" x2="${width-padR}" y2="${y}" stroke="var(--line)" stroke-width="1"/>
            <text x="${padL-8}" y="${y+4}" font-size="10" fill="var(--muted)" text-anchor="end">${valueFormatter(val)}</text>`;
  }).join('');
  const bars = months.map((m,i)=>{
    const gx = padL + i*groupW;
    const bw = groupW*0.32;
    const bhBilled = (m.billed/max)*plotH, bhCollected = (m.collected/max)*plotH;
    const x1 = gx + groupW*0.14, x2 = gx + groupW*0.54;
    return `
      <rect x="${x1}" y="${padT+plotH-bhBilled}" width="${bw}" height="${Math.max(bhBilled,1)}" fill="var(--muted)" opacity="0.55" rx="2"/>
      <rect x="${x2}" y="${padT+plotH-bhCollected}" width="${bw}" height="${Math.max(bhCollected,1)}" fill="var(--success, #3a7d5c)" rx="2"/>
      <text x="${gx+groupW/2}" y="${padT+plotH+18}" font-size="10.5" fill="var(--muted)" text-anchor="middle">${escapeHtml(m.month)}</text>`;
  }).join('');
  return `
    <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" style="overflow:visible;">${gridLines}${bars}</svg>
    <div style="display:flex; gap:16px; margin-top:8px; font-size:12px; color:var(--muted);">
      <span><span style="display:inline-block; width:10px; height:10px; background:var(--muted); opacity:0.55; border-radius:2px; margin-right:5px;"></span>Billed</span>
      <span><span style="display:inline-block; width:10px; height:10px; background:var(--success, #3a7d5c); border-radius:2px; margin-right:5px;"></span>Collected</span>
    </div>`;
}

function renderBusinessOverviewHtml(rep, start, end){
  const ce = rep.collection_efficiency, aging = rep.aging, ts = rep.today_snapshot;
  const bucketLabels = { current: 'Not due', '0_30': '0–30 days', '31_60': '31–60 days', '61_90': '61–90 days', '90_plus': '90+ days' };
  const agingBars = Object.entries(aging.buckets).map(([k,v]) => ({ label: bucketLabels[k]||k, value: v }));
  const waLink = (mobile, name, amount) => {
    if (!mobile) return null;
    const digits = mobile.replace(/\D/g,'');
    const msg = encodeURIComponent(`Hi ${name}, this is a reminder that ${currency(amount)} is pending on your account. Please clear it at your earliest convenience. Thank you.`);
    return `https://wa.me/${digits.length===10?'91'+digits:digits}?text=${msg}`;
  };

  return `
  <div class="card card-pad" style="margin-bottom:18px; background:var(--paper-raised);">
    <h3 style="font-size:13.5px; margin:0 0 12px; text-transform:uppercase; letter-spacing:0.03em; color:var(--muted);">Today's snapshot — daily ops</h3>
    <div style="display:flex; gap:24px; flex-wrap:wrap;">
      <div><div style="font-size:11px; color:var(--muted);">Collected today</div><div style="font-size:19px; font-weight:700;" class="mono">${currency(ts.collections_today)}</div><div style="font-size:11px; color:var(--muted);">${ts.payments_today_count} payment(s)</div></div>
      <div><div style="font-size:11px; color:var(--muted);">Due today</div><div style="font-size:19px; font-weight:700;" class="mono">${currency(ts.due_today_amount)}</div><div style="font-size:11px; color:var(--muted);">${ts.due_today_count} bill(s)</div></div>
      <div><div style="font-size:11px; color:var(--muted);">Due this week</div><div style="font-size:19px; font-weight:700;" class="mono">${currency(ts.due_this_week_amount)}</div><div style="font-size:11px; color:var(--muted);">${ts.due_this_week_count} bill(s)</div></div>
      <div><div style="font-size:11px; color:var(--muted);">Overdue (all)</div><div style="font-size:19px; font-weight:700; color:var(--rust);" class="mono">${currency(ts.overdue_amount)}</div><div style="font-size:11px; color:var(--muted);">${ts.overdue_count} bill(s)</div></div>
    </div>
  </div>

  <div class="card-pad" style="padding:0 0 14px;"><div class="crumb">Report period: ${start ? dateFmt(start) : 'all time'} — ${end ? dateFmt(end) : 'today'}</div></div>

  <div class="stat-row" style="margin-bottom:18px;">
    <div class="card stat-card accent-green"><div class="label">Collection efficiency</div><div class="value">${ce.collection_efficiency_percent}%</div><div class="sub">${currency(ce.total_collected_in_range)} of ${currency(ce.total_billed_in_range)} billed</div></div>
    <button type="button" id="boOutstandingCard" class="card stat-card accent-rust glance-card" style="text-align:left; cursor:pointer;" title="View these bills in Billing"><div class="label">Total outstanding</div><div class="value mono">${currency(aging.total_outstanding)}</div><div class="sub">across all unpaid bills</div></button>
    <button type="button" id="boOverdue90Card" class="card stat-card glance-card" style="text-align:left; cursor:pointer;" title="View overdue bills in Billing"><div class="label">90+ days overdue</div><div class="value mono">${currency(aging.buckets['90_plus'])}</div><div class="sub">${aging.bucket_counts['90_plus']} bill(s) — highest risk</div></button>
    ${rep.top_defaulters[0] ? `
    <button type="button" id="boTopDefaulterCard" class="card stat-card glance-card" style="text-align:left; cursor:pointer;" title="Open ${escapeHtml(rep.top_defaulters[0].user_name)}'s statement"><div class="label">Top defaulter</div><div class="value" style="font-size:16px;">${escapeHtml(rep.top_defaulters[0].user_name)}</div><div class="sub">${currency(rep.top_defaulters[0].total_pending)} pending</div></button>
    ` : `
    <div class="card stat-card"><div class="label">Top defaulter</div><div class="value" style="font-size:16px;">—</div><div class="sub">no outstanding dues</div></div>
    `}
  </div>

  <div class="card" style="margin-bottom:18px;">
    <div class="card-pad" style="padding-bottom:0;"><h3 style="font-size:15.5px;">6-month collection trend</h3></div>
    <div class="card-pad" style="padding-top:14px;">${svgGroupedTrendChart({months: rep.monthly_trend, valueFormatter: v=>'₹'+(v>=1000? Math.round(v/1000)+'k' : v)})}</div>
  </div>

  <div class="card" style="margin-bottom:18px;">
    <div class="card-pad" style="padding-bottom:0;"><h3 style="font-size:15.5px;">Overdue aging (outstanding dues by age)</h3></div>
    <div class="card-pad" style="padding-top:14px;">${svgBarChart({bars: agingBars, valueFormatter: v=>'₹'+(v>=1000? Math.round(v/1000)+'k' : v), barColorFn: b => b.label==='90+ days' ? 'var(--rust)' : (b.label==='Not due' ? 'var(--success, #3a7d5c)' : 'var(--partial, #b8863b)')})}</div>
  </div>

  <div class="card" style="margin-bottom:18px;">
    <div class="card-pad" style="padding-bottom:0;"><h3 style="font-size:15.5px;">Complex-wise performance</h3><p style="font-size:12.5px; color:var(--muted); margin:4px 0 0;">Sorted by collection rate, lowest first — needs attention.</p></div>
    <div class="table-wrap" style="border:none; border-radius:0; box-shadow:none; margin-top:10px;">
      <table>
        <thead><tr><th>Complex</th><th class="num">Shops</th><th class="num">Occupancy</th><th class="num">Billed</th><th class="num">Collected</th><th class="num">Collection rate</th></tr></thead>
        <tbody>
          ${rep.complex_performance.map(c=>`<tr>
            <td>${escapeHtml(c.complex_name||'Unassigned')}</td>
            <td class="num">${c.total_shops}</td>
            <td class="num">${c.occupancy_rate_percent}%</td>
            <td class="num">${currency(c.billed)}</td>
            <td class="num">${currency(c.collected)}</td>
            <td class="num">${c.collection_rate_percent < 70 ? `<span style="color:var(--rust);font-weight:700;">${c.collection_rate_percent}%</span>` : c.collection_rate_percent+'%'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>

  <div class="card">
    <div class="card-pad" style="padding-bottom:0; display:flex; align-items:flex-start; justify-content:space-between; gap:10px; flex-wrap:wrap;">
      <div><h3 style="font-size:15.5px;">Top defaulters</h3><p style="font-size:12.5px; color:var(--muted); margin:4px 0 0;">Highest pending amounts, current unpaid bills — top 10.</p></div>
      ${rep.top_defaulters.length > 0 ? `<button type="button" id="remindSelectedBtn" class="btn btn-ghost btn-sm" disabled>Remind selected (0)</button>` : ''}
    </div>
    ${rep.top_defaulters.length === 0 ? emptyStateHtml('No defaulters', 'Every bill is fully paid — great job.', emptyIcon()) : `
    <div class="table-wrap" style="border:none; border-radius:0; box-shadow:none; margin-top:10px;">
      <table>
        <thead><tr><th style="width:30px;">${rep.top_defaulters.some(d=>waLink(d.mobile,d.user_name,d.total_pending)) ? '<input type="checkbox" id="defaulterSelectAll">' : ''}</th><th>Tenant</th><th>Mobile</th><th class="num">Total pending</th><th>Oldest due</th><th></th></tr></thead>
        <tbody>
          ${rep.top_defaulters.map(d=>{
            const link = waLink(d.mobile, d.user_name, d.total_pending);
            return `<tr>
            <td>${link ? `<input type="checkbox" class="defaulter-check" data-name="${escapeHtml(d.user_name||'')}" data-mobile="${escapeHtml(d.mobile||'')}" data-amount="${d.total_pending}">` : ''}</td>
            <td>${d.user_id ? `<a href="#" data-defaulter-user="${d.user_id}" data-defaulter-name="${escapeHtml(d.user_name||'')}" style="color:var(--green-deep); font-weight:700; text-decoration:none;">${escapeHtml(d.user_name||'—')}</a>` : `<strong>${escapeHtml(d.user_name||'—')}</strong>`}</td>
            <td class="mono">${escapeHtml(d.mobile||'—')}</td>
            <td class="num"><span style="color:var(--rust);font-weight:700;">${currency(d.total_pending)}</span></td>
            <td>${dateFmt(d.oldest_due_date)}</td>
            <td>${link ? `<a href="${link}" target="_blank" rel="noopener" style="font-size:12px; color:var(--success,#3a7d5c); font-weight:600; text-decoration:none; white-space:nowrap;">Remind ↗</a>` : ''}</td>
          </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`}
  </div>`;
}

function attachBusinessOverviewHandlers(rep){
  document.getElementById('boOutstandingCard')?.addEventListener('click', () => {
    pendingBillsViewFilter = 'outstanding';
    navigateTo('billing');
  });
  document.getElementById('boOverdue90Card')?.addEventListener('click', () => {
    pendingBillsViewFilter = 'overdue';
    navigateTo('billing');
  });
  document.getElementById('boTopDefaulterCard')?.addEventListener('click', () => {
    const d = rep.top_defaulters[0];
    if (d && d.user_id) openTenantFullStatementModal(d.user_id, d.user_name);
  });
  document.querySelectorAll('[data-defaulter-user]').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      openTenantFullStatementModal(Number(a.dataset.defaulterUser), a.dataset.defaulterName);
    });
  });

  const checkboxes = () => document.querySelectorAll('.defaulter-check');
  const updateRemindBtn = () => {
    const btn = document.getElementById('remindSelectedBtn');
    if (!btn) return;
    const n = document.querySelectorAll('.defaulter-check:checked').length;
    btn.textContent = `Remind selected (${n})`;
    btn.disabled = n === 0;
  };
  document.getElementById('defaulterSelectAll')?.addEventListener('change', (e) => {
    checkboxes().forEach(cb => { cb.checked = e.target.checked; });
    updateRemindBtn();
  });
  checkboxes().forEach(cb => cb.addEventListener('change', updateRemindBtn));
  document.getElementById('remindSelectedBtn')?.addEventListener('click', () => {
    const selected = [...document.querySelectorAll('.defaulter-check:checked')].map(cb => ({
      name: cb.dataset.name, mobile: cb.dataset.mobile, amount: Number(cb.dataset.amount),
    }));
    if (selected.length) openReminderQueueModal(selected);
  });
}

/* ---- Bulk reminder queue: steps through selected defaulters one at a time,
   opening a pre-filled WhatsApp chat for each (WhatsApp itself still requires
   a manual Send click — this just removes the hunting between tenants). ---- */
function openReminderQueueModal(entries){
  let idx = 0;
  let openedCount = 0;

  const waLinkFor = (e) => {
    const digits = (e.mobile || '').replace(/\D/g,'');
    const msg = encodeURIComponent(`Hi ${e.name}, this is a reminder that ${currency(e.amount)} is pending on your account. Please clear it at your earliest convenience. Thank you.`);
    return `https://wa.me/${digits.length===10?'91'+digits:digits}?text=${msg}`;
  };

  const renderStep = () => {
    const e = entries[idx];
    document.getElementById('modalBody').innerHTML = `
      <div style="text-align:center; padding:10px 0 4px;">
        <div style="font-size:12px; color:var(--muted); font-weight:600; text-transform:uppercase; letter-spacing:.04em; margin-bottom:14px;">Reminder ${idx+1} of ${entries.length} · ${openedCount} sent so far</div>
        <div style="font-size:18px; font-weight:700; margin-bottom:4px;">${escapeHtml(e.name)}</div>
        <div class="mono" style="color:var(--muted); margin-bottom:10px;">${escapeHtml(e.mobile)}</div>
        <div class="mono" style="font-size:20px; font-weight:700; color:var(--rust); margin-bottom:18px;">${currency(e.amount)} pending</div>
        <button type="button" class="btn btn-primary btn-lg btn-block" id="openWaBtn">Open WhatsApp &amp; next →</button>
        <button type="button" class="btn btn-ghost btn-sm btn-block" id="skipBtn" style="margin-top:8px;">Skip this tenant</button>
      </div>
    `;
    document.getElementById('openWaBtn').addEventListener('click', () => {
      window.open(waLinkFor(e), '_blank', 'noopener');
      openedCount++;
      advance();
    });
    document.getElementById('skipBtn').addEventListener('click', advance);
  };

  const advance = () => {
    idx++;
    if (idx >= entries.length){
      document.getElementById('modalBody').innerHTML = `
        <div style="text-align:center; padding:24px 0;">
          <div style="font-size:17px; font-weight:700; margin-bottom:6px;">All done</div>
          <div style="color:var(--muted); font-size:13.5px;">Opened WhatsApp for ${openedCount} of ${entries.length} tenant(s).</div>
        </div>`;
      document.getElementById('modalFoot').innerHTML = `<button class="btn btn-primary" id="closeQueueBtn">Close</button>`;
      document.getElementById('closeQueueBtn').addEventListener('click', closeModal);
      return;
    }
    renderStep();
  };

  openModal(`Send reminders`, '', `<button class="btn btn-ghost" id="cancelQueueBtn">Close</button>`);
  document.getElementById('cancelQueueBtn').addEventListener('click', closeModal);
  renderStep();
}

/* ---- Occupancy tab: Total/Occupied/Available cards filter the shop-details table below ---- */
function attachOccupancyHandlers(){
  const rows = () => document.querySelectorAll('#occShopDetailsBody tr[data-shop-status]');
  const btns = () => document.querySelectorAll('[data-occ-filter]');
  const setActive = (activeBtn) => {
    btns().forEach(b => { b.style.borderColor = ''; b.style.boxShadow = ''; });
    if (activeBtn) { activeBtn.style.borderColor = 'var(--green)'; activeBtn.style.boxShadow = '0 0 0 2px rgba(47,111,79,0.15)'; }
  };
  btns().forEach(btn => {
    btn.addEventListener('click', () => {
      const filter = btn.dataset.occFilter;
      rows().forEach(tr => { tr.style.display = (filter === 'all' || tr.dataset.shopStatus === filter) ? '' : 'none'; });
      setActive(filter === 'all' ? null : btn);
      document.getElementById('occShopDetailsHeading').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

/* ---- Deposits tab: "Remaining" card filters the deposit table below to balances owing ---- */
function attachDepositReportHandlers(){
  const rows = () => document.querySelectorAll('#depositRecordsBody tr[data-remaining]');
  document.getElementById('depRemainingCard')?.addEventListener('click', function(){
    const showingOnlyRemaining = this.dataset.filtered === '1';
    rows().forEach(tr => { tr.style.display = (showingOnlyRemaining || tr.dataset.remaining === '1') ? '' : 'none'; });
    this.dataset.filtered = showingOnlyRemaining ? '0' : '1';
    this.style.borderColor = showingOnlyRemaining ? '' : 'var(--green)';
    this.style.boxShadow = showingOnlyRemaining ? '' : '0 0 0 2px rgba(47,111,79,0.15)';
  });
}

/* ---------- Tenant Statement tab: full bill+payment ledger for one tenant ---------- */

function renderTenantStatementHtml(rep, start, end){
  const s = rep.summary, u = rep.user;
  const allPayments = rep.ledger.flatMap(b => b.payments.map(p => ({...p, bill_type: b.bill_type, bill_id: b.bill_id})));

  return `
  <div class="card card-pad" style="margin-bottom:18px; display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px;">
    <div>
      <h3 style="font-size:16.5px; margin:0 0 4px;">${escapeHtml(u.name)}</h3>
      <div style="font-size:12.5px; color:var(--muted);">${escapeHtml(u.mobile||'—')} ${u.email ? '· '+escapeHtml(u.email) : ''}</div>
    </div>
    <div class="crumb">Period: ${start ? dateFmt(start) : 'all time'} — ${end ? dateFmt(end) : 'today'}</div>
  </div>

  <div class="stat-row" style="margin-bottom:18px;">
    <div class="card stat-card"><div class="label">Total billed</div><div class="value mono">${currency(s.total_billed)}</div><div class="sub">${s.bills_count} bills</div></div>
    <div class="card stat-card accent-green"><div class="label">Total paid</div><div class="value mono">${currency(s.total_paid)}</div><div class="sub">${s.paid_count} fully paid</div></div>
    <div class="card stat-card accent-rust"><div class="label">Pending</div><div class="value mono">${currency(s.total_pending)}</div><div class="sub">${s.pending_count} unpaid/partial</div></div>
  </div>

  <div class="card" style="margin-bottom:18px;">
    <div class="card-pad" style="padding-bottom:0;"><h3 style="font-size:15.5px;">Bill history</h3><p style="font-size:12.5px; color:var(--muted); margin:4px 0 0;">Sorted oldest to newest by bill date — scan month by month.</p></div>
    ${rep.ledger.length === 0 ? emptyStateHtml('No bills yet', 'This tenant has no bills in the selected period.', emptyIcon()) : `
    <div class="table-wrap" style="border:none; border-radius:0; box-shadow:none; margin-top:10px;">
      <table>
        <thead><tr><th>Month</th><th>Bill</th><th>Type</th><th>Description</th><th>Shop</th><th>Bill Date</th><th>Due</th><th class="num">Amount</th><th class="num">Paid</th><th class="num">Pending</th><th>Status</th></tr></thead>
        <tbody>
          ${rep.ledger.map(b => `<tr>
            <td>${escapeHtml(b.bill_month||'—')}</td>
            <td class="mono">#${b.bill_id}</td>
            <td>${escapeHtml(b.bill_type)}</td>
            <td>${escapeHtml(b.description || '—')}</td>
            <td class="mono">${escapeHtml(b.shop_number||'—')}</td>
            <td>${dateFmt(b.bill_date)}</td>
            <td>${dateFmt(b.due_date)}</td>
            <td class="num">${currency(b.amount)}</td>
            <td class="num">${currency(b.paid_amount)}</td>
            <td class="num">${b.pending_amount > 0 ? `<span style="color:var(--rust);font-weight:700;">${currency(b.pending_amount)}</span>` : '—'}</td>
            <td>${stampHtml(b.status)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`}
  </div>

  <div class="card">
    <div class="card-pad" style="padding-bottom:0;"><h3 style="font-size:15.5px;">Payment history</h3></div>
    ${allPayments.length === 0 ? emptyStateHtml('No payments yet', 'No payments have been recorded for this tenant.', emptyIcon()) : `
    <div class="table-wrap" style="border:none; border-radius:0; box-shadow:none; margin-top:10px;">
      <table>
        <thead><tr><th>Date</th><th>Bill</th><th>Type</th><th class="num">Amount</th><th>Method</th></tr></thead>
        <tbody>
          ${allPayments.sort((a,b)=>new Date(a.payment_date)-new Date(b.payment_date)).map(p => `<tr>
            <td>${dateFmt(p.payment_date)}</td>
            <td class="mono">#${p.bill_id}</td>
            <td>${escapeHtml(p.bill_type)}</td>
            <td class="num">${currency(p.amount)}</td>
            <td>${escapeHtml(p.payment_method)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`}
  </div>`;
}

/* ---------- Generic PDF export for any report tab ---------- */

function exportReportPdf(){
  const data = state._lastReportData;
  if (!data) return;
  const { tab, rep, start, end } = data;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const marginX = 40;
  let y = 44;

  const titles = {
    'business-overview': 'Business Overview Report',
    'tenant-statement': 'Tenant Bill Statement',
    'summary': 'Business Summary Report',
    'rent-collection': 'Rent Collection Report',
    'deposit': 'Deposit Report',
    'occupancy': 'Occupancy Report',
    'user-wise': 'User-wise Financial Report',
  };

  doc.setFillColor(58, 54, 46);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 6, 'F');

  doc.setFontSize(11); doc.setFont(undefined, 'bold'); doc.setTextColor(58, 54, 46);
  doc.text('LEDGER', marginX, y);
  doc.setFontSize(8.5); doc.setFont(undefined, 'normal'); doc.setTextColor(130);
  doc.text('Shop & Tenant Management', marginX + 52, y);
  y += 22;

  doc.setDrawColor(220); doc.setLineWidth(0.6);
  doc.line(marginX, y, doc.internal.pageSize.getWidth() - marginX, y);
  y += 20;

  doc.setFontSize(16); doc.setFont(undefined, 'bold'); doc.setTextColor(0);
  doc.text(titles[tab] || 'Report', marginX, y); y += 20;
  doc.setFontSize(10); doc.setFont(undefined, 'normal'); doc.setTextColor(100);
  doc.text(`Period: ${start ? dateFmt(start) : 'all time'} — ${end ? dateFmt(end) : 'today'}`, marginX, y); y += 14;
  doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, marginX, y); y += 20;
  doc.setTextColor(0);

  const addKpiRow = (items) => {
    doc.setFontSize(9);
    items.forEach((it, i) => {
      const x = marginX + i * 130;
      doc.setFont(undefined, 'normal'); doc.setTextColor(110);
      doc.text(it.label, x, y);
      doc.setFont(undefined, 'bold'); doc.setTextColor(0);
      doc.text(String(it.value), x, y + 14);
    });
    y += 34;
  };

  const addTable = (head, body) => {
    doc.autoTable({ startY: y, head: [head], body, margin: { left: marginX, right: marginX }, styles: { fontSize: 8, cellPadding: 4 }, headStyles: { fillColor: [58, 54, 46] } });
    y = doc.lastAutoTable.finalY + 18;
  };

  if (tab === 'tenant-statement'){
    const s = rep.summary, u = rep.user;
    doc.setFontSize(10); doc.setFont(undefined, 'bold'); doc.setTextColor(0);
    doc.text(`${u.name}  ·  ${u.mobile||''}`, marginX, y); y += 16;
    addKpiRow([
      { label: 'Total billed', value: currency(s.total_billed) },
      { label: 'Total paid', value: currency(s.total_paid) },
      { label: 'Pending', value: currency(s.total_pending) },
    ]);
    doc.setFont(undefined, 'bold'); doc.setFontSize(11); doc.text('Bill history', marginX, y); y += 8;
    addTable(['Month', 'Bill', 'Type', 'Description', 'Bill Date', 'Due', 'Amount', 'Paid', 'Pending', 'Status'],
      rep.ledger.map(b => [b.bill_month||'—', `#${b.bill_id}`, b.bill_type, b.description||'—', dateFmt(b.bill_date), dateFmt(b.due_date), currency(b.amount), currency(b.paid_amount), currency(b.pending_amount), b.status]));

    const allPayments = rep.ledger.flatMap(b => b.payments.map(p => ({...p, bill_type: b.bill_type, bill_id: b.bill_id})))
      .sort((a,bx)=>new Date(a.payment_date)-new Date(bx.payment_date));
    doc.setFont(undefined, 'bold'); doc.setFontSize(11); doc.text('Payment history', marginX, y); y += 8;
    addTable(['Date', 'Bill', 'Type', 'Amount', 'Method'],
      allPayments.map(p => [dateFmt(p.payment_date), `#${p.bill_id}`, p.bill_type, currency(p.amount), p.payment_method]));

  } else if (tab === 'business-overview'){
    const ce = rep.collection_efficiency, aging = rep.aging;
    addKpiRow([
      { label: 'Collection efficiency', value: ce.collection_efficiency_percent + '%' },
      { label: 'Total outstanding', value: currency(aging.total_outstanding) },
      { label: '90+ days overdue', value: currency(aging.buckets['90_plus']) },
    ]);
    doc.setFont(undefined, 'bold'); doc.setFontSize(11); doc.text('6-month collection trend', marginX, y); y += 8;
    addTable(['Month', 'Billed', 'Collected'], rep.monthly_trend.map(m => [m.month, currency(m.billed), currency(m.collected)]));

    doc.setFont(undefined, 'bold'); doc.setFontSize(11); doc.text('Overdue aging', marginX, y); y += 8;
    const bucketLabels = { current: 'Not due', '0_30': '0-30 days', '31_60': '31-60 days', '61_90': '61-90 days', '90_plus': '90+ days' };
    addTable(['Age bucket', 'Amount', 'Bills'], Object.entries(aging.buckets).map(([k,v]) => [bucketLabels[k]||k, currency(v), String(aging.bucket_counts[k])]));

    doc.setFont(undefined, 'bold'); doc.setFontSize(11); doc.text('Complex-wise performance', marginX, y); y += 8;
    addTable(['Complex', 'Shops', 'Occupancy', 'Billed', 'Collected', 'Collection rate'],
      rep.complex_performance.map(c => [c.complex_name||'Unassigned', c.total_shops, c.occupancy_rate_percent+'%', currency(c.billed), currency(c.collected), c.collection_rate_percent+'%']));

    doc.setFont(undefined, 'bold'); doc.setFontSize(11); doc.text('Top defaulters', marginX, y); y += 8;
    addTable(['Tenant', 'Mobile', 'Total pending', 'Oldest due'],
      rep.top_defaulters.map(d => [d.user_name||'—', d.mobile||'—', currency(d.total_pending), dateFmt(d.oldest_due_date)]));

  } else if (tab === 'summary'){
    const occ = rep.occupancy, col = rep.collections, due = rep.outstanding_dues;
    addKpiRow([
      { label: 'Occupancy', value: occ.total_shops ? Math.round((occ.occupied/occ.total_shops)*100)+'%' : '0%' },
      { label: 'Collected', value: currency(col.total_collected_in_range) },
      { label: 'Outstanding', value: currency(due.total_outstanding) },
    ]);
    const users = state.cache.users || [], shops = state.cache.shops || [];
    const userName = (id) => users.find(u=>u.id===id)?.name || `#${id}`;
    const shopNum = (id) => shops.find(s=>s.id===id)?.shop_number || `#${id}`;
    doc.setFont(undefined, 'bold'); doc.setFontSize(11); doc.text('Outstanding dues', marginX, y); y += 8;
    addTable(['Bill', 'Tenant', 'Shop', 'Type', 'Description', 'Pending', 'Bill Date', 'Due'],
      due.bills.map(b => [`#${b.bill_id}`, userName(b.user_id), shopNum(b.shop_id), b.bill_type, b.description||'—', currency(b.pending_amount), dateFmt(b.bill_date), dateFmt(b.due_date)]));

  } else if (tab === 'rent-collection'){
    const s = rep.summary;
    addKpiRow([
      { label: 'Total billed', value: currency(s.total_billed) },
      { label: 'Collected', value: currency(s.total_collected) },
      { label: 'Pending', value: currency(s.total_pending) },
    ]);
    addTable(['Bill', 'Tenant', 'Shop', 'Type', 'Description', 'Amount', 'Paid', 'Pending', 'Status', 'Bill Date', 'Due'],
      rep.records.map(r => [`#${r.bill_id}`, r.user_name, r.shop_number, r.bill_type, r.description||'—', currency(r.amount), currency(r.paid_amount), currency(r.pending_amount), r.status, dateFmt(r.bill_date), dateFmt(r.due_date)]));

  } else if (tab === 'deposit'){
    const s = rep.summary;
    addKpiRow([
      { label: 'Required', value: currency(s.total_deposit_required) },
      { label: 'Collected', value: currency(s.total_deposit_collected) },
      { label: 'Remaining', value: currency(s.total_deposit_remaining) },
    ]);
    addTable(['Tenant', 'Shop', 'Required', 'Paid', 'Remaining', 'Status'],
      rep.records.map(r => [r.user_name, r.shop_number, currency(r.deposit_required), currency(r.deposit_paid), currency(r.deposit_remaining), r.deposit_status]));

  } else if (tab === 'occupancy'){
    const s = rep.summary;
    addKpiRow([
      { label: 'Total shops', value: s.total_shops },
      { label: 'Occupied', value: s.occupied },
      { label: 'Occupancy rate', value: s.occupancy_rate_percent+'%' },
    ]);
    addTable(['Shop', 'Complex', 'Rent', 'Status', 'Tenant'],
      rep.shop_details.map(sd => [sd.shop_number, sd.complex_name, currency(sd.shop_rent), sd.status, sd.tenant_name||'—']));

  } else if (tab === 'user-wise'){
    addTable(['Tenant', 'Billed', 'Collected', 'Pending', 'Deposit paid', 'Deposit rem.'],
      rep.map(r => [r.user_name, currency(r.total_billed), currency(r.total_collected), currency(r.total_pending), currency(r.deposit_paid), currency(r.deposit_remaining)]));
  }

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++){
    doc.setPage(i);
    const w = doc.internal.pageSize.getWidth(), h = doc.internal.pageSize.getHeight();
    doc.setDrawColor(230); doc.setLineWidth(0.5);
    doc.line(marginX, h - 34, w - marginX, h - 34);
    doc.setFontSize(8); doc.setFont(undefined, 'normal'); doc.setTextColor(140);
    doc.text('Ledger — Shop & Tenant Management', marginX, h - 20);
    doc.text(`Page ${i} of ${pageCount}`, w - marginX, h - 20, { align: 'right' });
  }

  doc.save(`${tab}-report-${start||'all'}-to-${end||'today'}.pdf`);
}

/* ---------- Monthly Ledger: PDF build / download / print / share ---------- */
const currencyPdf = (n) => 'Rs. ' + Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function buildMonthlyLedgerDoc(tenantName, tenantMobile, year, monthly, summary, complexName){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const marginX = 40;
  const pageW = doc.internal.pageSize.getWidth();
  let y = 46;
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  doc.setFillColor(58, 54, 46);
  doc.rect(0, 0, pageW, 6, 'F');

  doc.setFontSize(12); doc.setFont(undefined, 'bold'); doc.setTextColor(58, 54, 46);
  doc.text('LEDGER', marginX, y);
  doc.setFontSize(9); doc.setFont(undefined, 'normal'); doc.setTextColor(130);
  doc.text('Shop & Tenant Management' + (complexName ? '  ·  ' + complexName : ''), marginX + 55, y);
  y += 24;

  doc.setDrawColor(220); doc.setLineWidth(0.6);
  doc.line(marginX, y, pageW - marginX, y);
  y += 22;

  doc.setFontSize(17); doc.setFont(undefined, 'bold'); doc.setTextColor(20);
  doc.text('Monthly Ledger', marginX, y); y += 20;
  doc.setFontSize(10.5); doc.setFont(undefined, 'bold'); doc.setTextColor(60);
  doc.text(tenantName, marginX, y);
  if (tenantMobile){
    doc.setFont(undefined, 'normal'); doc.setTextColor(120);
    doc.text(tenantMobile, marginX + doc.getTextWidth(tenantName) + 10, y);
  }
  y += 15;
  doc.setFontSize(9); doc.setFont(undefined, 'normal'); doc.setTextColor(130);
  doc.text(`Year ${year}   ·   Generated ${new Date().toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}`, marginX, y);
  y += 24;

  const kpis = [
    { label: 'OUTSTANDING DUES', value: currencyPdf(summary.outstanding_dues), color: [176, 62, 46] },
    { label: 'TOTAL BILLED', value: currencyPdf(summary.total_billed), color: [20,20,20] },
    { label: 'TOTAL PAID', value: currencyPdf(summary.total_paid), color: [46, 110, 62] },
    { label: 'DEPOSIT ON FILE', value: currencyPdf(summary.deposit_on_file), color: [20,20,20] },
  ];
  const kpiW = (pageW - marginX*2) / 4;
  kpis.forEach((it, i) => {
    const x = marginX + i * kpiW;
    doc.setDrawColor(225); doc.setLineWidth(0.5);
    if (i > 0) doc.line(x, y - 14, x, y + 8);
    doc.setFontSize(7.5); doc.setFont(undefined, 'bold'); doc.setTextColor(140);
    doc.text(it.label, x, y);
    doc.setFontSize(12.5); doc.setFont(undefined, 'bold'); doc.setTextColor(...it.color);
    doc.text(it.value, x, y + 16);
  });
  y += 36;
  doc.setDrawColor(220); doc.line(marginX, y, pageW - marginX, y);
  y += 20;
  doc.setTextColor(0);

  const totalBilled = monthly.reduce((s,m) => s + m.billed, 0);
  const totalPaid = monthly.reduce((s,m) => s + m.paid, 0);
  const totalRemaining = monthly.reduce((s,m) => s + m.remaining, 0);
  const totalBillsCount = monthly.reduce((s,m) => s + m.bills_count, 0);
  const overallStatus = totalRemaining === 0 ? 'Paid' : (totalPaid > 0 ? 'Partial' : 'Pending');

  const statusColorMap = { Paid: [46,110,62], Partial: [176,130,30], Pending: [176,62,46], 'No bills': [150,150,150] };

  doc.autoTable({
    startY: y,
    head: [['Month','Bills','Billed','Paid','Remaining','Status']],
    body: monthly.map((m, idx) => [
      monthNames[idx], String(m.bills_count),
      m.bills_count ? currencyPdf(m.billed) : '—',
      m.bills_count ? currencyPdf(m.paid) : '—',
      m.bills_count ? currencyPdf(m.remaining) : '—',
      m.status,
    ]),
    foot: [['Year total', String(totalBillsCount), currencyPdf(totalBilled), currencyPdf(totalPaid), currencyPdf(totalRemaining), overallStatus]],
    margin: { left: marginX, right: marginX },
    styles: { fontSize: 8.5, cellPadding: { top:6, bottom:6, left:8, right:8 }, lineColor: [230,228,222], lineWidth: 0.5 },
    headStyles: { fillColor: [58, 54, 46], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    footStyles: { fillColor: [240, 237, 230], textColor: [20,20,20], fontStyle: 'bold', fontSize: 8.5 },
    alternateRowStyles: { fillColor: [250, 249, 246] },
    columnStyles: {
      0: { fontStyle: 'bold' },
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'left' },
    },
    didParseCell: (d) => {
      if (d.section === 'body' && d.column.index === 5){
        const c = statusColorMap[d.cell.raw] || [90,90,90];
        d.cell.styles.textColor = c; d.cell.styles.fontStyle = 'bold';
      }
      if (d.section === 'body' && d.column.index === 4 && d.cell.raw !== '—'){
        d.cell.styles.textColor = [176, 62, 46];
      }
    },
  });

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++){
    doc.setPage(i);
    const w = doc.internal.pageSize.getWidth(), h = doc.internal.pageSize.getHeight();
    doc.setDrawColor(230); doc.setLineWidth(0.5);
    doc.line(marginX, h - 34, w - marginX, h - 34);
    doc.setFontSize(8); doc.setFont(undefined, 'normal'); doc.setTextColor(140);
    doc.text('Ledger — Shop & Tenant Management', marginX, h - 20);
    doc.text(`Page ${i} of ${pageCount}`, w - marginX, h - 20, { align: 'right' });
  }
  return doc;
}


function downloadMonthlyLedgerPdf(source){
  const d = source === 'tenant' ? state._lastTpLedgerData : state._lastAdminLedgerData;
  if (!d) return;
  const doc = buildMonthlyLedgerDoc(d.tenantName, d.tenantMobile, d.year, d.monthly, d.summary, d.complexName);
  doc.save(`ledger-${d.tenantName.replace(/\s+/g,'_')}-${d.year}.pdf`);
}

function printMonthlyLedgerPdf(source){
  const d = source === 'tenant' ? state._lastTpLedgerData : state._lastAdminLedgerData;
  if (!d) return;
  const doc = buildMonthlyLedgerDoc(d.tenantName, d.tenantMobile, d.year, d.monthly, d.summary, d.complexName);
  doc.autoPrint();
  window.open(doc.output('bloburl'), '_blank');
}

async function shareMonthlyLedgerPdf(source){
  const d = source === 'tenant' ? state._lastTpLedgerData : state._lastAdminLedgerData;
  if (!d) return;
  const doc = buildMonthlyLedgerDoc(d.tenantName, d.tenantMobile, d.year, d.monthly, d.summary, d.complexName);
  const fileName = `ledger-${d.tenantName.replace(/\s+/g,'_')}-${d.year}.pdf`;
  const blob = doc.output('blob');
  const file = new File([blob], fileName, { type: 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: `Ledger ${d.year} — ${d.tenantName}`, text: `Monthly ledger for ${d.year}` });
    } catch (err) {
      if (err.name !== 'AbortError') showToast('Could not share — downloading instead', 'error');
      doc.save(fileName);
    }
  } else {
    doc.save(fileName);
    showToast('Sharing not supported on this device/browser — file downloaded instead', 'success');
  }
}
