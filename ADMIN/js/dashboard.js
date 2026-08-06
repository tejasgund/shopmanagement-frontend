/* ================================================================
   ADMIN/js/dashboard.js — split from the old ADMIN/script.js
   Contains: DASHBOARD VIEW. Also carries stampHtml/emptyIcon/warnIcon,
   which lived at the tail of this section in the original file.
   ================================================================ */
/* ================================================================
   DASHBOARD VIEW
   ================================================================ */
async function dashboardView(){
  const [complexes, shops, users, bills] = await Promise.all([
    ensureLoaded('complexes','/api/complex'),
    ensureLoaded('shops','/api/shop'),
    ensureLoaded('users','/api/user'),
    ensureLoaded('bills','/api/bill'),
  ]);

  const occupied = shops.filter(s => s.status === 'occupied').length;
  const pendingBills = bills.filter(b => b.status !== 'paid');
  const pendingTotal = pendingBills.reduce((sum,b) => sum + Number(b.pending_amount||0), 0);
  const collectedTotal = bills.reduce((sum,b) => sum + Number(b.paid_amount||0), 0);
  const totalMonthlyRent = shops.filter(s=>s.status==='occupied').reduce((sum,s)=>sum+Number(s.shop_rent||0),0);
  const expiringSoon = shops.filter(s => s.assigned_to && s.assigned_to.agreement_end_date && (new Date(s.assigned_to.agreement_end_date) - new Date()) / 86400000 <= 30 && (new Date(s.assigned_to.agreement_end_date) - new Date()) / 86400000 >= 0).length;

  updatePendingBadge(pendingBills.length);

  const recentBills = [...bills].sort((a,b) => new Date(b.bill_date) - new Date(a.bill_date)).slice(0,6);

  // Billing-at-a-glance breakdown (computed client-side from already-loaded bills — no extra API calls)
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth()+1, 0, 23, 59, 59);
  const overdueBills = bills.filter(b => b.status !== 'paid' && b.due_date && new Date(b.due_date) < now);
  const dueThisMonthBills = bills.filter(b => b.status !== 'paid' && b.due_date && new Date(b.due_date) >= monthStart && new Date(b.due_date) <= monthEnd);
  const paidBills = bills.filter(b => b.status === 'paid');
  const partialBills = bills.filter(b => b.status === 'partial');
  const usersWithPending = new Set(pendingBills.map(b=>b.user_id)).size;

  // Per-complex stats
  const complexStats = complexes.map(c => {
    const cShops = shops.filter(s => s.complex_id === c.id);
    const cOccupied = cShops.filter(s => s.status === 'occupied');
    const cAvailable = cShops.filter(s => s.status === 'available');
    const cMonthlyRent = cOccupied.reduce((sum,s)=>sum+Number(s.shop_rent||0),0);
    // pending rent = sum of pending_amount on bills for shops in this complex
    const cShopIds = new Set(cShops.map(s=>s.id));
    const cPending = bills.filter(b => cShopIds.has(b.shop_id) && b.status !== 'paid')
                          .reduce((sum,b)=>sum+Number(b.pending_amount||0),0);
    return { ...c, totalShops: cShops.length, occupiedShops: cOccupied.length, availableShops: cAvailable.length, monthlyRent: cMonthlyRent, pendingRent: cPending };
  });

  return `
  <div class="stat-row">
    <div class="card stat-card"><div class="label">Complexes</div><div class="value">${complexes.length}</div><div class="sub">properties managed</div></div>
    <div class="card stat-card"><div class="label">Shops</div><div class="value">${shops.length}</div><div class="sub">${occupied} occupied · ${shops.length-occupied} available</div></div>
    <div class="card stat-card"><div class="label">Tenants</div><div class="value">${users.filter(u=>u.role==='tenant').length}</div><div class="sub">${users.length} total users</div></div>
    <div class="card stat-card accent-green"><div class="label">Monthly rent</div><div class="value mono">${currency(totalMonthlyRent)}</div><div class="sub">from occupied shops</div></div>
    <div class="card stat-card accent-rust"><div class="label">Pending dues</div><div class="value mono">${currency(pendingTotal)}</div><div class="sub">${pendingBills.length} bills outstanding</div></div>
    <div class="card stat-card accent-green"><div class="label">Collected</div><div class="value mono">${currency(collectedTotal)}</div><div class="sub">across all bills</div></div>
    <!-- NEW: Expiring agreements -->
    <div class="card stat-card ${expiringSoon > 0 ? 'accent-rust' : 'accent-green'}">
      <div class="label">Agreements expiring in 30 days</div>
      <div class="value">${expiringSoon}</div>
      <div class="sub">${expiringSoon > 0 ? '⚠️ take action' : 'all clear'}</div>
    </div>
  </div>

  <h3 style="font-size:15.5px; margin:0 0 14px;">Billing at a glance</h3>
  <div class="glance-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(150px,1fr)); gap:12px; margin-bottom:24px;">
    <button type="button" class="card stat-card glance-card" data-glance="overdue" style="text-align:left; cursor:pointer;">
      <div class="label">Overdue</div><div class="value mono" style="color:var(--danger); font-size:22px;">${overdueBills.length}</div><div class="sub">${currency(overdueBills.reduce((s,b)=>s+Number(b.pending_amount||0),0))} at risk</div>
    </button>
    <button type="button" class="card stat-card glance-card" data-glance="due-this-month" style="text-align:left; cursor:pointer;">
      <div class="label">Due this month</div><div class="value mono" style="font-size:22px;">${dueThisMonthBills.length}</div><div class="sub">${currency(dueThisMonthBills.reduce((s,b)=>s+Number(b.pending_amount||0),0))} expected</div>
    </button>
        <button type="button" class="card stat-card glance-card" data-glance="partial" style="text-align:left; cursor:pointer;">
      <div class="label">Partially paid</div><div class="value mono" style="color:var(--partial); font-size:22px;">${partialBills.length}</div><div class="sub">in progress</div>
    </button>
    <button type="button" class="card stat-card glance-card" data-glance="paid" style="text-align:left; cursor:pointer;">
      <div class="label">Paid</div><div class="value mono" style="color:var(--success); font-size:22px;">${paidBills.length}</div><div class="sub">settled in full</div>
    </button>
    <button type="button" class="card stat-card glance-card" data-glance="outstanding" style="text-align:left; cursor:pointer;">
      <div class="label">Tenants with dues</div><div class="value mono" style="font-size:22px;">${usersWithPending}</div><div class="sub">of ${users.filter(u=>u.role==='tenant').length} tenants</div>
    </button>
  </div>

  ${complexStats.length > 0 ? `
  <h3 style="font-size:15.5px; margin:0 0 14px;">Complex overview</h3>
  <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(300px,1fr)); gap:14px; margin-bottom:24px;">
    ${complexStats.map(c=>`
    <div class="complex-stat-card">
      <div class="c-name">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M5 21V7l7-4 7 4v14"/></svg>
        ${escapeHtml(c.name)}
      </div>
      <div class="complex-stat-grid">
        <div class="complex-stat-item"><div class="csi-val">${c.totalShops}</div><div class="csi-label">Total</div></div>
        <div class="complex-stat-item accent-green"><div class="csi-val">${c.occupiedShops}</div><div class="csi-label">Occupied</div></div>
        <div class="complex-stat-item"><div class="csi-val">${c.availableShops}</div><div class="csi-label">Available</div></div>
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:10px; padding-top:10px; border-top:1px dashed var(--line);">
        <div><div style="font-size:10.5px; color:var(--muted); text-transform:uppercase; letter-spacing:.04em; font-weight:600;">Monthly Rent</div><div style="font-family:var(--font-mono); font-weight:700; color:var(--green-deep); font-size:14px;">${currency(c.monthlyRent)}</div></div>
        <div><div style="font-size:10.5px; color:var(--muted); text-transform:uppercase; letter-spacing:.04em; font-weight:600;">Pending Rent</div><div style="font-family:var(--font-mono); font-weight:700; color:${c.pendingRent>0?'var(--rust)':'var(--success)'}; font-size:14px;">${currency(c.pendingRent)}</div></div>
      </div>
    </div>`).join('')}
  </div>` : ''}

  <div class="card">
    <div class="card-pad" style="padding-bottom:0;"><h3 style="font-size:15.5px;">Recent bills</h3></div>
    ${recentBills.length === 0 ? emptyStateHtml('No bills yet', 'Bills you raise will show up here.', emptyIcon()) : `
    <div class="table-wrap" style="border:none; border-radius:0; box-shadow:none; margin-top:10px;">
      <table>
        <thead><tr><th>Bill</th><th>Tenant</th><th>Type</th><th class="num">Amount</th><th>Status</th><th>Due</th></tr></thead>
        <tbody>
          ${recentBills.map(b => {
            const tenant = state.cache.users.find(u=>u.id===b.user_id);
            return `<tr>
              <td class="mono">#${b.id}</td>
              <td>${escapeHtml(tenant?.name || ('User #'+b.user_id))}</td>
              <td>${escapeHtml(b.bill_type)}</td>
              <td class="num">${currency(b.amount)}</td>
              <td>${stampHtml(b.status)}</td>
              <td>${dateFmt(b.due_date)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`}
  </div>`;
}

function attachDashboardHandlers(){
  document.querySelectorAll('.glance-card').forEach(card => {
    card.addEventListener('click', () => {
      pendingBillsViewFilter = card.dataset.glance;
      navigateTo('billing');
    });
  });
}

function updatePendingBadge(count){
  const badge = document.getElementById('pendingBadge');
  if (count > 0){ badge.style.display='inline-block'; badge.textContent = count; }
  else badge.style.display = 'none';
}

function stampHtml(status){
  const cls = status === 'paid' ? 'paid' : status === 'partial' ? 'partial' : 'pending';
  return `<span class="stamp ${cls}">${escapeHtml(status)}</span>`;
}
function emptyIcon(){
  return `<svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>`;
}
function warnIcon(){
  return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
}
