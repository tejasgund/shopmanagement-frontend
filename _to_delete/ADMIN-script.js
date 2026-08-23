/* ================================================================
   CONFIG — set your backend URL here
   ================================================================ */
const API_BASE_URL = ""; // relative — same origin as this page; Apache proxies /api to the backend

/* ================================================================
   STATE
   ================================================================ */
const state = {
  token: localStorage.getItem('tms_token') || null,
  role: localStorage.getItem('tms_role') || null,
  currentUser: null,
  view: 'dashboard',
  cache: { complexes: [], shops: [], users: [], bills: [], payments: [] },
  loaded: { complexes:false, shops:false, users:false, bills:false, payments:false },
  billing: {
    filters: { status: [], complexIds: [], typeSet: [], years: [], months: [], search: '' },
    nav: { mode: 'tenant', complexId: null, userId: null, year: null, month: null, tab: 'bills' },
    sort: 'newest',
  },
};
// Set by dashboard "at a glance" cards to auto-apply a filter when the Bills view loads next.
let pendingBillsViewFilter = null;
let tpBillsData = [], tpShopsData = [], tpBillDrill = { year:null, month:null };
let tpPaysData = [], tpPayDrill = { year:null, month:null };

/* ================================================================
   API LAYER
   ================================================================ */
class ApiError extends Error {
  constructor(message, status){ super(message); this.status = status; }
}

async function api(path, { method = 'GET', body = null, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && state.token) headers['Authorization'] = `Bearer ${state.token}`;

  let res;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new ApiError(`Can't reach the server at ${API_BASE_URL}. Check the API_BASE_URL value and that the backend is running.`, 0);
  }

  let data = null;
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch { data = null; }
  }

  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    if (data) {
      if (typeof data.detail === 'string') msg = data.detail;
      else if (Array.isArray(data.detail)) msg = data.detail.map(d => d.msg).join(', ');
    }
    if (res.status === 401) { handleAuthExpired(); }
    throw new ApiError(msg, res.status);
  }
  return data;
}

function handleAuthExpired(){
  localStorage.removeItem('tms_token');
  localStorage.removeItem('tms_role');
  window.location.href = '../index.html?expired=1';
}

/* ================================================================
   TOASTS
   ================================================================ */
function showToast(message, type = 'default'){
  const stack = document.getElementById('toastStack');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icon = type === 'success'
    ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>'
    : type === 'error'
      ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
      : '';
  el.innerHTML = `${icon}<span>${escapeHtml(message)}</span>`;
  stack.appendChild(el);
  setTimeout(() => {
    el.classList.add('fade-out');
    setTimeout(() => el.remove(), 250);
  }, 3400);
}

function escapeHtml(str){
  const d = document.createElement('div');
  d.textContent = String(str ?? '');
  return d.innerHTML;
}

/* ================================================================
   FORMATTERS
   ================================================================ */
const currency = (n) => '₹' + Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateFmt = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
};
const initials = (name) => (name || '?').trim().split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase();

function daysLeftHtml(endIso){
  if (!endIso) return '<span style="color:var(--muted);">—</span>';
  const end = new Date(endIso);
  if (isNaN(end)) return '<span style="color:var(--muted);">—</span>';
  const today = new Date();
  today.setHours(0,0,0,0);
  end.setHours(0,0,0,0);
  const days = Math.round((end - today) / 86400000);
  if (days < 0) return `<span style="color:var(--rust); font-weight:700;">Expired ${Math.abs(days)}d ago</span>`;
  if (days === 0) return `<span style="color:var(--rust); font-weight:700;">Expires today</span>`;
  if (days <= 30) return `<span style="color:var(--rust); font-weight:600;">${days}d left</span>`;
  if (days <= 90) return `<span style="color:#b8860b; font-weight:600;">${days}d left</span>`;
  return `<span style="color:var(--success);">${days}d left</span>`;
}


/* ================================================================
   AUTH
   (sign-in itself happens on the root index.html; this page assumes the
   guard script in <head> already confirmed a valid admin session)
   ================================================================ */
function logout(){
  localStorage.removeItem('tms_token');
  localStorage.removeItem('tms_role');
  window.location.href = '../index.html';
}

document.getElementById('logoutBtn').addEventListener('click', logout);

async function initAdminUser(){
  try {
    const users = await api('/api/user');
    state.cache.users = users; state.loaded.users = true;
    document.getElementById('sidebarUserName').textContent = 'Admin';
    document.getElementById('sidebarUserRole').textContent = state.role;
    document.getElementById('sidebarAvatar').textContent = 'A';
  } catch (err) { /* non-fatal */ }
}

/* ================================================================
   ADMIN NAV / VIEW ROUTING
   ================================================================ */
const sidebar = document.getElementById('sidebar');
const sidebarScrim = document.getElementById('sidebarScrim');
document.getElementById('menuToggle').addEventListener('click', () => {
  sidebar.classList.add('open'); sidebarScrim.classList.add('show');
});
sidebarScrim.addEventListener('click', closeSidebar);
function closeSidebar(){ sidebar.classList.remove('open'); sidebarScrim.classList.remove('show'); }

const viewMeta = {
  dashboard: { title:'Dashboard', crumb:'Overview of your portfolio', action:null },
  complexes: { title:'Complexes', crumb:'Buildings and properties you manage', action:'Add complex' },
  shops:     { title:'Shops', crumb:'Units across all complexes', action:'Add shop' },
  users:     { title:'Users', crumb:'Admins and tenants', action:'Add user' },
  billing:   { title:'Bills & Payments', crumb:'Charges and payments, browsed tenant-wise, property-wise, or by dues overview', action:null },
  finance:   { title:'Tenant View', crumb:'Full tenant dashboard – bills, payments, deposit status', action:null },
  deposits:  { title:'Deposit Payments', crumb:'Security deposit collection tracking', action:'Record deposit' },
  reports:   { title:'Reports', crumb:'Occupancy, collections and outstanding dues', action:null },
  ledger: { title:'Month-wise Ledger', crumb:'Monthly breakdown of bills, payments, and deposits', action:null },
  audit: { title:'Audit Log', crumb:'Every create, update, and delete action across the system', action:null },
};

document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
  btn.addEventListener('click', () => { navigateTo(btn.dataset.view); closeSidebar(); });
});

async function navigateTo(view){
  state.view = view;
  document.querySelectorAll('.nav-item[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  const meta = viewMeta[view];
  document.getElementById('viewTitle').textContent = meta.title;
  document.getElementById('viewCrumb').textContent = meta.crumb;
  const actionBtn = document.getElementById('primaryActionBtn');
  if (meta.action){ actionBtn.style.display = 'inline-flex'; actionBtn.textContent = '+ ' + meta.action.replace(/^Add /,'').replace(/^Record /,''); }
  else { actionBtn.style.display = 'none'; }
  await renderView(view);
}

document.getElementById('refreshBtn').addEventListener('click', () => refreshCurrentView(true));
document.getElementById('primaryActionBtn').addEventListener('click', () => {
  if (state.view === 'deposits') openDepositModal();
  else openCreateModal(state.view);
});

async function refreshCurrentView(showSpinner){
  const btn = document.getElementById('refreshBtn');
  if (showSpinner) btn.classList.add('spinning');
  Object.keys(state.loaded).forEach(k => state.loaded[k] = false);
  try { await renderView(state.view); showToast('Data refreshed', 'success'); }
  finally { btn.classList.remove('spinning'); }
}

async function renderView(view){
  const content = document.getElementById('viewContent');
  content.innerHTML = skeletonHtml();
  try {
    switch(view){
      case 'dashboard': content.innerHTML = await dashboardView(); attachDashboardHandlers(); break;
      case 'complexes': content.innerHTML = await complexesView(); attachComplexHandlers(); break;
      case 'shops': content.innerHTML = await shopsView(); attachShopHandlers(); break;
      case 'users': content.innerHTML = await usersView(); attachUserHandlers(); break;
      case 'billing': content.innerHTML = await billingView(); attachBillingHandlers(); break;
      case 'finance': content.innerHTML = await financeView(); attachFinanceHandlers(); break;
      case 'deposits': content.innerHTML = await depositsView(); attachDepositHandlers(); break;
      case 'reports': content.innerHTML = await reportsView(); attachReportsHandlers(); break;
      case 'ledger': content.innerHTML = await ledgerView(); attachLedgerHandlers(); break;
      case 'audit': content.innerHTML = await auditView(); attachAuditHandlers(); break;
    }
    attachSearchFilter();
  } catch (err) {
    content.innerHTML = errorBannerHtml(err.message);
    document.getElementById('retryBtn')?.addEventListener('click', () => renderView(view));
  }
}

function skeletonHtml(){
  return `<div class="table-wrap">${Array.from({length:5}).map(()=>'<div class="skeleton-row"></div>').join('')}</div>`;
}
function errorBannerHtml(msg){
  return `<div class="error-banner">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
    <span>${escapeHtml(msg)}</span>
    <button id="retryBtn" class="btn btn-sm btn-ghost" style="margin-left:auto; border-color:var(--danger); color:var(--danger);">Retry</button>
  </div>`;
}
function emptyStateHtml(title, sub, iconSvg){
  return `<div class="empty-state">${iconSvg}<h3>${escapeHtml(title)}</h3><p>${escapeHtml(sub)}</p></div>`;
}

async function ensureLoaded(key, path){
  if (!state.loaded[key]){
    state.cache[key] = await api(path);
    state.loaded[key] = true;
  }
  return state.cache[key];
}

function attachSearchFilter(){
  const input = document.getElementById('tableSearch');
  if (!input) return;
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    document.querySelectorAll('tbody tr[data-search]').forEach(tr => {
      tr.style.display = tr.dataset.search.toLowerCase().includes(q) ? '' : 'none';
    });
  });
}

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

/* ================================================================
   COMPLEXES VIEW
   ================================================================ */
async function complexesView(){
  const complexes = await ensureLoaded('complexes','/api/complex');
  return `
  <div class="toolbar"><input class="search-input" id="tableSearch" placeholder="Search complexes…"></div>
  ${complexes.length === 0 ? emptyStateHtml('No complexes yet', 'Add your first complex to start assigning shops to it.', emptyIcon()) : `
  <div class="table-wrap">
    <table>
      <thead><tr><th>Name</th><th>Address</th><th>Description</th><th>Created</th><th></th></tr></thead>
      <tbody>
        ${complexes.map(c => `
          <tr data-search="${escapeHtml(c.name+' '+c.address)}">
            <td><strong>${escapeHtml(c.name)}</strong></td>
            <td>${escapeHtml(c.address)}</td>
            <td>${escapeHtml(c.description || '—')}</td>
            <td>${dateFmt(c.created_at)}</td>
            <td><div class="row-actions">
              <button class="btn-icon" data-edit-complex="${c.id}" aria-label="Edit">${editIcon()}</button>
              <button class="btn-icon" data-delete-complex="${c.id}" data-name="${escapeHtml(c.name)}" aria-label="Delete">${trashIcon()}</button>
            </div></td>
          </tr>`).join('')}
      </tbody>
    </table>
  </div>`}`;
}

function editIcon(){ return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`; }
function trashIcon(){ return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1.5 14.5a2 2 0 01-2 1.5H8.5a2 2 0 01-2-1.5L5 6m5 0V4a1 1 0 011-1h2a1 1 0 011 1v2"/></svg>`; }

function attachComplexHandlers(){
  document.querySelectorAll('[data-edit-complex]').forEach(btn => btn.addEventListener('click', () => openEditComplexModal(Number(btn.dataset.editComplex))));
  document.querySelectorAll('[data-delete-complex]').forEach(btn => btn.addEventListener('click', () => confirmDelete('complex', Number(btn.dataset.deleteComplex), btn.dataset.name)));
}

/* ================================================================
   SHOPS VIEW — grouped by complex
   Level 1: one summary card per complex (total / occupied / vacant + progress bar).
   Level 2: click a card to drill into that complex's shop details table.
   Shops with no complex fall into a "Shops without a Complex" card.
   ================================================================ */
let _shopsSelectedComplex = null;   // null = show cards; number = complex id; 'unassigned' = orphan shops

async function shopsView(){
  const [shops, complexes] = await Promise.all([
    ensureLoaded('shops','/api/shop'),
    ensureLoaded('complexes','/api/complex'),
  ]);

  if (_shopsSelectedComplex !== null) {
    return renderShopsForComplex(shops, complexes, _shopsSelectedComplex);
  }
  return renderComplexGroupCards(shops, complexes);
}

function renderComplexGroupCards(shops, complexes){
  const buildCard = (name, keyValue, groupShops, extraClass = '') => {
    const total = groupShops.length;
    const occupied = groupShops.filter(s => s.status === 'occupied').length;
    const vacant = total - occupied;
    const pct = total > 0 ? Math.round((occupied / total) * 100) : 0;
    return `
      <button type="button" class="complex-card ${extraClass}" data-open-complex="${keyValue}">
        <div class="complex-card-title">${escapeHtml(name)}</div>
        <div class="complex-card-stats">
          <div class="ccs"><div class="ccs-n">${total}</div><div class="ccs-l">Total shops</div></div>
          <div class="ccs"><div class="ccs-n" style="color:var(--success);">${occupied}</div><div class="ccs-l">Occupied</div></div>
          <div class="ccs"><div class="ccs-n" style="color:var(--rust);">${vacant}</div><div class="ccs-l">Vacant</div></div>
        </div>
        <div class="complex-card-progress">
          <div class="ccp-track"><div class="ccp-fill" style="width:${pct}%;"></div></div>
          <div class="ccp-label">${pct}% occupied</div>
        </div>
      </button>`;
  };

  const complexCards = complexes.map(c =>
    buildCard(c.name, c.id, shops.filter(s => s.complex_id === c.id))
  ).join('');

  const complexIds = new Set(complexes.map(c => c.id));
  const orphanShops = shops.filter(s => !complexIds.has(s.complex_id));
  const orphanCard = orphanShops.length > 0
    ? buildCard('Shops without a Complex', 'unassigned', orphanShops, 'complex-card-orphan')
    : '';

  if (complexes.length === 0 && orphanShops.length === 0) {
    return emptyStateHtml('No shops yet', 'Add a complex first, then add shops to it.', emptyIcon());
  }

  return `<div class="complex-cards-grid">${complexCards}${orphanCard}</div>`;
}

function renderShopsForComplex(shops, complexes, complexKey){
  const complexName = (id) => complexes.find(c=>c.id===id)?.name || `#${id}`;

  let filteredShops, headingName;
  if (complexKey === 'unassigned') {
    const complexIds = new Set(complexes.map(c => c.id));
    filteredShops = shops.filter(s => !complexIds.has(s.complex_id));
    headingName = 'Shops without a Complex';
  } else {
    const cid = Number(complexKey);
    filteredShops = shops.filter(s => s.complex_id === cid);
    headingName = complexName(cid);
  }

  const availableCount = filteredShops.filter(s => s.status === 'available').length;
  const occupiedCount = filteredShops.filter(s => s.status === 'occupied').length;

  return `
  <div class="toolbar" style="align-items:center; flex-wrap:wrap; gap:12px;">
    <button class="btn btn-ghost btn-sm" id="shopsBackToComplexes" type="button">← Back to complexes</button>
    <div style="font-weight:700; font-size:15px;">${escapeHtml(headingName)}</div>
    <div style="flex:1;"></div>
    <input class="search-input" id="tableSearch" placeholder="Search shops…">
    <div class="filter-chips" id="shopFilterChips">
      <button class="chip active" data-filter="all">All (${filteredShops.length})</button>
      <button class="chip" data-filter="available">Empty (${availableCount})</button>
      <button class="chip" data-filter="occupied">Occupied (${occupiedCount})</button>
    </div>
  </div>
  ${filteredShops.length === 0 ? emptyStateHtml('No shops in this complex yet', 'Add a shop and assign it to this complex.', emptyIcon()) : `
  <div class="table-wrap">
    <table>
      <thead><tr><th>Shop #</th><th>Complex</th><th class="num">Area (sqft)</th><th class="num">Rent/mo</th><th class="num">Deposit</th><th>Status</th><th>Tenant</th><th>Agreement Start</th><th>Agreement End</th><th>Days Left</th><th></th></tr></thead>
      <tbody>
        ${filteredShops.map(s => {
          const owner = s.assigned_to;
          const hasTenant = !!owner;
          const start = hasTenant ? owner.agreement_start_date : null;
          const end = hasTenant ? owner.agreement_end_date : null;
          let daysLeft = '—';
          let daysLeftColor = '';
          if (end) {
            const days = Math.round((new Date(end) - new Date()) / 86400000);
            daysLeft = days < 0 ? 'Expired' : days + 'd';
            daysLeftColor = (days < 0 || days <= 30) ? 'color:var(--rust); font-weight:700;' : '';
          }
          return `
            <tr data-search="${escapeHtml(s.shop_number+' '+complexName(s.complex_id)+' '+(owner?.name||''))}" data-status="${s.status}">
              <td class="mono"><strong>${escapeHtml(s.shop_number)}</strong></td>
              <td>${escapeHtml(complexName(s.complex_id))}</td>
              <td class="num">${Number(s.area_sqft).toLocaleString('en-IN')}</td>
              <td class="num">${s.shop_rent != null ? currency(s.shop_rent) : '—'}</td>
              <td class="num">${s.shop_deposit != null ? currency(s.shop_deposit) : '—'}</td>
              <td><span class="pill ${s.status}"><span class="pill-dot"></span>${escapeHtml(s.status)}</span></td>
              <td>${hasTenant ? `<span class="tenant-tag">${escapeHtml(owner.name)}</span>` : '<span style="color:var(--muted); font-size:13px;">— empty —</span>'}</td>
              <td>${hasTenant && start ? dateFmt(start) : '—'}</td>
              <td>${hasTenant && end ? dateFmt(end) : '—'}</td>
              <td style="${daysLeftColor}">${hasTenant ? daysLeft : '—'}</td>
              <td><div class="row-actions">
                ${hasTenant ? `<button class="btn-icon" data-edit-agreement-shop="${s.id}" data-userid="${owner.id}" data-shopnum="${escapeHtml(s.shop_number)}" data-start="${start||''}" data-end="${end||''}" aria-label="Edit agreement dates" title="Edit agreement dates">${editIcon()}</button>` : ''}
                ${hasTenant ? `<button class="btn-icon" data-deassign-shop="${s.id}" data-shopnum="${escapeHtml(s.shop_number)}" data-tenant="${escapeHtml(owner.name)}" data-userid="${owner.id}" aria-label="Deassign tenant" title="Deassign tenant">${unlinkIcon()}</button>` : ''}
                <button class="btn-icon" data-edit-shop="${s.id}" aria-label="Edit shop details">${editIcon()}</button>
                <button class="btn-icon" data-delete-shop="${s.id}" data-name="${escapeHtml(s.shop_number)}" aria-label="Delete">${trashIcon()}</button>
              </div></td>
            </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>`}`;
}

function unlinkIcon(){ return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18.84 12.25l1.72-1.71a5 5 0 00-7.07-7.07l-1.05 1.05M5.17 11.75l-1.71 1.71a5 5 0 007.07 7.07l1.05-1.05M8 12h8"/></svg>`; }

function attachShopHandlers(){
  // Level 1: click a complex card to drill in
  document.querySelectorAll('[data-open-complex]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const key = btn.dataset.openComplex;
      _shopsSelectedComplex = (key === 'unassigned') ? 'unassigned' : Number(key);
      await renderView('shops');
    });
  });

  // Level 2: back to the overview cards
  const backBtn = document.getElementById('shopsBackToComplexes');
  if (backBtn) {
    backBtn.addEventListener('click', async () => {
      _shopsSelectedComplex = null;
      await renderView('shops');
    });
  }

  // Level 2: per-row action buttons
  document.querySelectorAll('[data-edit-agreement-shop]').forEach(btn => {
    btn.addEventListener('click', () => {
      const shopId = Number(btn.dataset.editAgreementShop);
      const userId = Number(btn.dataset.userid);
      const shopNum = btn.dataset.shopnum;
      const start = btn.dataset.start || null;
      const end = btn.dataset.end || null;
      const user = state.cache.users.find(u => u.id === userId);
      if (!user) return;
      openEditAgreementModal(userId, user.name, shopId, shopNum, start, end, () => closeModal());
    });
  });
  document.querySelectorAll('[data-deassign-shop]').forEach(btn => {
    btn.addEventListener('click', () => confirmDeassignShop(
      Number(btn.dataset.deassignShop),
      btn.dataset.shopnum,
      btn.dataset.tenant,
      Number(btn.dataset.userid)
    ));
  });
  document.querySelectorAll('[data-edit-shop]').forEach(btn => {
    btn.addEventListener('click', () => openEditShopModal(Number(btn.dataset.editShop)));
  });
  document.querySelectorAll('[data-delete-shop]').forEach(btn => {
    btn.addEventListener('click', () => confirmDelete('shop', Number(btn.dataset.deleteShop), btn.dataset.name));
  });

  // Level 2: search box + status chips
  const chips = document.querySelectorAll('#shopFilterChips .chip');
  const searchInput = document.getElementById('tableSearch');
  const applyShopFilters = () => {
    const q = (searchInput?.value || '').trim().toLowerCase();
    const active = document.querySelector('#shopFilterChips .chip.active');
    const status = active?.dataset.filter || 'all';
    document.querySelectorAll('.table-wrap tbody tr').forEach(tr => {
      let show = true;
      if (q && !tr.dataset.search?.toLowerCase().includes(q)) show = false;
      if (status !== 'all' && tr.dataset.status !== status) show = false;
      tr.style.display = show ? '' : 'none';
    });
  };
  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      chips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      applyShopFilters();
    });
  });
  if (searchInput) searchInput.addEventListener('input', applyShopFilters);
}

function confirmDeassignShop(shopId, shopNum, tenantName, userId){
  openModal('Deassign tenant', `
    <div class="confirm-body">Remove <strong>${escapeHtml(tenantName)}</strong> from shop <strong>${escapeHtml(shopNum)}</strong>? The shop will become available for a new tenant.</div>
  `, `
    <button class="btn btn-ghost" id="cancelBtn">Cancel</button>
    <button class="btn btn-danger-ghost" id="confirmBtn">Deassign</button>
  `);
  document.getElementById('cancelBtn').addEventListener('click', closeModal);
  document.getElementById('confirmBtn').addEventListener('click', async () => {
    await withSavingState('confirmBtn', async () => {
      await api(`/api/user/${userId}/detach-shops`, { method:'POST', body:{ shop_ids:[shopId] } });
      state.loaded.shops = false;
      closeModal();
      showToast(`${tenantName} removed from shop ${shopNum}`, 'success');
      await renderView('shops');
    }, 'Removing…');
  });
}

/* ================================================================
   USERS VIEW
   ================================================================ */
async function usersView(){
  const [users, shops] = await Promise.all([
    ensureLoaded('users','/api/user'),
    ensureLoaded('shops','/api/shop'),
  ]);

  // Calculate per-user summaries from shop data
  const userShopSummary = (uid) => {
    const owned = shops.filter(s => s.assigned_to?.id === uid);
    const totalRent = owned.reduce((sum,s)=>sum+Number(s.shop_rent||0),0);
    const totalDeposit = owned.reduce((sum,s)=>sum+Number(s.shop_deposit||0),0);
    // Nearest-expiring agreement across all of this tenant's shops (most urgent first)
    const endDates = owned.map(s => s.assigned_to?.agreement_end_date).filter(Boolean);
    const nearestEnd = endDates.length
      ? endDates.reduce((a,b) => new Date(a) < new Date(b) ? a : b)
      : null;
    return { count: owned.length, totalRent, totalDeposit, nearestEnd };
  };

  return `
  <div class="toolbar"><input class="search-input" id="tableSearch" placeholder="Search users by name, mobile, email…"></div>
  ${users.length === 0 ? emptyStateHtml('No users yet', 'Add tenants or admins to get started.', emptyIcon()) : `
  <div class="table-wrap">
    <table>
    <thead><tr><th>Name</th><th>Mobile</th><th>Role</th><th>Status</th><th class="num">Shops</th><th class="num">Monthly Rent</th><th class="num">Total Deposit</th><th>Next End Date</th><th>Days Left</th><th>Billing</th><th></th></tr></thead>
      <tbody>
              <tbody>
        ${users.map(u => {
          const summary = u.role === 'tenant' ? userShopSummary(u.id) : null;
          const endDate = summary?.nearestEnd;
          const daysHtml = endDate ? daysLeftHtml(endDate) : '—';
          const dateStr = endDate ? dateFmt(endDate) : '—';
          return `
          <tr data-search="${escapeHtml(u.name+' '+u.mobile+' '+(u.email||''))}">
            <td><strong>${escapeHtml(u.name)}</strong>${u.email ? `<div style="font-size:12px;color:var(--muted);">${escapeHtml(u.email)}</div>` : ''}</td>
            <td class="mono">${escapeHtml(u.mobile)}</td>
            <td><span class="pill role-${u.role}"><span class="pill-dot"></span>${escapeHtml(u.role)}</span></td>
            <td><span class="pill ${u.is_active ? 'active-pill' : 'inactive-pill'}"><span class="pill-dot"></span>${u.is_active ? 'active' : 'inactive'}</span></td>
            <td class="num">${summary ? summary.count : '—'}</td>
            <td class="num">${summary ? currency(summary.totalRent) : '—'}</td>
            <td class="num">${summary ? currency(summary.totalDeposit) : '—'}</td>
            <td>${dateStr}</td>
            <td>${daysHtml}</td>
            <td>${u.role === 'tenant' ? (u.rent_bill_date ? `Day ${u.rent_bill_date} · ${u.auto_rent_bill_enabled ? '<span style="color:var(--success); font-weight:600;">Auto ON</span>' : '<span style="color:var(--muted);">Auto OFF</span>'}` : '<span style="color:var(--muted);">Not set</span>') : '—'}</td>
            <td><div class="row-actions">
              ${u.role === 'tenant' ? `<button class="btn-icon" data-financial-summary="${u.id}" data-name="${escapeHtml(u.name)}" aria-label="Financial summary" title="Financial summary"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg></button>` : ''}
              ${u.role === 'tenant' ? `<button class="btn-icon" data-assign-shops="${u.id}" data-name="${escapeHtml(u.name)}" aria-label="Assign shops">${shopAssignIcon()}</button>` : ''}
              <button class="btn-icon" data-reset-pw="${u.id}" data-name="${escapeHtml(u.name)}" aria-label="Reset password" title="Reset password"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg></button>
              <button class="btn-icon" data-edit-user="${u.id}" aria-label="Edit">${editIcon()}</button>
              <button class="btn-icon" data-delete-user="${u.id}" data-name="${escapeHtml(u.name)}" aria-label="Delete">${trashIcon()}</button>
            </div></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>`}`;
}
function shopAssignIcon(){ return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l1-5h16l1 5M4 9v10a1 1 0 001 1h14a1 1 0 001-1V9M4 9h16"/></svg>`; }

function attachUserHandlers(){
  document.querySelectorAll('[data-edit-user]').forEach(btn => btn.addEventListener('click', () => openEditUserModal(Number(btn.dataset.editUser))));
  document.querySelectorAll('[data-delete-user]').forEach(btn => btn.addEventListener('click', () => confirmDelete('user', Number(btn.dataset.deleteUser), btn.dataset.name)));
  document.querySelectorAll('[data-assign-shops]').forEach(btn => btn.addEventListener('click', () => openAssignShopsModal(Number(btn.dataset.assignShops), btn.dataset.name)));
  document.querySelectorAll('[data-reset-pw]').forEach(btn => btn.addEventListener('click', () => openResetPasswordModal(Number(btn.dataset.resetPw), btn.dataset.name)));
  document.querySelectorAll('[data-financial-summary]').forEach(btn => btn.addEventListener('click', () => openFinancialSummaryModal(Number(btn.dataset.financialSummary), btn.dataset.name)));
}

/* ================================================================
   BILLING VIEW (Bills & Payments) — grouped Complex → Tenant → Year → Month,
   with a multi-select filter bar that switches to a flat filtered list.
   ================================================================ */
const BILL_STATUS_OPTIONS = [
  { value:'pending',   label:'Pending' },
  { value:'partial',   label:'Partial' },
  { value:'paid',      label:'Paid' },
  { value:'overdue',   label:'Overdue' },
  { value:'cancelled', label:'Cancelled' },
];
const MONTH_OPTIONS = Array.from({length:12},(_,i)=>({ value:String(i+1), label:new Date(2000,i).toLocaleString('en-IN',{month:'long'}) }));
const MONTH_NAMES = MONTH_OPTIONS.map(m=>m.label);

function rupeeIcon(){ return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h3c3 0 5-1.5 5-5"/></svg>`; }

function billingEnrichedData(){
  const bills = state.cache.bills || [];
  const payments = state.cache.payments || [];
  const shops = state.cache.shops || [];
  const users = state.cache.users || [];
  const complexes = state.cache.complexes || [];
  const shopById = Object.fromEntries(shops.map(s=>[s.id,s]));
  const userById = Object.fromEntries(users.map(u=>[u.id,u]));
  const complexById = Object.fromEntries(complexes.map(c=>[c.id,c]));
  const paymentsByBill = {};
  payments.forEach(p => { if (!paymentsByBill[p.bill_id]) paymentsByBill[p.bill_id] = []; paymentsByBill[p.bill_id].push(p); });
  const now = new Date();
  const list = bills.map(b => {
    const shop = shopById[b.shop_id];
    const user = userById[b.user_id];
    const cid = shop ? (shop.complex_id ?? null) : null;
    const d = b.bill_date ? new Date(b.bill_date) : (b.created_at ? new Date(b.created_at) : null);
    return {
      ...b,
      shop, user,
      complexId: cid,
      complexName: cid != null ? (complexById[cid]?.name || `#${cid}`) : 'Unassigned',
      year: d ? d.getFullYear() : null,
      month: d ? d.getMonth()+1 : null,
      payments: paymentsByBill[b.id] || [],
      isOverdue: b.status !== 'paid' && b.status !== 'cancelled' && b.due_date && new Date(b.due_date) < now,
    };
  });
  return { list, shops, users, complexes };
}

function billingActiveFiltersCount(){
  const f = state.billing.filters;
  return f.status.length + f.complexIds.length + f.typeSet.length + f.years.length + f.months.length + (f.search.trim() ? 1 : 0);
}

function billMatchesFilters(b, f){
  if (f.status.length && !f.status.some(s => s === 'overdue' ? b.isOverdue : b.status === s)) return false;
  if (f.complexIds.length && !f.complexIds.includes(String(b.complexId))) return false;
  if (f.typeSet.length && !f.typeSet.includes(b.bill_type)) return false;
  if (f.years.length && !f.years.includes(String(b.year))) return false;
  if (f.months.length && !f.months.includes(String(b.month))) return false;
  if (f.search.trim()){
    const q = f.search.trim().toLowerCase();
    const hay = `${b.user?.name||''} ${b.user?.mobile||''} ${b.shop?.shop_number||''} ${b.complexName} ${b.bill_type} ${b.description||''} #${b.id}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function msFieldHtml(id, label, options, selected){
  const sel = new Set((selected||[]).map(String));
  let summary;
  if (sel.size === 0) summary = 'All';
  else if (sel.size === 1) summary = options.find(o=>String(o.value)===[...sel][0])?.label || [...sel][0];
  else summary = `${sel.size} selected`;
  return `
  <div class="field ms-field">
    <label>${escapeHtml(label)}</label>
    <button type="button" class="ms-btn" id="${id}Btn" data-ms="${id}">
      <span>${escapeHtml(summary)}</span>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
    </button>
    <div class="ms-panel" id="${id}Panel">
      ${options.length===0 ? `<div class="ms-empty">No options</div>` :
        `<div class="checkbox-list" style="border:none; padding:2px; max-height:230px;">
          ${options.map(o => `<label class="checkbox-row"><input type="checkbox" class="ms-check" data-ms="${id}" value="${escapeHtml(String(o.value))}" ${sel.has(String(o.value))?'checked':''}> ${escapeHtml(o.label)}</label>`).join('')}
        </div>`}
    </div>
  </div>`;
}

function initMsFields(ids, onChange){
  ids.forEach(id => {
    const btn = document.getElementById(id+'Btn');
    const panel = document.getElementById(id+'Panel');
    if (!btn || !panel) return;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = panel.classList.contains('open');
      document.querySelectorAll('.ms-panel.open').forEach(p => p.classList.remove('open'));
      if (!isOpen) panel.classList.add('open');
    });
    panel.addEventListener('click', (e) => e.stopPropagation());
    panel.querySelectorAll('.ms-check').forEach(cb => {
      cb.addEventListener('change', () => {
        const values = Array.from(panel.querySelectorAll('.ms-check:checked')).map(c=>c.value);
        const optLabelMap = {};
        panel.querySelectorAll('.ms-check').forEach(c => { optLabelMap[c.value] = c.closest('.checkbox-row').textContent.trim(); });
        const summaryEl = btn.querySelector('span');
        if (values.length === 0) summaryEl.textContent = 'All';
        else if (values.length === 1) summaryEl.textContent = optLabelMap[values[0]] || values[0];
        else summaryEl.textContent = `${values.length} selected`;
        onChange(id, values);
      });
    });
  });
  if (!window.__msGlobalClickBound){
    document.addEventListener('click', () => document.querySelectorAll('.ms-panel.open').forEach(p => p.classList.remove('open')));
    window.__msGlobalClickBound = true;
  }
}

async function billingView(){
  await Promise.all([
    ensureLoaded('bills','/api/bill'),
    ensureLoaded('payments','/api/payment'),
    ensureLoaded('users','/api/user'),
    ensureLoaded('shops','/api/shop'),
    ensureLoaded('complexes','/api/complex'),
  ]);
  updatePendingBadge(state.cache.bills.filter(b=>b.status!=='paid').length);

  // Apply any filter requested from the dashboard's "at a glance" cards
  if (pendingBillsViewFilter) {
    const g = pendingBillsViewFilter;
    const f = state.billing.filters;
    const now = new Date();
    if (g === 'overdue') f.status = ['overdue'];
    else if (g === 'partial') f.status = ['partial'];
    else if (g === 'paid') f.status = ['paid'];
    else if (g === 'outstanding') f.status = ['pending','partial'];
    else if (g === 'due-this-month') { f.status = ['pending','partial']; f.years = [String(now.getFullYear())]; f.months = [String(now.getMonth()+1)]; }
    pendingBillsViewFilter = null;
  }

  const { list: allBills, complexes } = billingEnrichedData();
  const billTypes = [...new Set(allBills.map(b=>b.bill_type).filter(Boolean))].sort();
  const years = [...new Set(allBills.map(b=>b.year).filter(Boolean))].sort((a,b)=>b-a);
  const complexOptions = [
    ...complexes.map(c=>({ value:String(c.id), label:c.name })),
    ...(allBills.some(b=>b.complexId==null) ? [{ value:'null', label:'Unassigned' }] : []),
  ];

  return `
  <div class="filter-bar" id="billingFilterBar">
    <div class="field search-full">
      <label>Search</label>
      <input class="search-input" id="bfSearch" placeholder="Tenant name, shop #, complex, bill #…" value="${escapeHtml(state.billing.filters.search)}" style="max-width:100%; min-width:0; width:100%;">
    </div>
    ${msFieldHtml('bfStatus','Status', BILL_STATUS_OPTIONS, state.billing.filters.status)}
    ${msFieldHtml('bfComplex','Complex', complexOptions, state.billing.filters.complexIds)}
    ${msFieldHtml('bfType','Type', billTypes.map(t=>({value:t,label:t})), state.billing.filters.typeSet)}
    ${msFieldHtml('bfYear','Year', years.map(y=>({value:String(y),label:String(y)})), state.billing.filters.years)}
    ${msFieldHtml('bfMonth','Month', MONTH_OPTIONS, state.billing.filters.months)}
    <div class="field">
      <label>Sort</label>
      <select id="bfSort" class="sort-select">
        <option value="newest">Newest first</option>
        <option value="oldest">Oldest first</option>
        <option value="amount-high">Highest amount</option>
        <option value="amount-low">Lowest amount</option>
        <option value="pending-first">Pending first</option>
        <option value="tenant">Tenant A-Z</option>
      </select>
    </div>
    <button class="btn btn-ghost filter-clear-btn" id="bfClear">Clear filters</button>
    <span class="filter-count" id="bfCount"></span>
  </div>
  <div class="billing-toolbar">
    <button class="btn btn-primary btn-sm" id="bfAddBill">+ Add bill</button>
    <button class="btn btn-ghost btn-sm" id="bfRecordPayment">Record payment</button>
    <button class="btn btn-ghost btn-sm" id="bfGenerateRent">⟳ Generate rent bills…</button>
  </div>
  <div id="billingResults"></div>
  `;
}

function attachBillingHandlers(){
  document.getElementById('bfSort').value = state.billing.sort;

  initMsFields(['bfStatus','bfComplex','bfType','bfYear','bfMonth'], (id, values) => {
    const key = { bfStatus:'status', bfComplex:'complexIds', bfType:'typeSet', bfYear:'years', bfMonth:'months' }[id];
    state.billing.filters[key] = values;
    renderBillingResults();
  });

  let searchTimer;
  document.getElementById('bfSearch').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    const val = e.target.value;
    searchTimer = setTimeout(() => { state.billing.filters.search = val; renderBillingResults(); }, 250);
  });

  document.getElementById('bfSort').addEventListener('change', (e) => {
    state.billing.sort = e.target.value;
    renderBillingResults();
  });

  document.getElementById('bfClear').addEventListener('click', () => {
    state.billing.filters = { status:[], complexIds:[], typeSet:[], years:[], months:[], search:'' };
    renderView('billing');
  });

  document.getElementById('bfAddBill').addEventListener('click', () => openBillModal(state.billing.nav.userId));
  document.getElementById('bfRecordPayment').addEventListener('click', () => {
    if (state.billing.nav.userId){
      renderPaymentForm({ preselectedComplexId: state.billing.nav.complexId==='null'?null:Number(state.billing.nav.complexId), preselectedUserId: Number(state.billing.nav.userId) });
    } else {
      openPaymentModal();
    }
  });
  document.getElementById('bfGenerateRent').addEventListener('click', openGenerateRentBillsModal);

  renderBillingResults();
}

function renderBillingResults(){
  const container = document.getElementById('billingResults');
  if (!container) return;
  const { list: allBills } = billingEnrichedData();
  const f = state.billing.filters;
  const activeFilters = billingActiveFiltersCount() > 0;
  const countEl = document.getElementById('bfCount');

  if (activeFilters){
    const matched = allBills.filter(b => billMatchesFilters(b, f));
    if (countEl) countEl.textContent = matched.length + ' record' + (matched.length!==1?'s':'');
    container.innerHTML = billingFilteredListHtml(matched);
  } else {
    if (countEl) countEl.textContent = '';
    container.innerHTML = billingBrowseHtml(allBills);
  }
  attachBillingResultHandlers();
}

function billingFilteredListHtml(bills){
  if (bills.length === 0){
    return emptyStateHtml('No bills match your filters', 'Try adjusting or clearing filters.', emptyIcon());
  }
  const sort = state.billing.sort;
  const sorted = [...bills].sort((a,b) => {
    if (sort==='newest') return new Date(b.bill_date||b.created_at) - new Date(a.bill_date||a.created_at);
    if (sort==='oldest') return new Date(a.bill_date||a.created_at) - new Date(b.bill_date||b.created_at);
    if (sort==='amount-high') return Number(b.amount) - Number(a.amount);
    if (sort==='amount-low') return Number(a.amount) - Number(b.amount);
    if (sort==='pending-first') return Number(b.pending_amount) - Number(a.pending_amount);
    if (sort==='tenant') return (a.user?.name||'').localeCompare(b.user?.name||'');
    return 0;
  });
  return `
  <div class="table-wrap">
    <table>
      <thead><tr><th>Bill</th><th>Tenant</th><th>Shop</th><th>Complex</th><th>Type</th><th class="num">Amount</th><th class="num">Pending</th><th>Status</th><th>Bill Date</th><th>Due</th><th></th></tr></thead>
      <tbody>
        ${sorted.map(b => `
        <tr>
          <td class="mono">#${b.id}</td>
          <td>${escapeHtml(b.user?.name || `#${b.user_id}`)}</td>
          <td class="mono">${escapeHtml(b.shop?.shop_number || `#${b.shop_id}`)}</td>
          <td>${escapeHtml(b.complexName)}</td>
          <td>${escapeHtml(b.bill_type)}</td>
          <td class="num">${currency(b.amount)}</td>
          <td class="num">${currency(b.pending_amount)}</td>
          <td>${stampHtml(b.status)}${b.isOverdue ? ' <span class="stamp pending">overdue</span>' : ''}</td>
          <td>${dateFmt(b.bill_date)}</td>
          <td>${dateFmt(b.due_date)}</td>
          <td><div class="row-actions">
            ${b.status !== 'paid' ? `<button class="btn-icon" data-record-payment="${b.id}" aria-label="Record payment">${rupeeIcon()}</button>` : ''}
            <button class="btn-icon" data-edit-bill="${b.id}" aria-label="Edit bill">${editIcon()}</button>
            <button class="btn-icon" data-delete-bill="${b.id}" aria-label="Delete bill">${trashIcon()}</button>
          </div></td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

function billingModeSwitcherHtml(){
  const nav = state.billing.nav;
  if (nav.complexId || nav.userId) return '';
  const mode = nav.mode || 'tenant';
  return `
  <div class="billing-mode-switch">
    <button type="button" class="billing-mode-btn ${mode==='tenant'?'active':''}" data-billing-mode="tenant">Tenant wise</button>
    <button type="button" class="billing-mode-btn ${mode==='property'?'active':''}" data-billing-mode="property">Property wise</button>
    <button type="button" class="billing-mode-btn ${mode==='dues'?'active':''}" data-billing-mode="dues">Dues overview</button>
  </div>`;
}

function billingBreadcrumbHtml(){
  const nav = state.billing.nav;
  const complexes = state.cache.complexes;
  const users = state.cache.users;
  const mode = nav.mode || 'tenant';
  const parts = [];

  if (mode === 'tenant'){
    parts.push(`<button type="button" class="billing-crumb-seg" data-crumb="root">All tenants</button>`);
    if (nav.userId){
      const u = users.find(x=>x.id===Number(nav.userId));
      parts.push(`<button type="button" class="billing-crumb-seg" data-crumb="property">${escapeHtml(u?.name || ('#'+nav.userId))}</button>`);
    }
    if (nav.complexId){
      const cName = nav.complexId === 'null' ? 'Unassigned' : (complexes.find(c=>String(c.id)===String(nav.complexId))?.name || nav.complexId);
      parts.push(`<button type="button" class="billing-crumb-seg" data-crumb="year">${escapeHtml(cName)}</button>`);
    }
  } else {
    parts.push(`<button type="button" class="billing-crumb-seg" data-crumb="root">All properties</button>`);
    if (nav.complexId){
      const cName = nav.complexId === 'null' ? 'Unassigned' : (complexes.find(c=>String(c.id)===String(nav.complexId))?.name || nav.complexId);
      parts.push(`<button type="button" class="billing-crumb-seg" data-crumb="property">${escapeHtml(cName)}</button>`);
    }
    if (nav.userId){
      const u = users.find(x=>x.id===Number(nav.userId));
      parts.push(`<button type="button" class="billing-crumb-seg" data-crumb="year">${escapeHtml(u?.name || ('#'+nav.userId))}</button>`);
    }
  }
  if (nav.year){
    parts.push(`<button type="button" class="billing-crumb-seg" data-crumb="month">${nav.year}</button>`);
  }
  if (nav.month){
    parts.push(`<span class="billing-crumb-seg current">${MONTH_NAMES[nav.month-1]}</span>`);
  }
  return `<div class="billing-breadcrumb">${parts.join('<span class="billing-crumb-sep">›</span>')}</div>`;
}

function billingComplexPickHtml(allBills){
  const complexes = state.cache.complexes;
  const shops = state.cache.shops;
  const groups = complexes.map(c => {
    const cBills = allBills.filter(b => b.complexId === c.id);
    const tenantIds = new Set(shops.filter(s=>s.complex_id===c.id && s.assigned_to).map(s=>s.assigned_to.id));
    const pending = cBills.filter(b=>b.status!=='paid').reduce((s,b)=>s+Number(b.pending_amount||0),0);
    const collected = cBills.reduce((s,b)=>s+Number(b.paid_amount||0),0);
    return { id:c.id, name:c.name, tenantCount:tenantIds.size, pending, collected, billCount:cBills.length };
  });
  const unassignedBills = allBills.filter(b => b.complexId == null);
  if (unassignedBills.length){
    const tenantIds = new Set(unassignedBills.map(b=>b.user_id));
    groups.push({
      id:'null', name:'Unassigned', tenantCount:tenantIds.size,
      pending: unassignedBills.filter(b=>b.status!=='paid').reduce((s,b)=>s+Number(b.pending_amount||0),0),
      collected: unassignedBills.reduce((s,b)=>s+Number(b.paid_amount||0),0),
      billCount: unassignedBills.length,
    });
  }
  if (groups.length === 0){
    return emptyStateHtml('No complexes yet', 'Add a complex and assign shops to start billing.', emptyIcon());
  }
  return `
  <div class="billing-card-grid">
    ${groups.map(g => `
    <button type="button" class="card complex-stat-card billing-pick-card" data-drill-complex="${g.id}">
      <div class="c-name">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M5 21V7l7-4 7 4v14"/></svg>
        ${escapeHtml(g.name)}
      </div>
      <div class="complex-stat-grid">
        <div class="complex-stat-item"><div class="csi-val">${g.tenantCount}</div><div class="csi-label">Tenants</div></div>
        <div class="complex-stat-item"><div class="csi-val">${g.billCount}</div><div class="csi-label">Bills</div></div>
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:10px; padding-top:10px; border-top:1px dashed var(--line);">
        <div><div style="font-size:10.5px; color:var(--muted); text-transform:uppercase; letter-spacing:.04em; font-weight:600;">Collected</div><div style="font-family:var(--font-mono); font-weight:700; color:var(--green-deep); font-size:14px;">${currency(g.collected)}</div></div>
        <div><div style="font-size:10.5px; color:var(--muted); text-transform:uppercase; letter-spacing:.04em; font-weight:600;">Pending</div><div style="font-family:var(--font-mono); font-weight:700; color:${g.pending>0?'var(--rust)':'var(--success)'}; font-size:14px;">${currency(g.pending)}</div></div>
      </div>
    </button>`).join('')}
  </div>`;
}

function billingTenantPickForComplexHtml(allBills, complexIdVal){
  const shops = state.cache.shops;
  const users = state.cache.users;
  const complexBills = allBills.filter(b => b.complexId === complexIdVal);
  const tenantIds = new Set(complexBills.map(b=>b.user_id));
  if (complexIdVal != null){
    shops.filter(s=>s.complex_id===complexIdVal && s.assigned_to).forEach(s=>tenantIds.add(s.assigned_to.id));
  }
  const rows = [...tenantIds].map(uid => {
    const u = users.find(x=>x.id===uid);
    const uBills = complexBills.filter(b=>b.user_id===uid);
    const pending = uBills.filter(b=>b.status==='pending').reduce((s,b)=>s+Number(b.pending_amount||0),0);
    const partial = uBills.filter(b=>b.status==='partial').reduce((s,b)=>s+Number(b.pending_amount||0),0);
    const paid = uBills.reduce((s,b)=>s+Number(b.paid_amount||0),0);
    return { id:uid, name: u?.name || `#${uid}`, mobile: u?.mobile || '', billCount: uBills.length, pending, partial, paid };
  }).sort((a,b)=>a.name.localeCompare(b.name));

  if (rows.length === 0){
    return emptyStateHtml('No tenants here yet', 'Assign shops in this complex to a tenant to start billing them.', emptyIcon());
  }
  return `
  <div class="table-wrap">
    <table>
      <thead><tr><th>Tenant</th><th class="num">Bills</th><th class="num">Pending</th><th class="num">Partial</th><th class="num">Paid</th><th></th></tr></thead>
      <tbody>
        ${rows.map(r => `
        <tr class="billing-pick-row" data-drill-user="${r.id}">
          <td><strong>${escapeHtml(r.name)}</strong><div class="mono" style="font-size:12px; color:var(--muted);">${escapeHtml(r.mobile)}</div></td>
          <td class="num">${r.billCount}</td>
          <td class="num" style="color:${r.pending>0?'var(--rust)':'inherit'};">${currency(r.pending)}</td>
          <td class="num" style="color:${r.partial>0?'var(--partial)':'inherit'};">${currency(r.partial)}</td>
          <td class="num" style="color:var(--green-deep);">${currency(r.paid)}</td>
          <td class="billing-open-link">Open →</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

function billingTenantPickHtml(allBills){
  const shops = state.cache.shops;
  const users = state.cache.users;
  const tenantIds = new Set(allBills.map(b=>b.user_id));
  shops.filter(s=>s.assigned_to).forEach(s=>tenantIds.add(s.assigned_to.id));
  const rows = [...tenantIds].map(uid => {
    const u = users.find(x=>x.id===uid);
    const uBills = allBills.filter(b=>b.user_id===uid);
    const billed = uBills.reduce((s,b)=>s+Number(b.amount||0),0);
    const received = uBills.reduce((s,b)=>s+Number(b.paid_amount||0),0);
    const pending = billed - received;
    const propertyIds = new Set(uBills.map(b=>b.complexId));
    shops.filter(s=>s.assigned_to && s.assigned_to.id===uid).forEach(s=>propertyIds.add(s.complex_id ?? null));
    return { id:uid, name: u?.name || `#${uid}`, mobile: u?.mobile || '', billCount: uBills.length, propertyCount: propertyIds.size, billed, received, pending };
  }).sort((a,b)=>a.name.localeCompare(b.name));

  if (rows.length === 0){
    return emptyStateHtml('No tenants yet', 'Assign shops to a tenant to start billing them.', emptyIcon());
  }
  return `
  <div class="table-wrap">
    <table>
      <thead><tr><th>Tenant</th><th class="num">Properties</th><th class="num">Bills</th><th class="num">Billed</th><th class="num">Received</th><th class="num">Pending</th><th></th></tr></thead>
      <tbody>
        ${rows.map(r => `
        <tr class="billing-pick-row" data-drill-user="${r.id}">
          <td><strong>${escapeHtml(r.name)}</strong><div class="mono" style="font-size:12px; color:var(--muted);">${escapeHtml(r.mobile)}</div></td>
          <td class="num">${r.propertyCount}</td>
          <td class="num">${r.billCount}</td>
          <td class="num">${currency(r.billed)}</td>
          <td class="num" style="color:var(--green-deep);">${currency(r.received)}</td>
          <td class="num" style="color:${r.pending>0?'var(--rust)':'inherit'};">${currency(r.pending)}</td>
          <td class="billing-open-link">Open →</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

function billingPropertyPickHtml(allBills, userIdVal){
  const complexes = state.cache.complexes;
  const shops = state.cache.shops;
  const userBills = allBills.filter(b=>b.user_id===userIdVal);
  const propertyIds = new Set(userBills.map(b=>b.complexId));
  shops.filter(s=>s.assigned_to && s.assigned_to.id===userIdVal).forEach(s=>propertyIds.add(s.complex_id ?? null));

  const groups = [...propertyIds].map(cid => {
    const cBills = userBills.filter(b=>b.complexId===cid);
    const billed = cBills.reduce((s,b)=>s+Number(b.amount||0),0);
    const received = cBills.reduce((s,b)=>s+Number(b.paid_amount||0),0);
    const pending = billed - received;
    const name = cid==null ? 'Unassigned' : (complexes.find(c=>c.id===cid)?.name || `#${cid}`);
    return { id: cid==null?'null':cid, name, billed, received, pending, billCount: cBills.length };
  }).sort((a,b)=>a.name.localeCompare(b.name));

  if (groups.length === 0){
    return emptyStateHtml('No properties for this tenant yet', 'Assign a shop to this tenant to start billing them.', emptyIcon());
  }
  return `
  <div class="billing-card-grid">
    ${groups.map(g => `
    <button type="button" class="card complex-stat-card billing-pick-card" data-drill-property="${g.id}">
      <div class="c-name">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M5 21V7l7-4 7 4v14"/></svg>
        ${escapeHtml(g.name)}
      </div>
      <div style="font-size:12px; color:var(--muted); margin-bottom:8px;">${g.billCount} bill${g.billCount!==1?'s':''}</div>
      <div class="billing-stat-line"><span>Billed</span><strong>${currency(g.billed)}</strong></div>
      <div class="billing-stat-line"><span>Received</span><strong style="color:var(--green-deep);">${currency(g.received)}</strong></div>
      <div class="billing-stat-line"><span>Pending</span><strong style="color:${g.pending>0?'var(--rust)':'var(--success)'};">${currency(g.pending)}</strong></div>
    </button>`).join('')}
  </div>`;
}

function billingBrowseHtml(allBills){
  const nav = state.billing.nav;
  const users = state.cache.users;
  const mode = nav.mode || 'tenant';
  const modeSwitcher = billingModeSwitcherHtml();

  if (mode === 'dues'){
    return modeSwitcher + billingDuesOverviewHtml(allBills);
  }

  const crumb = billingBreadcrumbHtml();

  if (mode === 'tenant'){
    if (!nav.userId){
      return modeSwitcher + crumb + billingTenantPickHtml(allBills);
    }
    if (!nav.complexId){
      return modeSwitcher + crumb + billingPropertyPickHtml(allBills, Number(nav.userId));
    }
  } else {
    if (!nav.complexId){
      return modeSwitcher + crumb + billingComplexPickHtml(allBills);
    }
    if (!nav.userId){
      const complexIdVal = nav.complexId === 'null' ? null : Number(nav.complexId);
      return modeSwitcher + crumb + billingTenantPickForComplexHtml(allBills, complexIdVal);
    }
  }

  const complexIdVal = nav.complexId === 'null' ? null : Number(nav.complexId);
  const userIdVal = Number(nav.userId);
  const tenantBills = allBills.filter(b => b.complexId === complexIdVal && b.user_id === userIdVal);
  const tenant = users.find(u=>u.id===userIdVal);

  if (!nav.year){
    const yrs = [...new Set(tenantBills.map(b=>b.year).filter(Boolean))].sort((a,b)=>b-a);
    if (yrs.length === 0){
      return crumb + `
      <div class="billing-inline-actions">
        <button class="btn btn-primary btn-sm" data-add-bill-for="${userIdVal}">+ Add bill for ${escapeHtml(tenant?.name||'tenant')}</button>
      </div>
      ` + emptyStateHtml('No bills yet for this tenant here', 'Create the first bill to get started.', emptyIcon());
    }
    return crumb + `
    <div class="billing-card-grid billing-year-grid">
      ${yrs.map(y => {
        const yBills = tenantBills.filter(b=>b.year===y);
        const billed = yBills.reduce((s,b)=>s+Number(b.amount||0),0);
        const received = yBills.reduce((s,b)=>s+Number(b.paid_amount||0),0);
        const remaining = billed - received;
        return `
        <button type="button" class="card billing-pick-card billing-year-card" data-drill-year="${y}">
          <div class="billing-year-num">${y}</div>
          <div style="font-size:12px; color:var(--muted); margin-bottom:8px;">${yBills.length} bill${yBills.length!==1?'s':''}</div>
          <div class="billing-stat-line"><span>Billed</span><strong>${currency(billed)}</strong></div>
          <div class="billing-stat-line"><span>Received</span><strong style="color:var(--green-deep);">${currency(received)}</strong></div>
          <div class="billing-stat-line"><span>Remaining</span><strong style="color:${remaining>0?'var(--rust)':'var(--success)'};">${currency(remaining)}</strong></div>
        </button>`;
      }).join('')}
    </div>`;
  }

  const yearVal = Number(nav.year);
  const yearBills = tenantBills.filter(b => b.year === yearVal);

  const monthCards = MONTH_NAMES.map((name, i) => {
    const m = i+1;
    const mBills = yearBills.filter(b=>b.month===m);
    const billed = mBills.reduce((s,b)=>s+Number(b.amount||0),0);
    const received = mBills.reduce((s,b)=>s+Number(b.paid_amount||0),0);
    const remaining = billed - received;
    const selected = nav.month === m;
    return `
    <button type="button" class="card billing-pick-card billing-month-card ${selected?'selected':''} ${mBills.length===0?'empty':''}" data-drill-month="${m}">
      <div class="billing-month-name">${name}</div>
      ${mBills.length ? `
      <div style="font-size:11px; color:var(--muted); margin-bottom:4px;">${mBills.length} bill${mBills.length!==1?'s':''}</div>
      <div class="billing-stat-line small"><span>Billed</span><strong>${currency(billed)}</strong></div>
      <div class="billing-stat-line small"><span>Recv</span><strong style="color:var(--green-deep);">${currency(received)}</strong></div>
      <div class="billing-stat-line small"><span>Rem</span><strong style="color:${remaining>0?'var(--rust)':'var(--success)'};">${currency(remaining)}</strong></div>
      ` : `<div style="font-size:12px; color:var(--muted);">—</div>`}
    </button>`;
  }).join('');

  let detail = '';
  if (nav.month){
    const mBills = yearBills.filter(b=>b.month===nav.month).sort((a,b)=>new Date(b.bill_date)-new Date(a.bill_date));
    const mPayments = mBills.flatMap(b => b.payments.map(p => ({ ...p, bill: b })));
    const billed = mBills.reduce((s,b)=>s+Number(b.amount||0),0);
    const received = mBills.reduce((s,b)=>s+Number(b.paid_amount||0),0);
    const remaining = billed - received;
    const tab = nav.tab === 'payments' ? 'payments' : 'bills';

    detail = `
    <div class="billing-month-detail">
      <div class="billing-inline-actions">
        <button class="btn btn-primary btn-sm" data-add-bill-for="${userIdVal}">+ Add bill</button>
        <button class="btn btn-ghost btn-sm" data-record-payment-for="${userIdVal}">Record payment</button>
      </div>
      <div class="billing-month-summary">
        <div class="billing-stat-line"><span>Billed</span><strong>${currency(billed)}</strong></div>
        <div class="billing-stat-line"><span>Received</span><strong style="color:var(--green-deep);">${currency(received)}</strong></div>
        <div class="billing-stat-line"><span>Remaining</span><strong style="color:${remaining>0?'var(--rust)':'var(--success)'};">${currency(remaining)}</strong></div>
      </div>
      <div class="billing-tab-bar">
        <button type="button" class="billing-tab-btn ${tab==='bills'?'active':''}" data-billing-tab="bills">Bills <span class="billing-tab-count">${mBills.length}</span></button>
        <button type="button" class="billing-tab-btn ${tab==='payments'?'active':''}" data-billing-tab="payments">Payments <span class="billing-tab-count">${mPayments.length}</span></button>
      </div>
      ${tab === 'bills' ? billingBillsByTypeHtml(mBills) : billingPaymentsByDateHtml(mPayments)}
    </div>`;
  }

  return crumb + `<div class="billing-card-grid billing-month-grid">${monthCards}</div>` + detail;
}

function billingBillsByTypeHtml(mBills){
  if (mBills.length === 0) return emptyStateHtml('No bills this month', 'Use "+ Add bill" to create one.', emptyIcon());
  const types = [...new Set(mBills.map(b=>b.bill_type))].sort();
  return types.map(type => {
    const bills = mBills.filter(b=>b.bill_type===type);
    const billed = bills.reduce((s,b)=>s+Number(b.amount||0),0);
    const received = bills.reduce((s,b)=>s+Number(b.paid_amount||0),0);
    const remaining = billed - received;
    return `
    <div class="collapsible-section billing-group-section">
      <div class="collapsible-header" onclick="toggleCollapse(this)">
        <h3>${escapeHtml(type)} <span class="billing-group-count">(${bills.length})</span></h3>
        <div class="billing-group-header-right">
          <span class="billing-group-totals">
            <span>Billed <strong class="mono">${currency(billed)}</strong></span>
            <span>Recv <strong class="mono" style="color:var(--green-deep);">${currency(received)}</strong></span>
            <span>Rem <strong class="mono" style="color:${remaining>0?'var(--rust)':'var(--success)'};">${currency(remaining)}</strong></span>
          </span>
          <svg class="collapsible-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
      </div>
      <div class="collapsible-body">
      ${bills.map(b => `
      <div class="billing-bill-card">
        <div class="billing-bill-head">
          <div>
            <strong>${escapeHtml(b.bill_type)}</strong> <span class="mono" style="color:var(--muted);">#${b.id}</span>
            ${b.description ? `<div style="font-size:12px; color:var(--muted); margin-top:2px;">${escapeHtml(b.description)}</div>` : ''}
          </div>
          <div style="text-align:right;">
            ${stampHtml(b.status)}${b.isOverdue ? ' <span class="stamp pending">overdue</span>' : ''}
            <div style="font-family:var(--font-mono); font-weight:700; margin-top:4px;">${currency(b.amount)}</div>
          </div>
        </div>
        <div class="billing-bill-meta">
          <span>Bill date: ${dateFmt(b.bill_date)}</span>
          <span>Due: ${dateFmt(b.due_date)}</span>
          <span>Paid: ${currency(b.paid_amount)}</span>
          <span>Pending: ${currency(b.pending_amount)}</span>
        </div>
        <div class="row-actions" style="margin-top:8px;">
          ${b.status !== 'paid' ? `<button class="btn btn-ghost btn-sm" data-record-payment="${b.id}">Record payment</button>` : ''}
          <button class="btn-icon" data-edit-bill="${b.id}" aria-label="Edit bill">${editIcon()}</button>
          <button class="btn-icon" data-delete-bill="${b.id}" aria-label="Delete bill">${trashIcon()}</button>
        </div>
      </div>`).join('')}
      </div>
    </div>`;
  }).join('');
}

function billingPaymentsByDateHtml(mPayments){
  if (mPayments.length === 0) return emptyStateHtml('No payments recorded for this month\'s bills', 'Use "Record payment" to add one.', emptyIcon());
  const dateKeys = [...new Set(mPayments.map(p=>p.payment_date))].sort((a,b)=>new Date(b)-new Date(a));
  return dateKeys.map(dateKey => {
    const pays = mPayments.filter(p=>p.payment_date===dateKey).sort((a,b)=>b.id-a.id);
    const total = pays.reduce((s,p)=>s+Number(p.amount||0),0);
    return `
    <div class="collapsible-section billing-group-section">
      <div class="collapsible-header" onclick="toggleCollapse(this)">
        <h3>${dateFmt(dateKey)} <span class="billing-group-count">(${pays.length})</span></h3>
        <div class="billing-group-header-right">
          <span class="billing-group-totals"><strong class="mono" style="color:var(--green-deep);">${currency(total)}</strong></span>
          <svg class="collapsible-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
      </div>
      <div class="collapsible-body">
      <div class="billing-payments-list">
        ${pays.map(p => `
        <div class="billing-payment-row">
          <span>${escapeHtml(p.payment_method)} · <span class="mono" style="color:var(--muted);">Bill #${p.bill.id} (${escapeHtml(p.bill.bill_type)})</span></span>
          <span class="mono">${currency(p.amount)}</span>
          <span class="row-actions">
            <button class="btn-icon" data-edit-payment="${p.id}" aria-label="Edit payment">${editIcon()}</button>
            <button class="btn-icon" data-delete-payment="${p.id}" aria-label="Delete payment">${trashIcon()}</button>
          </span>
        </div>`).join('')}
      </div>
      </div>
    </div>`;
  }).join('');
}

/* ----------------------------------------------------------------
   DUES OVERVIEW — a third billing mode: a portfolio-wide (all
   tenants combined) arrears ledger.

   Year cards  -> previous-years pending, this-year pending,
                  total billed, received, and total outstanding.
   Month cards -> the same five numbers scoped to a month, with
                  "previous" running cumulatively from day one.
   Month detail -> every bill raised and every payment received
                  that month, grouped by the shared date, collapsed
                  by default and expandable per date.
   ---------------------------------------------------------------- */
function billingDuesBreadcrumbHtml(){
  const nav = state.billing.nav;
  const parts = [`<button type="button" class="billing-crumb-seg" data-dues-crumb="root">Dues overview</button>`];
  if (nav.year) parts.push(`<button type="button" class="billing-crumb-seg" data-dues-crumb="year">${escapeHtml(String(nav.year))}</button>`);
  if (nav.month) parts.push(`<span class="billing-crumb-seg current">${MONTH_NAMES[Number(nav.month)-1]}</span>`);
  return `<div class="billing-breadcrumb">${parts.join('<span class="billing-crumb-sep">›</span>')}</div>`;
}

function billingDuesYearStats(allBills, allPayments, year){
  const prevPending = allBills.filter(b => b.year != null && b.year < year && b.status !== 'paid')
    .reduce((s,b)=>s+Number(b.pending_amount||0),0);
  const thisPending = allBills.filter(b => b.year === year && b.status !== 'paid')
    .reduce((s,b)=>s+Number(b.pending_amount||0),0);
  const totalBilled = allBills.filter(b => b.year === year)
    .reduce((s,b)=>s+Number(b.amount||0),0);
  const received = allPayments.filter(p => p.payment_date && new Date(p.payment_date).getFullYear() === year)
    .reduce((s,p)=>s+Number(p.amount||0),0);
  return { prevPending, thisPending, totalBilled, received, totalPending: prevPending + thisPending };
}

function billingDuesMonthStats(allBills, allPayments, year, month){
  const isBefore = b => b.year < year || (b.year === year && b.month < month);
  const prevPending = allBills.filter(b => b.year != null && isBefore(b) && b.status !== 'paid')
    .reduce((s,b)=>s+Number(b.pending_amount||0),0);
  const thisPending = allBills.filter(b => b.year === year && b.month === month && b.status !== 'paid')
    .reduce((s,b)=>s+Number(b.pending_amount||0),0);
  const totalBilled = allBills.filter(b => b.year === year && b.month === month)
    .reduce((s,b)=>s+Number(b.amount||0),0);
  const received = allPayments.filter(p => {
    if (!p.payment_date) return false;
    const d = new Date(p.payment_date);
    return d.getFullYear() === year && d.getMonth()+1 === month;
  }).reduce((s,p)=>s+Number(p.amount||0),0);
  return { prevPending, thisPending, totalBilled, received, totalPending: prevPending + thisPending };
}

function billingDuesStatLinesHtml(s, opts){
  const { small=false, thisLabel='Pending', highlightLast=true } = opts || {};
  const cls = small ? ' small' : '';
  const labels = small
    ? { prev:'Prev', total:'Bill', recv:'Recv', pend:'Due' }
    : { prev:'Previous dues', total:'Total bill', recv:'Received', pend:'Current pending' };
  const lastStyle = highlightLast ? ' style="border-top:1px dashed var(--line); margin-top:4px; padding-top:5px;"' : '';
  return `
    <div class="billing-stat-line${cls}"><span>${labels.prev}</span><strong style="color:${s.prevPending>0?'var(--rust)':'inherit'};">${currency(s.prevPending)}</strong></div>
    <div class="billing-stat-line${cls}"><span>${escapeHtml(thisLabel)}</span><strong style="color:${s.thisPending>0?'var(--rust)':'inherit'};">${currency(s.thisPending)}</strong></div>
    <div class="billing-stat-line${cls}"><span>${labels.total}</span><strong>${currency(s.totalBilled)}</strong></div>
    <div class="billing-stat-line${cls}"><span>${labels.recv}</span><strong style="color:var(--green-deep);">${currency(s.received)}</strong></div>
    <div class="billing-stat-line${cls}"${lastStyle}><span>${labels.pend}</span><strong style="color:${s.totalPending>0?'var(--rust)':'var(--success)'};">${currency(s.totalPending)}</strong></div>`;
}

function billingDuesYearCardsHtml(allBills, allPayments){
  const billYears = allBills.map(b=>b.year).filter(Boolean);
  const paymentYears = allPayments.map(p=>p.payment_date ? new Date(p.payment_date).getFullYear() : null).filter(Boolean);
  const years = [...new Set([...billYears, ...paymentYears])].sort((a,b)=>b-a);
  if (years.length === 0){
    return emptyStateHtml('No billing history yet', 'Bills and payments will appear here once created.', emptyIcon());
  }
  return `
  <div class="billing-card-grid billing-year-grid billing-dues-year-grid">
    ${years.map(y => `
    <button type="button" class="card billing-pick-card billing-year-card" data-dues-drill-year="${y}">
      <div class="billing-year-num">${y}</div>
      ${billingDuesStatLinesHtml(billingDuesYearStats(allBills, allPayments, y), { thisLabel:'This year pending' })}
    </button>`).join('')}
  </div>`;
}

function billingDuesMonthCardsHtml(allBills, allPayments, year){
  const nav = state.billing.nav;
  const cards = MONTH_NAMES.map((name, i) => {
    const m = i+1;
    const selected = Number(nav.month) === m;
    return `
    <button type="button" class="card billing-pick-card billing-month-card ${selected?'selected':''}" data-dues-drill-month="${m}">
      <div class="billing-month-name">${name}</div>
      ${billingDuesStatLinesHtml(billingDuesMonthStats(allBills, allPayments, year, m), { small:true, thisLabel:'This mo.' })}
    </button>`;
  }).join('');
  return `<div class="billing-card-grid billing-month-grid billing-dues-month-grid">${cards}</div>`;
}

function billingDuesDateGroupsHtml(allBills, allPayments, year, month){
  const mBills = allBills.filter(b => b.year === year && b.month === month);
  const mPayments = allPayments.filter(p => {
    if (!p.payment_date) return false;
    const d = new Date(p.payment_date);
    return d.getFullYear() === year && d.getMonth()+1 === month;
  });
  const dateKeys = new Set();
  mBills.forEach(b => { if (b.bill_date) dateKeys.add(String(b.bill_date).slice(0,10)); });
  mPayments.forEach(p => { if (p.payment_date) dateKeys.add(String(p.payment_date).slice(0,10)); });
  if (dateKeys.size === 0){
    return emptyStateHtml('No activity this month', 'No bills were raised and no payments were recorded yet.', emptyIcon());
  }
  const sortedDates = [...dateKeys].sort((a,b)=> new Date(b) - new Date(a));
  return sortedDates.map(dateKey => {
    const dBills = mBills.filter(b => String(b.bill_date||'').slice(0,10) === dateKey);
    const dPayments = mPayments.filter(p => String(p.payment_date||'').slice(0,10) === dateKey);
    const billedAmt = dBills.reduce((s,b)=>s+Number(b.amount||0),0);
    const receivedAmt = dPayments.reduce((s,p)=>s+Number(p.amount||0),0);
    const count = dBills.length + dPayments.length;
    return `
    <div class="collapsible-section billing-group-section">
      <div class="collapsible-header" onclick="toggleCollapse(this)">
        <h3>${dateFmt(dateKey)} <span class="billing-group-count">(${count} ${count===1?'entry':'entries'})</span></h3>
        <div class="billing-group-header-right">
          <span class="billing-group-totals">
            ${dBills.length ? `<span>Billed <strong class="mono">${currency(billedAmt)}</strong></span>` : ''}
            ${dPayments.length ? `<span>Received <strong class="mono" style="color:var(--green-deep);">${currency(receivedAmt)}</strong></span>` : ''}
          </span>
          <svg class="collapsible-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
      </div>
      <div class="collapsible-body">
        ${dBills.length ? `
        <div style="font-size:12px; font-weight:600; color:var(--muted); margin-bottom:6px; text-transform:uppercase; letter-spacing:.04em;">Bills raised</div>
        ${dBills.map(b => `
        <div class="billing-payment-row" style="padding:6px 0; border-bottom:1px dashed var(--line);">
          <span><strong>${escapeHtml(b.user?.name || ('#'+b.user_id))}</strong> <span class="mono" style="color:var(--muted);">${escapeHtml(b.shop?.shop_number||'')} · ${escapeHtml(b.bill_type)} · #${b.id}</span></span>
          <span style="display:flex; gap:8px; align-items:center;">${stampHtml(b.status)}<span class="mono">${currency(b.amount)}</span></span>
        </div>`).join('')}` : ''}
        ${dPayments.length ? `
        <div style="font-size:12px; font-weight:600; color:var(--muted); margin:${dBills.length?'12px':'0'} 0 6px; text-transform:uppercase; letter-spacing:.04em;">Payments received</div>
        ${dPayments.map(p => `
        <div class="billing-payment-row" style="padding:6px 0; border-bottom:1px dashed var(--line);">
          <span><strong>${escapeHtml(p.bill.user?.name || ('#'+p.bill.user_id))}</strong> <span class="mono" style="color:var(--muted);">${escapeHtml(p.bill.shop?.shop_number||'')} · ${escapeHtml(p.payment_method)} · Bill #${p.bill.id}</span></span>
          <span class="mono" style="color:var(--green-deep); font-weight:700;">${currency(p.amount)}</span>
        </div>`).join('')}` : ''}
      </div>
    </div>`;
  }).join('');
}

function billingDuesOverviewHtml(allBills){
  const nav = state.billing.nav;
  const allPayments = allBills.flatMap(b => (b.payments||[]).map(p => ({ ...p, bill: b })));
  const crumb = billingDuesBreadcrumbHtml();

  if (!nav.year){
    return crumb + billingDuesYearCardsHtml(allBills, allPayments);
  }
  const year = Number(nav.year);
  const monthCards = billingDuesMonthCardsHtml(allBills, allPayments, year);

  if (!nav.month){
    return crumb + monthCards;
  }
  const month = Number(nav.month);
  const stats = billingDuesMonthStats(allBills, allPayments, year, month);
  const detail = `
  <div class="billing-month-detail">
    <div class="billing-month-summary">${billingDuesStatLinesHtml(stats, { thisLabel:'This month pending', highlightLast:false })}</div>
    ${billingDuesDateGroupsHtml(allBills, allPayments, year, month)}
  </div>`;
  return crumb + monthCards + detail;
}

function attachBillingResultHandlers(){
  document.querySelectorAll('[data-billing-mode]').forEach(el => el.addEventListener('click', () => {
    const mode = el.dataset.billingMode;
    if (mode === (state.billing.nav.mode || 'tenant')) return;
    state.billing.nav = { mode, complexId:null, userId:null, year:null, month:null, tab:'bills' };
    renderBillingResults();
  }));
  document.querySelectorAll('[data-drill-complex]').forEach(el => el.addEventListener('click', () => {
    state.billing.nav = { mode: state.billing.nav.mode, complexId: el.dataset.drillComplex, userId:null, year:null, month:null, tab:'bills' };
    renderBillingResults();
  }));
  document.querySelectorAll('[data-drill-property]').forEach(el => el.addEventListener('click', () => {
    state.billing.nav.complexId = el.dataset.drillProperty;
    state.billing.nav.year = null;
    state.billing.nav.month = null;
    state.billing.nav.tab = 'bills';
    renderBillingResults();
  }));
  document.querySelectorAll('[data-drill-user]').forEach(el => el.addEventListener('click', () => {
    state.billing.nav.userId = el.dataset.drillUser;
    state.billing.nav.year = null;
    state.billing.nav.month = null;
    state.billing.nav.tab = 'bills';
    renderBillingResults();
  }));
  document.querySelectorAll('[data-drill-year]').forEach(el => el.addEventListener('click', () => {
    state.billing.nav.year = el.dataset.drillYear;
    state.billing.nav.month = null;
    state.billing.nav.tab = 'bills';
    renderBillingResults();
  }));
  document.querySelectorAll('[data-drill-month]').forEach(el => el.addEventListener('click', () => {
    const m = Number(el.dataset.drillMonth);
    state.billing.nav.month = state.billing.nav.month === m ? null : m;
    state.billing.nav.tab = 'bills';
    renderBillingResults();
  }));
  document.querySelectorAll('[data-billing-tab]').forEach(el => el.addEventListener('click', () => {
    state.billing.nav.tab = el.dataset.billingTab;
    renderBillingResults();
  }));

  // Dues overview mode: year -> month -> date-grouped bills/payments.
  document.querySelectorAll('[data-dues-drill-year]').forEach(el => el.addEventListener('click', () => {
    state.billing.nav.year = el.dataset.duesDrillYear;
    state.billing.nav.month = null;
    renderBillingResults();
  }));
  document.querySelectorAll('[data-dues-drill-month]').forEach(el => el.addEventListener('click', () => {
    const m = Number(el.dataset.duesDrillMonth);
    state.billing.nav.month = state.billing.nav.month === m ? null : m;
    renderBillingResults();
  }));
  document.querySelectorAll('[data-dues-crumb]').forEach(el => el.addEventListener('click', () => {
    const level = el.dataset.duesCrumb;
    if (level === 'root'){ state.billing.nav.year = null; state.billing.nav.month = null; }
    else if (level === 'year'){ state.billing.nav.month = null; }
    renderBillingResults();
  }));

  document.querySelectorAll('[data-crumb]').forEach(el => el.addEventListener('click', () => {
    const level = el.dataset.crumb;
    const mode = state.billing.nav.mode || 'tenant';
    if (level === 'root') state.billing.nav = { mode, complexId:null, userId:null, year:null, month:null, tab:'bills' };
    else if (level === 'property'){
      if (mode === 'tenant') state.billing.nav = { ...state.billing.nav, complexId:null, year:null, month:null, tab:'bills' };
      else state.billing.nav = { ...state.billing.nav, userId:null, year:null, month:null, tab:'bills' };
    }
    else if (level === 'year') state.billing.nav = { ...state.billing.nav, year:null, month:null, tab:'bills' };
    else if (level === 'month') state.billing.nav = { ...state.billing.nav, month:null, tab:'bills' };
    renderBillingResults();
  }));

  document.querySelectorAll('[data-add-bill-for]').forEach(el => el.addEventListener('click', () => openBillModal(Number(el.dataset.addBillFor))));
  document.querySelectorAll('[data-record-payment-for]').forEach(el => el.addEventListener('click', () => {
    renderPaymentForm({ preselectedComplexId: state.billing.nav.complexId==='null'?null:Number(state.billing.nav.complexId), preselectedUserId: Number(el.dataset.recordPaymentFor) });
  }));

  document.querySelectorAll('[data-record-payment]').forEach(btn => btn.addEventListener('click', () => openRecordPaymentModal(Number(btn.dataset.recordPayment))));
  document.querySelectorAll('[data-edit-bill]').forEach(btn => btn.addEventListener('click', () => openEditBillModal(Number(btn.dataset.editBill))));
  document.querySelectorAll('[data-delete-bill]').forEach(btn => btn.addEventListener('click', () => {
    const bill = state.cache.bills.find(x => x.id === Number(btn.dataset.deleteBill));
    if (bill) confirmDeleteBill(bill);
  }));
  document.querySelectorAll('[data-edit-payment]').forEach(btn => btn.addEventListener('click', () => openEditPaymentModal(Number(btn.dataset.editPayment))));
  document.querySelectorAll('[data-delete-payment]').forEach(btn => btn.addEventListener('click', () => {
    const pay = state.cache.payments.find(x => x.id === Number(btn.dataset.deletePayment));
    if (pay) confirmDeletePayment(pay);
  }));
}

/* ---- Manual rent-bill generation trigger ---- */
function openGenerateRentBillsModal(){
  const todayStr = new Date().toISOString().slice(0,10);
  openModal('Generate rent bills', `
    <div style="font-size:12.5px; color:var(--muted); margin-bottom:14px;">
      Auto-generates this month's Rent bill — one per assigned shop — for every active tenant with auto-billing enabled whose rent bill date matches the day picked below. This is the same job that runs automatically every night at 02:00 (Asia/Kolkata); it's safe to re-run since already-generated bills for a matching month are skipped, never duplicated.
    </div>
    <div class="field">
      <label for="grbDate">Date to generate for</label>
      <input type="date" id="grbDate" value="${todayStr}">
    </div>
    <div id="grbResult"></div>
  `, `
    <button class="btn btn-ghost" id="cancelBtn">Close</button>
    <button class="btn btn-primary" id="runBtn">Generate</button>
  `);
  document.getElementById('cancelBtn').addEventListener('click', closeModal);
  document.getElementById('runBtn').addEventListener('click', async () => {
    const date = document.getElementById('grbDate').value;
    const btn = document.getElementById('runBtn');
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> Generating…`;
    try {
      const res = await api(`/api/bills/generate-rent${date ? `?date=${date}` : ''}`, { method:'POST' });
      const createdCount = res.created?.length || 0;
      document.getElementById('grbResult').innerHTML = `
        <div class="info-card" style="margin-top:14px;">
          <div class="info-row"><span class="info-label">Users matched</span><span class="info-val">${res.users_matched}</span></div>
          <div class="info-row"><span class="info-label">Bills created</span><span class="info-val good">${createdCount}</span></div>
          <div class="info-row"><span class="info-label">Skipped — already generated</span><span class="info-val">${res.skipped_existing}</span></div>
          <div class="info-row"><span class="info-label">Skipped — zero rent</span><span class="info-val">${res.skipped_zero_rent}</span></div>
          <div class="info-row"><span class="info-label">Skipped — no shops assigned</span><span class="info-val">${res.skipped_no_shops}</span></div>
        </div>
      `;
      state.loaded.bills = false;
      showToast(`${createdCount} rent bill${createdCount !== 1 ? 's' : ''} generated`, 'success');
      if (state.view === 'billing') await renderView('billing');
    } catch(err) {
      showToast(err.message || 'Something went wrong', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = original;
    }
  });
}

/* ---- Edit / delete a single bill ---- */
function openEditBillModal(billId){
  const bill = state.cache.bills.find(b => b.id === billId);
  if (!bill){ showToast('Bill not found', 'error'); return; }
  const dueVal = bill.due_date ? new Date(bill.due_date).toISOString().slice(0,10) : '';

  openModal('Edit bill', `
    <form id="billEditForm">
      <div class="field">
        <label for="ebType">Bill type</label>
        <input id="ebType" value="${escapeHtml(bill.bill_type)}">
        ${fieldErrorHtml('ebTypeErr')}
      </div>
      <div class="field full">
        <label for="ebDesc">Description</label>
        <input id="ebDesc" value="${escapeHtml(bill.description || '')}" placeholder="Optional">
      </div>
      <div class="form-grid">
        <div class="field">
          <label for="ebAmount">Amount (₹)</label>
          <input id="ebAmount" type="number" step="0.01" min="0.01" value="${Number(bill.amount).toFixed(2)}">
          ${fieldErrorHtml('ebAmountErr')}
        </div>
        <div class="field">
          <label for="ebDue">Due date</label>
          <input id="ebDue" type="date" value="${dueVal}">
        </div>
        <div class="field">
          <label for="ebStatus">Status</label>
          <select id="ebStatus">
            <option value="pending" ${bill.status === 'pending' ? 'selected' : ''}>Pending</option>
            <option value="partial" ${bill.status === 'partial' ? 'selected' : ''}>Partial</option>
            <option value="paid" ${bill.status === 'paid' ? 'selected' : ''}>Paid</option>
            <option value="cancelled" ${bill.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
          </select>
        </div>
      </div>
      <div style="font-size:12px; color:var(--muted); margin-top:4px;">Already paid: ${currency(bill.paid_amount)}. Amount can't be reduced below this without first deleting payments.</div>
    </form>
  `, `
    <button class="btn btn-ghost" id="cancelBtn">Cancel</button>
    <button class="btn btn-danger-ghost" id="deleteBillBtn" style="margin-right:auto;">Delete bill</button>
    <button class="btn btn-primary" id="saveBtn">Save changes</button>
  `);
  document.getElementById('cancelBtn').addEventListener('click', closeModal);
  document.getElementById('deleteBillBtn').addEventListener('click', () => confirmDeleteBill(bill));

  document.getElementById('saveBtn').addEventListener('click', async () => {
    const form = document.getElementById('billEditForm');
    clearFieldErrors(form);
    const bill_type = document.getElementById('ebType').value.trim();
    const description = document.getElementById('ebDesc').value.trim();
    const amount = parseFloat(document.getElementById('ebAmount').value);
    const due = document.getElementById('ebDue').value;
    const status = document.getElementById('ebStatus').value;
    let ok = true;
    if (!bill_type){ showFieldError('ebTypeErr','Bill type is required'); document.getElementById('ebType').classList.add('invalid'); ok=false; }
    if (isNaN(amount) || amount <= 0){ showFieldError('ebAmountErr','Enter a valid amount'); document.getElementById('ebAmount').classList.add('invalid'); ok=false; }
    if (!ok) return;

    await withSavingState('saveBtn', async () => {
      await api(`/api/bill/${bill.id}`, { method:'PUT', body:{
        bill_type, description, amount,
        due_date: due ? new Date(due).toISOString() : null,
        status,
      }});
      state.loaded.bills = false;
      closeModal();
      showToast('Bill updated', 'success');
      await renderView('billing');
    });
  });
}

function confirmDeleteBill(bill){
  openModal('Delete bill', `
    <div class="confirm-body">Are you sure you want to delete bill <strong>#${bill.id} · ${escapeHtml(bill.bill_type)}</strong>? All of its payments will be deleted too. This can't be undone.</div>
  `, `
    <button class="btn btn-ghost" id="cancelBtn">Cancel</button>
    <button class="btn btn-danger-ghost" id="confirmDeleteBtn">Delete</button>
  `);
  document.getElementById('cancelBtn').addEventListener('click', closeModal);
  document.getElementById('confirmDeleteBtn').addEventListener('click', async () => {
    await withSavingState('confirmDeleteBtn', async () => {
      await api(`/api/bill/${bill.id}`, { method:'DELETE' });
      state.loaded.bills = false;
      state.loaded.payments = false;
      closeModal();
      showToast(`Bill #${bill.id} deleted`, 'success');
      await renderView('billing');
    }, 'Deleting…');
  });
}

/* ---- Edit / delete a single payment ---- */
function openEditPaymentModal(paymentId){
  const pay = state.cache.payments.find(p => p.id === paymentId);
  if (!pay){ showToast('Payment not found', 'error'); return; }
  const dateVal = pay.payment_date ? new Date(pay.payment_date).toISOString().slice(0,10) : '';

  openModal(`Edit payment #${pay.id}`, `
    <form id="paymentEditForm">
      <div class="form-grid">
        <div class="field">
          <label for="epAmount">Amount (₹)</label>
          <input id="epAmount" type="number" step="0.01" min="0.01" value="${Number(pay.amount).toFixed(2)}">
          ${fieldErrorHtml('epAmountErr')}
        </div>
        <div class="field">
          <label for="epMethod">Payment method</label>
          <input id="epMethod" value="${escapeHtml(pay.payment_method)}">
          ${fieldErrorHtml('epMethodErr')}
        </div>
        <div class="field">
          <label for="epDate">Payment date</label>
          <input id="epDate" type="date" value="${dateVal}">
        </div>
        <div class="field full">
          <label for="epRemarks">Remarks</label>
          <input id="epRemarks" value="${escapeHtml(pay.remarks || '')}" placeholder="Optional">
        </div>
      </div>
      <div style="font-size:12px; color:var(--muted); margin-top:4px;">Saving will automatically re-reconcile the parent bill's paid/pending amount and status.</div>
    </form>
  `, `
    <button class="btn btn-ghost" id="cancelBtn">Cancel</button>
    <button class="btn btn-danger-ghost" id="deletePaymentBtn" style="margin-right:auto;">Delete payment</button>
    <button class="btn btn-primary" id="saveBtn">Save changes</button>
  `);
  document.getElementById('cancelBtn').addEventListener('click', closeModal);
  document.getElementById('deletePaymentBtn').addEventListener('click', () => confirmDeletePayment(pay));

  document.getElementById('saveBtn').addEventListener('click', async () => {
    const form = document.getElementById('paymentEditForm');
    clearFieldErrors(form);
    const amount = parseFloat(document.getElementById('epAmount').value);
    const payment_method = document.getElementById('epMethod').value.trim();
    const dateStr = document.getElementById('epDate').value;
    const remarks = document.getElementById('epRemarks').value.trim();
    let ok = true;
    if (isNaN(amount) || amount <= 0){ showFieldError('epAmountErr','Enter a valid amount'); document.getElementById('epAmount').classList.add('invalid'); ok=false; }
    if (!payment_method){ showFieldError('epMethodErr','Payment method is required'); document.getElementById('epMethod').classList.add('invalid'); ok=false; }
    if (!ok) return;

    await withSavingState('saveBtn', async () => {
      await api(`/api/payment/${pay.id}`, { method:'PUT', body:{
        amount, payment_method, remarks,
        payment_date: dateStr ? new Date(dateStr).toISOString() : undefined,
      }});
      state.loaded.payments = false;
      state.loaded.bills = false;
      closeModal();
      showToast('Payment updated', 'success');
      await renderView('billing');
    });
  });
}

function confirmDeletePayment(pay){
  openModal('Delete payment', `
    <div class="confirm-body">Are you sure you want to delete payment <strong>#${pay.id}</strong> (${currency(pay.amount)})? The parent bill will be re-reconciled. This can't be undone.</div>
  `, `
    <button class="btn btn-ghost" id="cancelBtn">Cancel</button>
    <button class="btn btn-danger-ghost" id="confirmDeleteBtn">Delete</button>
  `);
  document.getElementById('cancelBtn').addEventListener('click', closeModal);
  document.getElementById('confirmDeleteBtn').addEventListener('click', async () => {
    await withSavingState('confirmDeleteBtn', async () => {
      await api(`/api/payment/${pay.id}`, { method:'DELETE' });
      state.loaded.payments = false;
      state.loaded.bills = false;
      closeModal();
      showToast(`Payment #${pay.id} deleted`, 'success');
      await renderView('billing');
    }, 'Deleting…');
  });
}

/* ================================================================
   RESET PASSWORD MODAL
   ================================================================ */
function openResetPasswordModal(userId, name){
  openModal(`Reset password — ${name}`, `
    <div class="field">
      <label for="rpNewPw">New password</label>
      <div class="pw-row">
        <input type="password" id="rpNewPw" placeholder="Min 4 characters">
        <button type="button" class="pw-toggle" id="rpPwToggle">SHOW</button>
      </div>
      ${fieldErrorHtml('rpPwErr')}
    </div>
  `, `
    <button class="btn btn-ghost" id="cancelBtn">Cancel</button>
    <button class="btn btn-primary" id="saveBtn">Reset password</button>
  `);
  document.getElementById('cancelBtn').addEventListener('click', closeModal);
  document.getElementById('rpPwToggle').addEventListener('click', () => {
    const inp = document.getElementById('rpNewPw');
    const btn = document.getElementById('rpPwToggle');
    inp.type = inp.type === 'password' ? 'text' : 'password';
    btn.textContent = inp.type === 'password' ? 'SHOW' : 'HIDE';
  });
  document.getElementById('saveBtn').addEventListener('click', async () => {
    const pw = document.getElementById('rpNewPw').value;
    if (!pw || pw.length < 4){ showFieldError('rpPwErr','Password must be at least 4 characters'); document.getElementById('rpNewPw').classList.add('invalid'); return; }
    await withSavingState('saveBtn', async () => {
      await api(`/api/user/${userId}/reset-password`, { method:'PUT', body:{ new_password: pw } });
      closeModal();
      showToast(`Password reset for ${name}`, 'success');
    });
  });
}

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
   GLOBAL SEARCH
   ================================================================ */
(function initGlobalSearch(){
  let _searchTimer;
  const input = document.getElementById('globalSearch');
  const results = document.getElementById('globalSearchResults');
  input.addEventListener('input', () => {
    clearTimeout(_searchTimer);
    const q = input.value.trim();
    if (!q){ results.style.display='none'; return; }
    _searchTimer = setTimeout(async () => {
      try {
        const data = await api(`/api/search?q=${encodeURIComponent(q)}`);
        const total = (data.users||[]).length + (data.shops||[]).length + (data.complexes||[]).length;
        if (total === 0){ results.innerHTML = '<div style="padding:14px 16px; font-size:13px; color:var(--muted);">No results found.</div>'; results.style.display='block'; return; }
        let html = '';
        if (data.users?.length){ html += `<div style="padding:8px 14px 4px; font-size:10.5px; text-transform:uppercase; letter-spacing:.07em; color:var(--muted); font-weight:700;">Users</div>` +
          data.users.map(u=>`<div class="gs-item" data-type="user" data-id="${u.id}" style="padding:9px 14px; cursor:pointer; display:flex; align-items:center; gap:9px; font-size:13.5px; border-bottom:1px solid var(--line);">
            <span class="user-avatar" style="width:26px;height:26px;font-size:11px;flex-shrink:0;">${escapeHtml(initials(u.name))}</span>
            <span><strong>${escapeHtml(u.name)}</strong> <span style="color:var(--muted);">${escapeHtml(u.mobile)}</span></span>
            <span class="pill role-${u.role}" style="margin-left:auto;">${escapeHtml(u.role)}</span>
          </div>`).join(''); }
        if (data.shops?.length){ html += `<div style="padding:8px 14px 4px; font-size:10.5px; text-transform:uppercase; letter-spacing:.07em; color:var(--muted); font-weight:700;">Shops</div>` +
          data.shops.map(s=>`<div class="gs-item" data-type="shop" style="padding:9px 14px; cursor:default; display:flex; align-items:center; gap:9px; font-size:13.5px; border-bottom:1px solid var(--line);">
            <span class="mono" style="font-weight:700;">${escapeHtml(s.shop_number)}</span>
            <span style="color:var(--muted);">${escapeHtml(s.complex_name||'')}</span>
            <span class="pill ${s.status}" style="margin-left:auto;"><span class="pill-dot"></span>${s.status}</span>
          </div>`).join(''); }
        if (data.complexes?.length){ html += `<div style="padding:8px 14px 4px; font-size:10.5px; text-transform:uppercase; letter-spacing:.07em; color:var(--muted); font-weight:700;">Complexes</div>` +
          data.complexes.map(c=>`<div class="gs-item" style="padding:9px 14px; font-size:13.5px; border-bottom:1px solid var(--line);">${escapeHtml(c.name)} <span style="color:var(--muted);">${escapeHtml(c.address||'')}</span></div>`).join(''); }
        results.innerHTML = html;
        results.style.display='block';
      } catch(e){ results.innerHTML = `<div style="padding:14px 16px; font-size:13px; color:var(--danger);">${escapeHtml(e.message)}</div>`; results.style.display='block'; }
    }, 300);
  });
  document.addEventListener('click', (e) => { if (!input.contains(e.target) && !results.contains(e.target)) results.style.display='none'; });
})();

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

/* ================================================================
   AUDIT LOG VIEW
   ================================================================ */
let auditState = { page: 1, limit: 20, user_id:'', action:'', table_name:'', start_date:'', end_date:'', search:'' };

async function auditView(){
  const users = await ensureLoaded('users','/api/user');
  let filterOptions = { actions: [], table_names: [] };
  try { filterOptions = await api('/api/audit-logs/filters'); } catch(e){}

  return `
  <div class="filter-bar">
    <div class="field search-full">
      <label>Search</label>
      <input class="search-input" id="auditSearch" placeholder="User name, mobile, action, table, record #…" value="${escapeHtml(auditState.search)}" style="max-width:100%; min-width:0; width:100%;">
    </div>
    <div class="field">
      <label>User</label>
      <select id="auditFilterUser">
        <option value="">All users</option>
        ${users.map(u=>`<option value="${u.id}" ${String(u.id)===String(auditState.user_id)?'selected':''}>${escapeHtml(u.name)}</option>`).join('')}
      </select>
    </div>
    <div class="field">
      <label>Action</label>
      <select id="auditFilterAction">
        <option value="">All actions</option>
        ${filterOptions.actions.map(a=>`<option value="${escapeHtml(a)}" ${a===auditState.action?'selected':''}>${escapeHtml(a)}</option>`).join('')}
      </select>
    </div>
    <div class="field">
      <label>Table</label>
      <select id="auditFilterTable">
        <option value="">All tables</option>
        ${filterOptions.table_names.map(t=>`<option value="${escapeHtml(t)}" ${t===auditState.table_name?'selected':''}>${escapeHtml(t)}</option>`).join('')}
      </select>
    </div>
    <div class="field">
      <label>From</label>
      <input type="date" id="auditFilterStart" value="${auditState.start_date}">
    </div>
    <div class="field">
      <label>To</label>
      <input type="date" id="auditFilterEnd" value="${auditState.end_date}">
    </div>
    <button class="btn btn-ghost filter-clear-btn" id="auditClearFilters">Clear filters</button>
    <span class="filter-count" id="auditCount"></span>
  </div>
  <div id="auditTableWrap">${skeletonHtml()}</div>
  <div id="auditPager" style="display:flex; align-items:center; justify-content:flex-end; gap:10px; margin-top:14px;"></div>
  `;
}

function attachAuditHandlers(){
  const reload = () => { auditState.page = 1; loadAuditPage(); };
  document.getElementById('auditFilterUser').addEventListener('change', e => { auditState.user_id = e.target.value; reload(); });
  document.getElementById('auditFilterAction').addEventListener('change', e => { auditState.action = e.target.value; reload(); });
  document.getElementById('auditFilterTable').addEventListener('change', e => { auditState.table_name = e.target.value; reload(); });
  document.getElementById('auditFilterStart').addEventListener('change', e => { auditState.start_date = e.target.value; reload(); });
  document.getElementById('auditFilterEnd').addEventListener('change', e => { auditState.end_date = e.target.value; reload(); });
  let searchDebounce;
  document.getElementById('auditSearch').addEventListener('input', e => {
    clearTimeout(searchDebounce);
    const val = e.target.value;
    searchDebounce = setTimeout(() => { auditState.search = val; reload(); }, 350);
  });
  document.getElementById('auditClearFilters').addEventListener('click', () => {
    auditState = { page:1, limit:20, user_id:'', action:'', table_name:'', start_date:'', end_date:'', search:'' };
    navigateTo('audit');
  });
  loadAuditPage();
}

async function loadAuditPage(){
  const wrap = document.getElementById('auditTableWrap');
  const pager = document.getElementById('auditPager');
  wrap.innerHTML = skeletonHtml();
  try {
    const params = new URLSearchParams();
    params.set('page', auditState.page);
    params.set('limit', auditState.limit);
    if (auditState.user_id) params.set('user_id', auditState.user_id);
    if (auditState.action) params.set('action', auditState.action);
    if (auditState.table_name) params.set('table_name', auditState.table_name);
    if (auditState.start_date) params.set('start_date', new Date(auditState.start_date).toISOString());
    if (auditState.end_date) params.set('end_date', new Date(new Date(auditState.end_date).setHours(23,59,59)).toISOString());
    if (auditState.search) params.set('search', auditState.search);
    const res = await api(`/api/audit-logs?${params}`);
    const rows = res.data || [];
    const countEl = document.getElementById('auditCount');
    if (countEl) countEl.textContent = res.total + ' record' + (res.total !== 1 ? 's' : '');

    wrap.innerHTML = rows.length === 0 ? emptyStateHtml('No audit log entries', 'Entries appear here as admins create, update, or delete records.', emptyIcon()) : `
    <div class="table-wrap">
      <table>
        <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Table</th><th>Record</th><th></th></tr></thead>
        <tbody>
          ${rows.map(log => `
            <tr>
              <td>${dateFmt(log.created_at)}</td>
              <td>${escapeHtml(log.user?.name || 'Unknown')}${log.user?.mobile ? ` <span style="color:var(--muted);">· ${escapeHtml(log.user.mobile)}</span>` : ''}</td>
              <td>${auditActionBadge(log.action)}</td>
              <td class="mono">${escapeHtml(log.table_name || '—')}</td>
              <td class="mono">${log.record_id ?? '—'}</td>
              <td><button class="btn-icon" data-view-audit="${log.id}" aria-label="View details">${eyeIcon()}</button></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

    document.querySelectorAll('[data-view-audit]').forEach(btn => btn.addEventListener('click', () => openAuditDetailModal(Number(btn.dataset.viewAudit))));

    const totalPages = Math.max(1, Math.ceil(res.total / auditState.limit));
    pager.innerHTML = `
      <button class="btn btn-sm btn-ghost" id="auditPrevBtn" ${auditState.page<=1?'disabled':''}>← Prev</button>
      <span style="font-size:12.5px; color:var(--muted);">Page ${auditState.page} of ${totalPages}</span>
      <button class="btn btn-sm btn-ghost" id="auditNextBtn" ${auditState.page>=totalPages?'disabled':''}>Next →</button>
    `;
    document.getElementById('auditPrevBtn')?.addEventListener('click', () => { if (auditState.page > 1){ auditState.page--; loadAuditPage(); } });
    document.getElementById('auditNextBtn')?.addEventListener('click', () => { if (auditState.page < totalPages){ auditState.page++; loadAuditPage(); } });
  } catch(err){
    wrap.innerHTML = errorBannerHtml(err.message);
    pager.innerHTML = '';
  }
}

function auditActionBadge(action){
  const a = (action||'').toUpperCase();
  const cls = a === 'DELETE' ? 'pending' : a === 'CREATE' ? 'paid' : 'partial';
  return `<span class="stamp ${cls}">${escapeHtml(action)}</span>`;
}
function eyeIcon(){ return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`; }

async function openAuditDetailModal(logId){
  openModal(`Audit log #${logId}`, `<div style="text-align:center; padding:24px 0;"><div class="spinner dark" style="margin:0 auto;"></div></div>`, `<button class="btn btn-ghost" id="cancelBtn">Close</button>`);
  document.getElementById('cancelBtn').addEventListener('click', closeModal);
  try {
    const res = await api(`/api/audit-logs/${logId}`);
    const log = res.data;
    const fmt = (v) => v == null ? '<span style="color:var(--muted);">—</span>' : `<pre style="white-space:pre-wrap; word-break:break-word; font-size:12px; margin:0;">${escapeHtml(JSON.stringify(v, null, 2))}</pre>`;
    document.getElementById('modalBody').innerHTML = `
      <div class="info-card">
        <div class="info-row"><span class="info-label">When</span><span class="info-val">${dateFmt(log.created_at)}</span></div>
        <div class="info-row"><span class="info-label">Actor</span><span class="info-val">${escapeHtml(log.user?.name || 'Unknown')} (${escapeHtml(log.user?.role || '')} · ${escapeHtml(log.user?.mobile || '')})</span></div>
        <div class="info-row"><span class="info-label">Action</span><span class="info-val">${auditActionBadge(log.action)}</span></div>
        <div class="info-row"><span class="info-label">Table</span><span class="info-val mono">${escapeHtml(log.table_name || '—')}</span></div>
        <div class="info-row"><span class="info-label">Record ID</span><span class="info-val mono">${log.record_id ?? '—'}</span></div>
      </div>
      <h4 style="font-size:13px; margin:16px 0 6px;">Before</h4>
      <div class="card card-pad" style="background:var(--paper);">${fmt(log.old_data)}</div>
      <h4 style="font-size:13px; margin:16px 0 6px;">After</h4>
      <div class="card card-pad" style="background:var(--paper);">${fmt(log.new_data)}</div>
    `;
  } catch(err){
    document.getElementById('modalBody').innerHTML = errorBannerHtml(err.message);
  }
}

/* ================================================================
   DEPOSITS VIEW
   ================================================================ */
async function depositsView(){
  const [complexes, users] = await Promise.all([ensureLoaded('complexes','/api/complex'), ensureLoaded('users','/api/user')]);
  let deposits = [];
  try { deposits = await api('/api/deposit-payment'); } catch(e){}
  state.cache.deposits = deposits;
  const userName = (id) => users.find(u=>u.id===id)?.name || `#${id}`;

  return `
  <div class="toolbar"><input class="search-input" id="tableSearch" placeholder="Search deposits…"></div>
  ${deposits.length === 0 ? emptyStateHtml('No deposit payments', 'Record the first deposit payment using the button above.', emptyIcon()) : `
  <div class="table-wrap">
    <table>
      <thead><tr><th>Tenant</th><th>Shop</th><th>Complex</th><th class="num">Amount</th><th>Date</th><th>Remarks</th><th></th></tr></thead>
      <tbody>
        ${deposits.map(d=>`
          <tr data-search="${escapeHtml((d.user_name||'')+' '+(d.shop_number||'')+' '+(d.complex_name||''))}">
            <td><strong>${escapeHtml(d.user_name||userName(d.user_id))}</strong></td>
            <td class="mono">${escapeHtml(d.shop_number||'—')}</td>
            <td>${escapeHtml(d.complex_name||'—')}</td>
            <td class="num">${currency(d.amount)}</td>
            <td>${dateFmt(d.payment_date)}</td>
            <td>${escapeHtml(d.remarks||'—')}</td>
            <td><div class="row-actions">
              <button class="btn-icon" data-edit-deposit="${d.id}" aria-label="Edit deposit payment">${editIcon()}</button>
              <button class="btn-icon" data-delete-deposit="${d.id}" aria-label="Delete deposit payment">${trashIcon()}</button>
            </div></td>
          </tr>`).join('')}
      </tbody>
    </table>
  </div>`}`;
}

function attachDepositHandlers(){
  document.querySelectorAll('[data-edit-deposit]').forEach(btn => btn.addEventListener('click', () => openEditDepositModal(Number(btn.dataset.editDeposit))));
  document.querySelectorAll('[data-delete-deposit]').forEach(btn => btn.addEventListener('click', () => {
    const dp = (state.cache.deposits || []).find(x => x.id === Number(btn.dataset.deleteDeposit));
    if (dp) confirmDeleteDeposit(dp);
  }));
}

/* ---- Edit / delete a single deposit payment ---- */
function openEditDepositModal(dpId){
  const dp = (state.cache.deposits || []).find(d => d.id === dpId);
  if (!dp){ showToast('Deposit payment not found', 'error'); return; }
  const dateVal = dp.payment_date ? new Date(dp.payment_date).toISOString().slice(0,10) : '';

  openModal(`Edit deposit payment${dp.shop_number ? ' — ' + escapeHtml(dp.shop_number) : ''}`, `
    <form id="depositEditForm">
      <div class="form-grid">
        <div class="field">
          <label for="edAmount">Amount (₹)</label>
          <input id="edAmount" type="number" step="0.01" min="0.01" value="${Number(dp.amount).toFixed(2)}">
          ${fieldErrorHtml('edAmountErr')}
        </div>
        <div class="field">
          <label for="edDate">Payment date</label>
          <input id="edDate" type="date" value="${dateVal}">
        </div>
        <div class="field full">
          <label for="edRemarks">Remarks</label>
          <input id="edRemarks" value="${escapeHtml(dp.remarks || '')}" placeholder="Optional">
        </div>
      </div>
      <div style="font-size:12px; color:var(--muted); margin-top:4px;">Total deposit paid for this tenant/shop (including this record) can't exceed the shop's required deposit.</div>
    </form>
  `, `
    <button class="btn btn-ghost" id="cancelBtn">Cancel</button>
    <button class="btn btn-danger-ghost" id="deleteDepositBtn" style="margin-right:auto;">Delete deposit</button>
    <button class="btn btn-primary" id="saveBtn">Save changes</button>
  `);
  document.getElementById('cancelBtn').addEventListener('click', closeModal);
  document.getElementById('deleteDepositBtn').addEventListener('click', () => confirmDeleteDeposit(dp));

  document.getElementById('saveBtn').addEventListener('click', async () => {
    const form = document.getElementById('depositEditForm');
    clearFieldErrors(form);
    const amount = parseFloat(document.getElementById('edAmount').value);
    const dateStr = document.getElementById('edDate').value;
    const remarks = document.getElementById('edRemarks').value.trim();
    if (isNaN(amount) || amount <= 0){ showFieldError('edAmountErr','Enter a valid amount'); document.getElementById('edAmount').classList.add('invalid'); return; }

    await withSavingState('saveBtn', async () => {
      await api(`/api/deposit-payment/${dp.id}`, { method:'PUT', body:{
        amount, remarks,
        payment_date: dateStr ? new Date(dateStr).toISOString() : undefined,
      }});
      closeModal();
      showToast('Deposit payment updated', 'success');
      await renderView('deposits');
    });
  });
}

function confirmDeleteDeposit(dp){
  openModal('Delete deposit payment', `
    <div class="confirm-body">Are you sure you want to delete this deposit payment of <strong>${currency(dp.amount)}</strong>${dp.user_name ? ` for <strong>${escapeHtml(dp.user_name)}</strong>` : ''}? This can't be undone.</div>
  `, `
    <button class="btn btn-ghost" id="cancelBtn">Cancel</button>
    <button class="btn btn-danger-ghost" id="confirmDeleteBtn">Delete</button>
  `);
  document.getElementById('cancelBtn').addEventListener('click', closeModal);
  document.getElementById('confirmDeleteBtn').addEventListener('click', async () => {
    await withSavingState('confirmDeleteBtn', async () => {
      await api(`/api/deposit-payment/${dp.id}`, { method:'DELETE' });
      closeModal();
      showToast('Deposit payment deleted', 'success');
      await renderView('deposits');
    }, 'Deleting…');
  });
}

/* ---- Deposit Payment Modal ---- */
async function openDepositModal(){
  const [users, shops, complexes] = await Promise.all([
    ensureLoaded('users','/api/user'),
    ensureLoaded('shops','/api/shop'),
    ensureLoaded('complexes','/api/complex'),
  ]);
  const tenants = users.filter(u => u.role === 'tenant');
  const today = new Date().toISOString().slice(0,10);

  openModal('Record deposit payment', `
    <form id="depForm">
      <div class="field">
        <label for="dpTenant">Tenant</label>
        <select id="dpTenant">
          <option value="">— select tenant —</option>
          ${tenants.map(u=>`<option value="${u.id}">${escapeHtml(u.name)} · ${escapeHtml(u.mobile)}</option>`).join('')}
        </select>
        ${fieldErrorHtml('dpTenantErr')}
      </div>
      <div class="field">
        <label for="dpShop">Shop</label>
        <select id="dpShop" disabled>
          <option value="">— select tenant first —</option>
        </select>
        ${fieldErrorHtml('dpShopErr')}
      </div>
      <div id="dpDepositInfo" style="display:none;" class="info-card" style="margin-bottom:12px;"></div>
      <div class="form-grid">
        <div class="field">
          <label for="dpAmount">Amount (₹)</label>
          <input id="dpAmount" type="number" step="0.01" min="0.01" placeholder="10000.00">
          ${fieldErrorHtml('dpAmountErr')}
        </div>
        <div class="field">
          <label for="dpDate">Date</label>
          <input id="dpDate" type="date" value="${today}">
        </div>
        <div class="field full">
          <label for="dpRemarks">Remarks</label>
          <input id="dpRemarks" placeholder="Partial deposit, full deposit, etc.">
        </div>
      </div>
    </form>
  `, `
    <button class="btn btn-ghost" id="cancelBtn">Cancel</button>
    <button class="btn btn-primary" id="saveBtn" disabled>Record deposit</button>
  `);
  document.getElementById('cancelBtn').addEventListener('click', closeModal);

  document.getElementById('dpTenant').addEventListener('change', () => {
    const uid = Number(document.getElementById('dpTenant').value);
    const shopSel = document.getElementById('dpShop');
    document.getElementById('dpDepositInfo').style.display = 'none';
    document.getElementById('saveBtn').disabled = true;
    if (!uid){ shopSel.innerHTML='<option value="">— select tenant first —</option>'; shopSel.disabled=true; return; }
    const owned = shops.filter(s => s.assigned_to?.id === uid);
    if (!owned.length){ shopSel.innerHTML='<option value="">No shops assigned</option>'; shopSel.disabled=true; return; }
    shopSel.disabled = false;
    shopSel.innerHTML = '<option value="">— select shop —</option>' + owned.map(s=>`<option value="${s.id}" data-deposit="${s.shop_deposit||0}">${escapeHtml(s.shop_number)} · deposit ₹${Number(s.shop_deposit||0).toLocaleString('en-IN')}</option>`).join('');
    shopSel.dispatchEvent(new Event('change'));
  });

  document.getElementById('dpShop').addEventListener('change', async () => {
    const uid = Number(document.getElementById('dpTenant').value);
    const sid = Number(document.getElementById('dpShop').value);
    const infoEl = document.getElementById('dpDepositInfo');
    document.getElementById('saveBtn').disabled = !sid;
    if (!sid || !uid){ infoEl.style.display='none'; return; }
    try {
      const fs = await api(`/api/user/${uid}/financial-summary`);
      const shopDep = fs.deposit_summary;
      infoEl.innerHTML = `
        <div class="info-row"><span class="info-label">Deposit required</span><span class="info-val">${currency(shopDep?.total_deposit_required)}</span></div>
        <div class="info-row"><span class="info-label">Already paid</span><span class="info-val good">${currency(shopDep?.total_deposit_paid)}</span></div>
        <div class="info-row"><span class="info-label">Remaining</span><span class="info-val ${shopDep?.remaining_deposit > 0 ? 'warn' : 'good'}">${currency(shopDep?.remaining_deposit)}</span></div>
      `;
      infoEl.style.display = 'block';
      if (!document.getElementById('dpAmount').value) document.getElementById('dpAmount').value = Number(shopDep?.remaining_deposit || 0).toFixed(2);
    } catch(e){ infoEl.style.display='none'; }
  });

  document.getElementById('saveBtn').addEventListener('click', async () => {
    const uid = Number(document.getElementById('dpTenant').value);
    const sid = Number(document.getElementById('dpShop').value);
    const amount = parseFloat(document.getElementById('dpAmount').value);
    const payment_date = document.getElementById('dpDate').value;
    const remarks = document.getElementById('dpRemarks').value.trim();
    let ok = true;
    if (!uid){ showFieldError('dpTenantErr','Select a tenant'); ok=false; }
    if (!sid){ showFieldError('dpShopErr','Select a shop'); ok=false; }
    if (isNaN(amount)||amount<=0){ showFieldError('dpAmountErr','Enter a valid amount'); document.getElementById('dpAmount').classList.add('invalid'); ok=false; }
    if (!ok) return;
    await withSavingState('saveBtn', async () => {
      await api('/api/deposit-payment', { method:'POST', body:{ user_id:uid, shop_id:sid, amount, payment_date: new Date(payment_date).toISOString(), remarks } });
      closeModal();
      showToast(`Deposit of ${currency(amount)} recorded`, 'success');
      await renderView('deposits');
    });
  });
}

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
                <td>${escapeHtml(r.user_name)}</td>
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
          <div class="card stat-card accent-rust"><div class="label">Remaining</div><div class="value mono">${currency(s.total_deposit_remaining)}</div><div class="sub">${s.tenants_with_partial_deposit} partial · ${s.tenants_with_no_deposit} none</div></div>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Tenant</th><th>Mobile</th><th>Complex</th><th>Shop</th><th class="num">Required</th><th class="num">Paid</th><th class="num">Remaining</th><th>Status</th><th>Last payment</th></tr></thead>
            <tbody>
              ${rep.records.map(r=>`<tr>
                <td>${escapeHtml(r.user_name)}</td>
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
          <div class="card stat-card"><div class="label">Total shops</div><div class="value">${s.total_shops}</div></div>
          <div class="card stat-card accent-green"><div class="label">Occupied</div><div class="value">${s.occupied}</div></div>
          <div class="card stat-card"><div class="label">Available</div><div class="value">${s.available}</div></div>
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
        <h3 style="font-size:15.5px; margin:0 0 12px;">Shop details</h3>
        <div class="table-wrap">
          <table><thead><tr><th>Shop</th><th>Complex</th><th class="num">Area (sqft)</th><th class="num">Rent</th><th>Status</th><th>Tenant</th></tr></thead>
          <tbody>${rep.shop_details.map(s=>`<tr>
            <td class="mono"><strong>${escapeHtml(s.shop_number)}</strong></td>
            <td>${escapeHtml(s.complex_name)}</td>
            <td class="num">${Number(s.area_sqft).toLocaleString('en-IN')}</td>
            <td class="num">${currency(s.shop_rent)}</td>
            <td><span class="pill ${s.status}"><span class="pill-dot"></span>${s.status}</span></td>
            <td>${s.tenant_name ? `<span class="tenant-tag">${escapeHtml(s.tenant_name)}</span> <span style="color:var(--muted); font-size:12px;">${escapeHtml(s.tenant_mobile||'')}</span>` : '<span style="color:var(--muted);">—</span>'}</td>
          </tr>`).join('')}</tbody>
          </table>
        </div>
      `;
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
                <td><strong>${escapeHtml(r.user_name)}</strong><div style="font-size:12px; color:var(--muted);">${escapeHtml(r.mobile)}</div></td>
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
    <div class="card stat-card accent-rust"><div class="label">Total outstanding</div><div class="value mono">${currency(aging.total_outstanding)}</div><div class="sub">across all unpaid bills</div></div>
    <div class="card stat-card"><div class="label">90+ days overdue</div><div class="value mono">${currency(aging.buckets['90_plus'])}</div><div class="sub">${aging.bucket_counts['90_plus']} bill(s) — highest risk</div></div>
    <div class="card stat-card"><div class="label">Top defaulter</div><div class="value" style="font-size:16px;">${rep.top_defaulters[0] ? escapeHtml(rep.top_defaulters[0].user_name) : '—'}</div><div class="sub">${rep.top_defaulters[0] ? currency(rep.top_defaulters[0].total_pending)+' pending' : 'no outstanding dues'}</div></div>
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
    <div class="card-pad" style="padding-bottom:0;"><h3 style="font-size:15.5px;">Top defaulters</h3><p style="font-size:12.5px; color:var(--muted); margin:4px 0 0;">Highest pending amounts, current unpaid bills.</p></div>
    ${rep.top_defaulters.length === 0 ? emptyStateHtml('No defaulters', 'Every bill is fully paid — great job.', emptyIcon()) : `
    <div class="table-wrap" style="border:none; border-radius:0; box-shadow:none; margin-top:10px;">
      <table>
        <thead><tr><th>Tenant</th><th>Mobile</th><th class="num">Total pending</th><th>Oldest due</th><th></th></tr></thead>
        <tbody>
          ${rep.top_defaulters.map(d=>`<tr>
            <td><strong>${escapeHtml(d.user_name||'—')}</strong></td>
            <td class="mono">${escapeHtml(d.mobile||'—')}</td>
            <td class="num"><span style="color:var(--rust);font-weight:700;">${currency(d.total_pending)}</span></td>
            <td>${dateFmt(d.oldest_due_date)}</td>
            <td>${waLink(d.mobile, d.user_name, d.total_pending) ? `<a href="${waLink(d.mobile, d.user_name, d.total_pending)}" target="_blank" rel="noopener" style="font-size:12px; color:var(--success,#3a7d5c); font-weight:600; text-decoration:none; white-space:nowrap;">Remind ↗</a>` : ''}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`}
  </div>`;
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
/* ================================================================
   MODAL ENGINE
   ================================================================ */
const modalOverlay = document.getElementById('modalOverlay');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const modalFoot = document.getElementById('modalFoot');
document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modalOverlay.classList.contains('show')) closeModal(); });

function openModal(title, bodyHtml, footHtml){
  modalTitle.textContent = title;
  modalBody.innerHTML = bodyHtml;
  modalFoot.innerHTML = footHtml;
  modalOverlay.classList.add('show');
  const firstInput = modalBody.querySelector('input,select,textarea');
  if (firstInput) setTimeout(()=>firstInput.focus(), 50);
}
function closeModal(){ modalOverlay.classList.remove('show'); }

function fieldErrorHtml(id){ return `<div class="field-error" id="${id}" style="display:none;"></div>`; }
function showFieldError(id, msg){ const el=document.getElementById(id); el.textContent=msg; el.style.display='block'; }
function clearFieldErrors(scope){ scope.querySelectorAll('.field-error').forEach(e=>{e.style.display='none'; e.textContent='';}); scope.querySelectorAll('.invalid').forEach(e=>e.classList.remove('invalid')); }

/* ---- Open create modal dispatcher ---- */
function openCreateModal(view){
  switch(view){
    case 'complexes': return openComplexModal();
    case 'shops': return openShopModal();
    case 'users': return openUserModal();
  }
}

/* ---- COMPLEX modal (create + edit) ---- */
function openComplexModal(){ renderComplexForm(null); }
function openEditComplexModal(id){ renderComplexForm(state.cache.complexes.find(c=>c.id===id)); }

function renderComplexForm(existing){
  const isEdit = !!existing;
  openModal(isEdit ? 'Edit complex' : 'Add complex', `
    <form id="complexForm">
      <div class="field">
        <label for="cName">Name</label>
        <input id="cName" required value="${existing ? escapeHtml(existing.name) : ''}" placeholder="Sunrise Complex">
        ${fieldErrorHtml('cNameErr')}
      </div>
      <div class="field">
        <label for="cAddress">Address</label>
        <input id="cAddress" required value="${existing ? escapeHtml(existing.address) : ''}" placeholder="123 Main Street, Mumbai">
        ${fieldErrorHtml('cAddressErr')}
      </div>
      <div class="field">
        <label for="cDesc">Description</label>
        <textarea id="cDesc" placeholder="Optional notes">${existing ? escapeHtml(existing.description||'') : ''}</textarea>
      </div>
    </form>
  `, `
    <button class="btn btn-ghost" id="cancelBtn">Cancel</button>
    <button class="btn btn-primary" id="saveBtn">${isEdit ? 'Save changes' : 'Add complex'}</button>
  `);
  document.getElementById('cancelBtn').addEventListener('click', closeModal);
  document.getElementById('saveBtn').addEventListener('click', async () => {
    const form = document.getElementById('complexForm');
    clearFieldErrors(form);
    const name = document.getElementById('cName').value.trim();
    const address = document.getElementById('cAddress').value.trim();
    const description = document.getElementById('cDesc').value.trim();
    let ok = true;
    if (!name){ showFieldError('cNameErr','Name is required'); document.getElementById('cName').classList.add('invalid'); ok=false; }
    if (!address){ showFieldError('cAddressErr','Address is required'); document.getElementById('cAddress').classList.add('invalid'); ok=false; }
    if (!ok) return;

    await withSavingState('saveBtn', async () => {
      if (isEdit) await api(`/api/complex/${existing.id}`, { method:'PUT', body:{ name, address, description } });
      else await api('/api/complex', { method:'POST', body:{ name, address, description } });
      state.loaded.complexes = false;
      closeModal();
      showToast(isEdit ? 'Complex updated' : 'Complex added', 'success');
      await renderView('complexes');
    });
  });
}

/* ---- SHOP modal (create + edit) ---- */
function openShopModal(){ renderShopForm(null); }
function openEditShopModal(id){ renderShopForm(state.cache.shops.find(s=>s.id===id)); }

async function renderShopForm(existing){
  const isEdit = !!existing;
  const complexes = await ensureLoaded('complexes','/api/complex');
  openModal(isEdit ? 'Edit shop' : 'Add shop', `
    <form id="shopForm">
      <div class="form-grid">
        <div class="field full">
          <label for="sNumber">Shop number</label>
          <input id="sNumber" required value="${existing ? escapeHtml(existing.shop_number) : ''}" placeholder="A-101">
          ${fieldErrorHtml('sNumberErr')}
        </div>
        <div class="field">
          <label for="sArea">Area (sqft)</label>
          <input id="sArea" type="number" step="0.01" min="0" required value="${existing ? existing.area_sqft : ''}" placeholder="450.50">
          ${fieldErrorHtml('sAreaErr')}
        </div>
        <div class="field">
          <label for="sStatus">Status</label>
          <select id="sStatus">
            <option value="available" ${existing?.status==='available'?'selected':''}>Available</option>
            <option value="occupied" ${existing?.status==='occupied'?'selected':''}>Occupied</option>
          </select>
        </div>
        <div class="field">
          <label for="sRent">Monthly rent (₹)</label>
          <input id="sRent" type="number" step="0.01" min="0" value="${existing?.shop_rent ?? ''}" placeholder="5000.00">
        </div>
        <div class="field">
          <label for="sDeposit">Security deposit (₹)</label>
          <input id="sDeposit" type="number" step="0.01" min="0" value="${existing?.shop_deposit ?? ''}" placeholder="20000.00">
        </div>
        <div class="field full">
          <label for="sComplex">Complex</label>
          <select id="sComplex">
            ${complexes.map(c => `<option value="${c.id}" ${existing?.complex_id===c.id?'selected':''}>${escapeHtml(c.name)}</option>`).join('')}
          </select>
          ${complexes.length===0 ? '<div class="hint">Add a complex first before creating shops.</div>' : ''}
        </div>
      </div>
    </form>
  `, `
    <button class="btn btn-ghost" id="cancelBtn">Cancel</button>
    <button class="btn btn-primary" id="saveBtn" ${complexes.length===0?'disabled':''}>${isEdit ? 'Save changes' : 'Add shop'}</button>
  `);
  document.getElementById('cancelBtn').addEventListener('click', closeModal);
  document.getElementById('saveBtn').addEventListener('click', async () => {
    const form = document.getElementById('shopForm');
    clearFieldErrors(form);
    const shop_number = document.getElementById('sNumber').value.trim();
    const area_sqft = parseFloat(document.getElementById('sArea').value);
    const status = document.getElementById('sStatus').value;
    const complex_id = Number(document.getElementById('sComplex').value);
    let ok = true;
    if (!shop_number){ showFieldError('sNumberErr','Shop number is required'); document.getElementById('sNumber').classList.add('invalid'); ok=false; }
    if (isNaN(area_sqft) || area_sqft <= 0){ showFieldError('sAreaErr','Enter a valid area'); document.getElementById('sArea').classList.add('invalid'); ok=false; }
    if (!ok) return;

    await withSavingState('saveBtn', async () => {
      const body = { shop_number, area_sqft, status, complex_id,
        shop_rent: parseFloat(document.getElementById('sRent').value) || 0,
        shop_deposit: parseFloat(document.getElementById('sDeposit').value) || 0
      };
      if (isEdit) await api(`/api/shop/${existing.id}`, { method:'PUT', body });
      else await api('/api/shop', { method:'POST', body });
      state.loaded.shops = false;
      closeModal();
      showToast(isEdit ? 'Shop updated' : 'Shop added', 'success');
      await renderView('shops');
    });
  });
}

/* ---- USER modal (create + edit) ---- */
function openUserModal(){ renderUserForm(null); }
function openEditUserModal(id){ renderUserForm(state.cache.users.find(u=>u.id===id)); }

function renderUserForm(existing){
  const isEdit = !!existing;
  openModal(isEdit ? 'Edit user' : 'Add user', `
    <form id="userForm">
      <div class="form-grid">
        <div class="field full">
          <label for="uName">Full name</label>
          <input id="uName" required value="${existing ? escapeHtml(existing.name) : ''}" placeholder="Rahul Sharma">
          ${fieldErrorHtml('uNameErr')}
        </div>
        <div class="field">
          <label for="uMobile">Mobile</label>
          <input id="uMobile" required maxlength="10" inputmode="numeric" value="${existing ? escapeHtml(existing.mobile) : ''}" placeholder="9876543210">
          ${fieldErrorHtml('uMobileErr')}
        </div>
        <div class="field">
          <label for="uEmail">Email</label>
          <input id="uEmail" type="email" value="${existing ? escapeHtml(existing.email||'') : ''}" placeholder="rahul@example.com">
        </div>
        ${!isEdit ? `
        <div class="field">
          <label for="uPassword">Password</label>
          <input id="uPassword" type="password" required placeholder="••••••••">
          ${fieldErrorHtml('uPasswordErr')}
        </div>
        <div class="field">
          <label for="uRole">Role</label>
          <select id="uRole">
            <option value="tenant">Tenant</option>
            <option value="admin">Admin</option>
          </select>
        </div>` : `
        <div class="field full">
          <label for="uActive">Account status</label>
          <select id="uActive">
            <option value="true" ${existing?.is_active ? 'selected':''}>Active</option>
            <option value="false" ${!existing?.is_active ? 'selected':''}>Inactive</option>
          </select>
          <div class="hint">Setting to Inactive automatically releases all of this tenant's shops back to "available".</div>
        </div>`}
      </div>
      <div id="uRentBillingSection" class="form-grid" style="display:${(isEdit ? existing?.role==='tenant' : true) ? '' : 'none'}; margin-top:4px; padding-top:14px; border-top:1px dashed var(--line);">
        <div class="field">
          <label for="uRentBillDate">Rent bill date</label>
          <input id="uRentBillDate" type="number" min="1" max="28" placeholder="e.g. 5" value="${existing?.rent_bill_date ?? ''}">
          <div class="hint">Day of month (1-28) the rent bill auto-generates on.</div>
        </div>
        <div class="field" style="display:flex; align-items:flex-end;">
          <label style="display:flex; align-items:center; gap:8px; cursor:pointer; text-transform:none; font-weight:600;">
            <input type="checkbox" id="uAutoRentBill" style="width:16px; height:16px; accent-color:var(--green); margin:0;" ${existing?.auto_rent_bill_enabled ? 'checked' : ''}>
            Auto-generate rent bill monthly
          </label>
        </div>
      </div>
    </form>
  `, `
    <button class="btn btn-ghost" id="cancelBtn">Cancel</button>
    <button class="btn btn-primary" id="saveBtn">${isEdit ? 'Save changes' : 'Add user'}</button>
  `);
  document.getElementById('cancelBtn').addEventListener('click', closeModal);
  if (!isEdit){
    document.getElementById('uRole').addEventListener('change', function(){
      document.getElementById('uRentBillingSection').style.display = this.value === 'tenant' ? '' : 'none';
    });
  }
  document.getElementById('saveBtn').addEventListener('click', async () => {
    const form = document.getElementById('userForm');
    clearFieldErrors(form);
    const name = document.getElementById('uName').value.trim();
    const mobile = document.getElementById('uMobile').value.trim();
    const email = document.getElementById('uEmail').value.trim();
    let ok = true;
    if (!name){ showFieldError('uNameErr','Name is required'); document.getElementById('uName').classList.add('invalid'); ok=false; }
    if (!/^[0-9]{10}$/.test(mobile)){ showFieldError('uMobileErr','Enter a valid 10-digit mobile'); document.getElementById('uMobile').classList.add('invalid'); ok=false; }

    const rentBillingVisible = document.getElementById('uRentBillingSection').style.display !== 'none';
    const rentBillDateVal = document.getElementById('uRentBillDate').value;
    const rent_bill_date = rentBillingVisible && rentBillDateVal ? Number(rentBillDateVal) : null;
    const auto_rent_bill_enabled = rentBillingVisible ? document.getElementById('uAutoRentBill').checked : false;
    if (rentBillingVisible && rentBillDateVal && (rent_bill_date < 1 || rent_bill_date > 28)){
      showToast('Rent bill date must be between 1 and 28', 'error'); ok=false;
    }

    let body;
    if (isEdit){
      const is_active = document.getElementById('uActive').value === 'true';
      body = { name, mobile, email, is_active, rent_bill_date, auto_rent_bill_enabled };
    } else {
      const password = document.getElementById('uPassword').value;
      const role = document.getElementById('uRole').value;
      if (!password || password.length < 4){ showFieldError('uPasswordErr','Password is required (min 4 chars)'); document.getElementById('uPassword').classList.add('invalid'); ok=false; }
      body = { name, mobile, email, password, role, rent_bill_date, auto_rent_bill_enabled };
    }
    if (!ok) return;

    if (isEdit && existing.is_active && body.is_active === false){
      const shops = await ensureLoaded('shops','/api/shop');
      const ownedShops = shops.filter(s => s.assigned_to?.id === existing.id);
      if (ownedShops.length > 0){
        closeModal();
        confirmDeactivateWithShops(existing, body, ownedShops);
        return;
      }
    }

    await saveUser(existing, body, isEdit);
  });
}

async function saveUser(existing, body, isEdit){
  await withSavingState('saveBtn', async () => {
    if (isEdit) await api(`/api/user/${existing.id}`, { method:'PUT', body });
    else await api('/api/user', { method:'POST', body });
    state.loaded.users = false;
    state.loaded.shops = false;
    closeModal();
    showToast(isEdit ? 'User updated' : 'User added', 'success');
    await renderView('users');
  });
}

function confirmDeactivateWithShops(existing, body, ownedShops){
  openModal('Deactivate tenant', `
    <div class="confirm-body">
      <p style="margin-top:0;"><strong>${escapeHtml(existing.name)}</strong> currently holds ${ownedShops.length} shop${ownedShops.length>1?'s':''}:</p>
      <ul style="margin:0 0 4px; padding-left:20px; font-size:13.5px;">
        ${ownedShops.map(s => `<li class="mono">${escapeHtml(s.shop_number)}</li>`).join('')}
      </ul>
      <p>Deactivating will automatically release ${ownedShops.length>1?'them':'it'} back to <strong>available</strong> so they can be assigned to a new tenant. Bill history stays linked to this account.</p>
    </div>
  `, `
    <button class="btn btn-ghost" id="cancelBtn">Cancel</button>
    <button class="btn btn-danger-ghost" id="confirmBtn">Deactivate &amp; release shops</button>
  `);
  document.getElementById('cancelBtn').addEventListener('click', closeModal);
  document.getElementById('confirmBtn').addEventListener('click', async () => {
    await withSavingState('confirmBtn', async () => {
      await api(`/api/user/${existing.id}`, { method:'PUT', body });
      state.loaded.users = false;
      state.loaded.shops = false;
      closeModal();
      showToast(`${existing.name} deactivated — ${ownedShops.length} shop${ownedShops.length>1?'s':''} released`, 'success');
      await renderView('users');
    }, 'Deactivating…');
  });
}

/* ---- ASSIGN SHOPS modal ---- */
async function openAssignShopsModal(userId, userName){
  const shops = await ensureLoaded('shops','/api/shop');
  const complexes = await ensureLoaded('complexes','/api/complex');
  const complexName = (id) => complexes.find(c=>c.id===id)?.name || `#${id}`;

  openModal(`Assign shops — ${userName}`, `
    <p style="font-size:13.5px; color:var(--muted); margin:0 0 14px;">Each shop can have one tenant at a time. Shops already owned by someone else are shown but flagged — selecting one will ask to confirm a reassignment.</p>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:14px;">
      <div class="form-field">
        <label for="agreementStart">Agreement start date</label>
        <input type="date" id="agreementStart">
      </div>
      <div class="form-field">
        <label for="agreementEnd">Agreement end date</label>
        <input type="date" id="agreementEnd">
      </div>
    </div>
    <div class="checkbox-list" id="shopCheckList">
      ${shops.length === 0 ? '<div style="font-size:13px; color:var(--muted); padding:8px;">No shops available. Add a shop first.</div>' :
        shops.map(s => {
          const isOwned = s.assigned_to?.id === userId;
          const isTaken = s.assigned_to && !isOwned;
          return `
          <label class="checkbox-row">
            <input type="checkbox" value="${s.id}" data-taken="${isTaken ? '1' : '0'}" data-owner="${s.assigned_to ? escapeHtml(s.assigned_to.name) : ''}" ${isOwned ? 'checked' : ''}>
            <span><strong class="mono">${escapeHtml(s.shop_number)}</strong> — ${escapeHtml(complexName(s.complex_id))}
              ${isOwned ? '<span style="color:var(--success); font-weight:600;"> (currently theirs)</span>' : ''}
              ${isTaken ? `<span style="color:var(--rust); font-weight:600;"> (taken by ${escapeHtml(s.assigned_to.name)})</span>` : ''}
            </span>
          </label>`;
        }).join('')}
    </div>
  `, `
    <button class="btn btn-ghost" id="cancelBtn">Cancel</button>
    <button class="btn btn-primary" id="assignBtn" ${shops.length===0?'disabled':''}>Assign selected</button>
  `);
  document.getElementById('cancelBtn').addEventListener('click', closeModal);
  document.getElementById('assignBtn').addEventListener('click', () => submitAssignShops(userId, userName, false));
}

async function submitAssignShops(userId, userName, force){
  const checked = Array.from(document.querySelectorAll('#shopCheckList input:checked'));
  const ids = checked.map(i => Number(i.value));
  if (ids.length === 0){ showToast('Select at least one shop', 'error'); return; }
  const agreement_start_date = document.getElementById('agreementStart')?.value || null;
  const agreement_end_date   = document.getElementById('agreementEnd')?.value || null;

  await withSavingState('assignBtn', async () => {
    try {
      const res = await api(`/api/user/${userId}/assign-shops`, { method:'POST', body:{ shop_ids: ids, force, agreement_start_date, agreement_end_date } });
      state.loaded.shops = false;
      closeModal();
      const reassignedCount = res.reassigned_from?.length || 0;
      showToast(reassignedCount > 0 ? `Shops assigned (${reassignedCount} reassigned from previous tenants)` : 'Shops assigned', 'success');
      await renderView('users');
    } catch (err) {
      if (err.status === 409){
        renderReassignConfirm(userId, userName, ids);
      } else {
        throw err;
      }
    }
  });
}

function renderReassignConfirm(userId, userName, ids){
  const conflicts = ids
    .map(id => state.cache.shops.find(s => s.id === id))
    .filter(s => s && s.assigned_to && s.assigned_to.id !== userId);

  openModal('Shops already assigned', `
    <div class="confirm-body">
      <p style="margin-top:0;">These shops already have a tenant:</p>
      <ul style="margin:0 0 4px; padding-left:20px; font-size:13.5px;">
        ${conflicts.map(c => `<li><strong class="mono">${escapeHtml(c.shop_number)}</strong> — currently with ${escapeHtml(c.assigned_to.name)}</li>`).join('')}
      </ul>
      <p>Reassigning will remove ${conflicts.length === 1 ? 'that tenant' : 'those tenants'} from ${conflicts.length === 1 ? 'this shop' : 'these shops'} and give ${conflicts.length === 1 ? 'it' : 'them'} to <strong>${escapeHtml(userName)}</strong> instead.</p>
    </div>
  `, `
    <button class="btn btn-ghost" id="backBtn">Go back</button>
    <button class="btn btn-primary" id="confirmReassignBtn">Reassign anyway</button>
  `);
  document.getElementById('backBtn').addEventListener('click', () => openAssignShopsModal(userId, userName));
  document.getElementById('confirmReassignBtn').addEventListener('click', async () => {
    await withSavingState('confirmReassignBtn', async () => {
      const res = await api(`/api/user/${userId}/assign-shops`, { method:'POST', body:{ shop_ids: ids, force: true } });
      state.loaded.shops = false;
      closeModal();
      showToast(`Shops reassigned to ${userName}`, 'success');
      await renderView('users');
    }, 'Reassigning…');
  });
}

/* ================================================================
   BILL MODAL — Smart cascade: Complex → Shop → Tenant (auto-locked)
   ================================================================ */
async function openBillModal(presetUserId){
  await Promise.all([
    ensureLoaded('complexes','/api/complex'),
    ensureLoaded('shops','/api/shop'),
    ensureLoaded('users','/api/user'),
  ]);

  const tenants = state.cache.users.filter(u => u.role === 'tenant');
  const today = new Date();
  const due = new Date(); due.setDate(today.getDate()+14);
  const todayStr = today.toISOString().slice(0,10);
  const COMMON_TYPES = ['Rent','Electricity','Water','Maintenance','Repair','Damage','Parking','Penalty'];

  openModal('Create bills', `
    <div style="font-size:12px; color:var(--muted); background:var(--paper); border-radius:var(--radius-sm); padding:8px 11px; margin-bottom:16px; display:flex; align-items:center; gap:7px;">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      Pick a tenant to see all their shops — select the ones to bill, then generate in one go.
    </div>
    <form id="billForm">
      <div class="field">
        <label for="bTenant">Tenant</label>
        <select id="bTenant">
          <option value="">— select tenant —</option>
          ${tenants.map(u => `<option value="${u.id}" ${presetUserId==u.id?'selected':''}>${escapeHtml(u.name)} · ${escapeHtml(u.mobile)}</option>`).join('')}
        </select>
      </div>

      <div id="bNoShopsWarn" style="display:none;" class="warn-box">
        ${warnIcon()}
        <span>This tenant has no shops assigned yet. Assign a shop to them before raising a bill.</span>
      </div>

      <div id="bShopSection" style="display:none;">
        <div class="field">
          <label>Bill type</label>
          <div class="chip-row" id="bTypeChips" style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:8px;">
            ${COMMON_TYPES.map((t,i) => `<button type="button" class="chip bill-type-chip${i===0?' active':''}" data-type="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join('')}
            <button type="button" class="chip bill-type-chip" data-type="__custom__">Custom…</button>
          </div>
          <input id="bType" value="Rent" placeholder="Bill type">
          ${fieldErrorHtml('bTypeErr')}
        </div>

        <div class="field full" style="margin-top:2px;">
          <label for="bDesc">Description <span style="color:var(--muted); font-weight:400; text-transform:none;">(optional)</span></label>
          <input id="bDesc" placeholder="e.g. June 2026 electricity reading">
        </div>

        <!-- BILL DATE (NEW) -->
        <div class="field full">
          <label for="bBillDate">Bill Date</label>
          <input id="bBillDate" type="date" value="${todayStr}">
        </div>

        <div class="field full">
          <label for="bDue">Due date</label>
          <input id="bDue" type="date" value="${due.toISOString().slice(0,10)}">
        </div>

        <div class="field full" style="margin-bottom:8px;">
          <label style="display:flex; align-items:center; justify-content:space-between;">
            <span>Shops</span>
            <span style="text-transform:none; font-weight:600; color:var(--muted); font-size:11.5px;"><label style="display:inline-flex; align-items:center; gap:5px; cursor:pointer; text-transform:none;"><input type="checkbox" id="bSelectAll" style="width:14px; height:14px; accent-color:var(--green); margin:0;"> Select all</label></span>
          </label>
          <div id="bShopList" class="shop-pick-list"></div>
        </div>

        <div class="pay-summary" id="bTotalSummary">
          <div class="ps-row ps-total"><span class="ps-key">Total for selected shops</span><span class="ps-val" id="bTotalVal">${currency(0)}</span></div>
        </div>
      </div>
    </form>
  `, `
    <button class="btn btn-ghost" id="cancelBtn">Cancel</button>
    <button class="btn btn-primary" id="saveBtn" disabled>Create bills</button>
  `);

  document.getElementById('cancelBtn').addEventListener('click', closeModal);

  function recalcTotal(){
    const rows = Array.from(document.querySelectorAll('.shop-pick-row'));
    let total = 0; let count = 0;
    rows.forEach(row => {
      const cb = row.querySelector('.shop-pick-check');
      if (cb.checked){
        const amt = parseFloat(row.querySelector('.shop-pick-amount').value) || 0;
        total += amt; count++;
      }
    });
    document.getElementById('bTotalVal').textContent = currency(total);
    document.getElementById('saveBtn').disabled = count === 0;
    document.getElementById('saveBtn').textContent = count > 0 ? `Create ${count} bill${count>1?'s':''}` : 'Create bills';
    const allCb = document.getElementById('bSelectAll');
    if (allCb) allCb.checked = rows.length > 0 && rows.every(r => r.querySelector('.shop-pick-check').checked);
  }

  function renderShopList(userId){
    const shopSection = document.getElementById('bShopSection');
    const noShopsWarn = document.getElementById('bNoShopsWarn');
    const listEl = document.getElementById('bShopList');
    const ownedShops = state.cache.shops.filter(s => s.assigned_to?.id === userId);

    if (ownedShops.length === 0){
      shopSection.style.display = 'none';
      noShopsWarn.style.display = 'flex';
      document.getElementById('saveBtn').disabled = true;
      return;
    }
    noShopsWarn.style.display = 'none';
    shopSection.style.display = 'block';

    const billType = document.getElementById('bType').value.trim() || 'Rent';
    const isRent = billType.toLowerCase() === 'rent';

    listEl.innerHTML = ownedShops.map(s => {
      const rent = Number(s.shop_rent ?? 0);
      const prefill = isRent ? rent : 0;
      return `
      <label class="shop-pick-row" data-shop-id="${s.id}">
        <input type="checkbox" class="shop-pick-check" ${isRent ? 'checked' : ''}>
        <div class="shop-pick-info">
          <div class="shop-pick-num mono">${escapeHtml(s.shop_number)}</div>
          <div class="shop-pick-meta">${isRent ? `Rent/mo: ${currency(rent)}` : 'Custom amount'}</div>
        </div>
        <div class="shop-pick-amt-wrap">
          <span class="shop-pick-rupee">₹</span>
          <input type="number" class="shop-pick-amount" step="0.01" min="0" value="${prefill.toFixed(2)}">
        </div>
      </label>`;
    }).join('');

    listEl.querySelectorAll('.shop-pick-check').forEach(cb => cb.addEventListener('change', () => {
      cb.closest('.shop-pick-row').classList.toggle('checked-row', cb.checked);
      recalcTotal();
    }));
    listEl.querySelectorAll('.shop-pick-amount').forEach(inp => inp.addEventListener('input', recalcTotal));
    listEl.querySelectorAll('.shop-pick-row').forEach(row => {
      if (row.querySelector('.shop-pick-check').checked) row.classList.add('checked-row');
    });
    recalcTotal();
  }

  document.getElementById('bTenant').addEventListener('change', () => {
    const uid = Number(document.getElementById('bTenant').value);
    if (!uid){
      document.getElementById('bShopSection').style.display = 'none';
      document.getElementById('bNoShopsWarn').style.display = 'none';
      document.getElementById('saveBtn').disabled = true;
      return;
    }
    renderShopList(uid);
  });

  if (presetUserId){
    renderShopList(Number(presetUserId));
  }

  document.querySelectorAll('.bill-type-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.bill-type-chip').forEach(c => c.classList.remove('active'));
      const typeInput = document.getElementById('bType');
      if (chip.dataset.type === '__custom__'){
        chip.classList.add('active');
        typeInput.value = '';
        typeInput.focus();
      } else {
        chip.classList.add('active');
        typeInput.value = chip.dataset.type;
      }
      const uid = Number(document.getElementById('bTenant').value);
      if (uid) renderShopList(uid);
    });
  });

  document.getElementById('bType').addEventListener('input', () => {
    const val = document.getElementById('bType').value.trim().toLowerCase();
    document.querySelectorAll('.bill-type-chip').forEach(c => {
      c.classList.toggle('active', c.dataset.type !== '__custom__' && c.dataset.type.toLowerCase() === val);
    });
  });

  document.getElementById('bSelectAll').addEventListener('change', (e) => {
    document.querySelectorAll('.shop-pick-check').forEach(cb => {
      cb.checked = e.target.checked;
      cb.closest('.shop-pick-row').classList.toggle('checked-row', cb.checked);
    });
    recalcTotal();
  });

  document.getElementById('saveBtn').addEventListener('click', async () => {
    const form = document.getElementById('billForm');
    clearFieldErrors(form);
    const userId = Number(document.getElementById('bTenant').value);
    const bill_type = document.getElementById('bType').value.trim();
    const description = document.getElementById('bDesc').value.trim();
    const due_date = document.getElementById('bDue').value;
    const bill_date = document.getElementById('bBillDate').value
      ? new Date(document.getElementById('bBillDate').value).toISOString()
      : null;

    if (!userId){ showToast('Select a tenant first', 'error'); return; }
    if (!bill_type){ showFieldError('bTypeErr','Bill type is required'); document.getElementById('bType').classList.add('invalid'); return; }

    const selectedRows = Array.from(document.querySelectorAll('.shop-pick-row')).filter(r => r.querySelector('.shop-pick-check').checked);
    if (selectedRows.length === 0){ showToast('Select at least one shop', 'error'); return; }

    const items = selectedRows.map(row => ({
      shop_id: Number(row.dataset.shopId),
      amount: parseFloat(row.querySelector('.shop-pick-amount').value)
    }));
    const badRow = items.find(it => isNaN(it.amount) || it.amount <= 0);
    if (badRow){ showToast('Every selected shop needs a valid amount', 'error'); return; }

    await withSavingState('saveBtn', async () => {
      let created = 0, failed = 0;
      for (const item of items){
        try {
          await api('/api/bill', { method:'POST', body:{
            user_id: userId,
            shop_id: item.shop_id,
            bill_type,
            amount: item.amount,
            description,
            due_date: due_date ? new Date(due_date).toISOString() : null,
            bill_date: bill_date   // <-- NEW: send bill_date
          }});
          created++;
        } catch(e){ failed++; }
      }
      state.loaded.bills = false;
      closeModal();
      if (failed === 0) showToast(`${created} bill${created>1?'s':''} created`, 'success');
      else showToast(`${created} bill${created>1?'s':''} created, ${failed} failed`, created>0 ? 'default' : 'error');
      await renderView('billing');
    }, 'Creating…');
  });
}

/* ================================================================
   PAYMENT MODAL — Guided: Complex → By Shop OR By Tenant → Bills
   ================================================================ */
async function openPaymentModal(){ await renderPaymentForm(null); }
async function openRecordPaymentModal(billId){
  await Promise.all([
    ensureLoaded('complexes','/api/complex'),
    ensureLoaded('shops','/api/shop'),
    ensureLoaded('users','/api/user'),
    ensureLoaded('bills','/api/bill'),
  ]);
  const bill = state.cache.bills.find(b => b.id === billId);
  if (!bill){ await renderPaymentForm(null); return; }
  // Find shop and complex for preselection
  const shop = state.cache.shops.find(s => s.id === bill.shop_id);
  await renderPaymentForm({ preselectedBillId: billId, preselectedShopId: shop?.id, preselectedComplexId: shop?.complex_id });
}

async function renderPaymentForm(presel){
  await Promise.all([
    ensureLoaded('complexes','/api/complex'),
    ensureLoaded('shops','/api/shop'),
    ensureLoaded('users','/api/user'),
    ensureLoaded('bills','/api/bill'),
  ]);

  const complexes = state.cache.complexes;
  const preComplexId = presel?.preselectedComplexId || '';
  const preShopId = presel?.preselectedShopId || '';
  const preBillId = presel?.preselectedBillId || '';
  const preUserId = presel?.preselectedUserId || '';

  openModal('Record payment', `
    <div style="font-size:12px; color:var(--muted); background:var(--paper); border-radius:var(--radius-sm); padding:8px 11px; margin-bottom:16px; display:flex; align-items:center; gap:7px;">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      Start with the complex, then find by shop number or tenant name.
    </div>

    <div class="path-toggle" id="pModeToggle" style="margin-bottom:14px;">
      <button class="path-btn active" id="modeAuto" type="button">Auto Allocate</button>
      <button class="path-btn" id="modeManual" type="button">Manual</button>
    </div>
    <div style="font-size:12px; color:var(--muted); margin:-8px 0 14px;" id="pModeHint">
      Enter one amount received — it will be applied to the tenant's oldest pending bills first, automatically.
    </div>

    <div class="field">
      <label for="pComplex">Complex</label>
      <select id="pComplex">
        <option value="">— select complex —</option>
        ${complexes.map(c => `<option value="${c.id}" ${preComplexId==c.id?'selected':''}>${escapeHtml(c.name)}</option>`).join('')}
      </select>
    </div>

    <div id="pPathSection" style="display:none;">
      <div class="path-toggle" id="pPathToggle">
        <button class="path-btn active" id="pathByShop" type="button">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l1-5h16l1 5M4 9v10a1 1 0 001 1h14a1 1 0 001-1V9M4 9h16"/></svg>
          By shop number
        </button>
        <button class="path-btn" id="pathByUser" type="button">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="7" r="4"/><path d="M2 21v-2a4 4 0 014-4h6a4 4 0 014 4v2"/></svg>
          By tenant name
        </button>
      </div>

      <!-- BY SHOP path -->
      <div id="pathShopFields">
        <div class="field">
          <label for="pShop">Shop</label>
          <select id="pShop">
            <option value="">— select shop —</option>
          </select>
        </div>
        <div id="pShopTenantInfo" style="display:none;">
          <div class="field">
            <label>Tenant on this shop</label>
            <div class="info-card" id="pShopTenantCard"></div>
          </div>
        </div>
        <div id="pShopNoTenantWarn" style="display:none;" class="warn-box">
          ${warnIcon()}
          <span>This shop has no tenant — no bills to collect against.</span>
        </div>
      </div>

      <!-- BY TENANT path -->
      <div id="pathUserFields" style="display:none;">
        <div class="field">
          <label for="pUser">Tenant</label>
          <select id="pUser">
            <option value="">— select tenant —</option>
          </select>
        </div>
        <div id="pUserShopInfo" style="display:none;">
          <div class="field">
            <label>Shops held by this tenant (in complex)</label>
            <div class="info-card" id="pUserShopCard"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- BILLS section — shown after shop/tenant resolved -->
    <div id="pBillSection" style="display:none;">
      <div class="field">
        <label>Select bill to pay</label>
        <div id="pBillList" class="bill-list"></div>
        <div id="pNoBillsMsg" style="display:none; font-size:13px; color:var(--muted); padding:8px 0;">
          No pending bills found for this selection.
        </div>
      </div>
    </div>

    <!-- AMOUNT + METHOD — shown after bill selected -->
    <div id="pAmtSection" style="display:none;">
      <div class="form-grid">
        <div class="field" id="pAmountField">
          <label for="pAmount">Amount paying (₹)</label>
          <input id="pAmount" type="number" step="0.01" min="0.01" placeholder="0.00">
          ${fieldErrorHtml('pAmountErr')}
          <div class="hint" id="pAmountHint"></div>
        </div>
        <div class="field">
          <label for="pMethod">Payment method</label>
          <select id="pMethod">
            <option>Cash</option><option>UPI</option><option>Bank Transfer</option><option>Cheque</option><option>Card</option>
          </select>
        </div>
        <div class="field">
          <label for="pPayDate">Payment date</label>
          <input id="pPayDate" type="date">
        </div>
        <div class="field full">
          <label for="pRemarks">Remarks</label>
          <input id="pRemarks" placeholder="Optional note, transaction ID, etc.">
        </div>
      </div>

      <!-- Summary card -->
      <div id="pSummary" style="display:none;" class="pay-summary">
        <div class="ps-title">Payment summary</div>
        <div class="ps-row"><span class="ps-key">Tenant</span><span class="ps-val" id="psTenant">—</span></div>
        <div class="ps-row"><span class="ps-key">Shop</span><span class="ps-val" id="psShop">—</span></div>
        <div class="ps-row"><span class="ps-key">Bill</span><span class="ps-val" id="psBill">—</span></div>
        <div class="ps-row"><span class="ps-key">Bill total</span><span class="ps-val" id="psBillTotal">—</span></div>
        <div class="ps-row"><span class="ps-key">Already paid</span><span class="ps-val" id="psPaid">—</span></div>
        <div class="ps-row ps-total"><span class="ps-key">Paying now</span><span class="ps-val" id="psNow">—</span></div>
      </div>
    </div>

    <!-- AUTO-ALLOCATE PREVIEW — admin reviews/edits before anything is created -->
    <div id="pPreviewSection" style="display:none;">
      <div style="font-size:12px; color:var(--muted); background:var(--paper); border-radius:var(--radius-sm); padding:8px 11px; margin:14px 0 10px; display:flex; align-items:center; gap:7px;">
        Review the allocation below — edit any amount, then confirm to actually record the payments.
      </div>
      <div id="pPreviewRows"></div>
      <div class="pay-summary" style="margin-top:10px;">
        <div class="ps-row"><span class="ps-key">Amount received</span><span class="ps-val" id="pvReceived">—</span></div>
        <div class="ps-row"><span class="ps-key">Allocated to bills</span><span class="ps-val" id="pvAllocated">—</span></div>
        <div class="ps-row ps-total"><span class="ps-key">Unallocated (left over)</span><span class="ps-val" id="pvUnallocated">—</span></div>
      </div>
    </div>
  `, `
    <button class="btn btn-ghost" id="cancelBtn">Cancel</button>
    <button class="btn btn-ghost" id="pBackBtn" style="display:none;">Back / edit</button>
    <button class="btn btn-primary" id="pSaveBtn" disabled>Preview allocation</button>
  `);

  document.getElementById('cancelBtn').addEventListener('click', closeModal);

  // ---- internal state for the payment modal ----
  let _selectedUserId = null;
  let _selectedShopId = null;
  let _selectedBillId = null;
  let _currentPath = 'shop'; // 'shop' | 'user'
  let _mode = 'auto'; // 'auto' | 'manual'
  let _autoStep = 'input'; // 'input' | 'preview'
  let _previewRows = []; // last preview rows from server, editable by admin
  let _amountReceived = 0;

  function resetAutoPreview(){
    _autoStep = 'input';
    _previewRows = [];
    document.getElementById('pPreviewSection').style.display = 'none';
    document.getElementById('pPreviewRows').innerHTML = '';
    document.getElementById('pBackBtn').style.display = 'none';
    document.getElementById('pAmtSection').style.display = _selectedUserId ? 'block' : 'none';
    if (!document.getElementById('pPayDate').value) document.getElementById('pPayDate').value = new Date().toISOString().slice(0,10);
    document.getElementById('pSaveBtn').textContent = 'Preview allocation';
    document.getElementById('pSaveBtn').disabled = !(parseFloat(document.getElementById('pAmount')?.value) > 0);
  }

  function renderPreviewRows(){
    const wrap = document.getElementById('pPreviewRows');
    if (_previewRows.length === 0){
      wrap.innerHTML = `<div style="font-size:13px; color:var(--muted); padding:8px 0;">No pending bills found for this selection — nothing to allocate.</div>`;
      return;
    }
    wrap.innerHTML = _previewRows.map((r, i) => `
      <label class="bill-row" style="align-items:center;">
        <div class="bill-row-info">
          <div class="btype">${escapeHtml(r.bill_type)}${r.shop_number ? ` <span style="font-size:11.5px; color:var(--muted); font-weight:400;">· Shop ${escapeHtml(r.shop_number)}</span>` : ''}</div>
          <div class="bmeta">Bill #${r.bill_id} · due ${dateFmt(r.due_date)} · outstanding ${currency(r.outstanding)} → will be <strong>${r.resulting_status}</strong></div>
        </div>
        <div class="bill-row-amt">
          <input type="number" step="0.01" min="0" max="${r.outstanding}" value="${r.allocated.toFixed(2)}"
                 data-preview-idx="${i}" style="width:110px; text-align:right;" class="preview-amt-input">
        </div>
      </label>
    `).join('');

    wrap.querySelectorAll('.preview-amt-input').forEach(inp => {
      inp.addEventListener('input', () => {
        const idx = Number(inp.dataset.previewIdx);
        let val = parseFloat(inp.value);
        const max = _previewRows[idx].outstanding;
        if (isNaN(val) || val < 0) val = 0;
        if (val > max) val = max; // never exceed the bill's outstanding balance
        _previewRows[idx].allocated = val;
        inp.value = val.toFixed(2);
        updatePreviewTotals();
      });
    });
    updatePreviewTotals();
  }

  function updatePreviewTotals(){
    const allocated = _previewRows.reduce((s, r) => s + r.allocated, 0);
    document.getElementById('pvReceived').textContent = currency(_amountReceived);
    document.getElementById('pvAllocated').textContent = currency(allocated);
    document.getElementById('pvUnallocated').textContent = currency(Math.max(0, _amountReceived - allocated));
  }

  function enableAutoSection(userId, shopId){
    _selectedUserId = userId;
    _selectedShopId = shopId; // null => all shops for this tenant
    _selectedBillId = -1; // sentinel: no single bill in auto mode
    document.getElementById('pBillSection').style.display = 'none';
    const amtSection = document.getElementById('pAmtSection');
    const amtInput = document.getElementById('pAmount');
    const amtHint = document.getElementById('pAmountHint');
    amtSection.style.display = 'block';
    amtInput.value = '';
    amtHint.textContent = shopId
      ? 'Applied to this shop\'s oldest pending bills first (FIFO).'
      : 'Applied across all this tenant\'s shops, oldest bills first (FIFO).';
    document.getElementById('pSummary').style.display = 'none';
    amtInput.oninput = () => { document.getElementById('pSaveBtn').disabled = !(parseFloat(amtInput.value) > 0); };
    resetAutoPreview();
    amtInput.focus();
  }

  document.getElementById('pBackBtn').addEventListener('click', resetAutoPreview);

  document.getElementById('modeAuto').addEventListener('click', () => {
    _mode = 'auto';
    document.getElementById('modeAuto').classList.add('active');
    document.getElementById('modeManual').classList.remove('active');
    document.getElementById('pModeHint').textContent = "Enter one amount received — it will be applied to the tenant's oldest pending bills first, automatically.";
    resetFromPath();
  });
  document.getElementById('modeManual').addEventListener('click', () => {
    _mode = 'manual';
    document.getElementById('modeManual').classList.add('active');
    document.getElementById('modeAuto').classList.remove('active');
    document.getElementById('pModeHint').textContent = 'Pick a specific bill and enter a custom amount for it.';
    document.getElementById('pPreviewSection').style.display = 'none';
    document.getElementById('pBackBtn').style.display = 'none';
    document.getElementById('pSaveBtn').textContent = 'Record payment';
    resetFromPath();
  });


  function resetBillSection(){
    _selectedBillId = null;
    _autoStep = 'input';
    _previewRows = [];
    document.getElementById('pBillSection').style.display = 'none';
    document.getElementById('pAmtSection').style.display = 'none';
    document.getElementById('pAmountField').style.display = 'block';
    if (!document.getElementById('pPayDate').value) document.getElementById('pPayDate').value = new Date().toISOString().slice(0,10);
    document.getElementById('pSummary').style.display = 'none';
    document.getElementById('pPreviewSection').style.display = 'none';
    document.getElementById('pBackBtn').style.display = 'none';
    document.getElementById('pSaveBtn').textContent = _mode === 'auto' ? 'Preview allocation' : 'Record payment';
    document.getElementById('pSaveBtn').disabled = true;
  }

  function resetFromPath(){
    _selectedUserId = null;
    _selectedShopId = null;
    resetBillSection();
  }

  function renderBills(userId, shopId){
    _selectedUserId = userId;
    _selectedShopId = shopId;
    resetBillSection();

    const allBills = state.cache.bills;
    // KEY CONFLICT GUARD: only show bills that belong to this exact user AND this exact shop
    const pending = allBills.filter(b =>
      b.user_id === userId &&
      b.shop_id === shopId &&
      b.status !== 'paid'
    );

    const billSection = document.getElementById('pBillSection');
    const billList = document.getElementById('pBillList');
    const noBillsMsg = document.getElementById('pNoBillsMsg');

    billSection.style.display = 'block';

    if (pending.length === 0){
      billList.innerHTML = '';
      noBillsMsg.style.display = 'block';
      return;
    }

    noBillsMsg.style.display = 'none';
    billList.innerHTML = pending.map(b => `
      <label class="bill-row" id="billRow_${b.id}">
        <input type="radio" name="selectedBill" value="${b.id}">
        <div class="bill-row-info">
          <div class="btype">${escapeHtml(b.bill_type)}</div>
          <div class="bmeta">Bill #${b.id} · due ${dateFmt(b.due_date)}${b.description ? ' · '+escapeHtml(b.description) : ''}</div>
        </div>
        <div class="bill-row-amt">
          <div class="bpending">${currency(b.pending_amount)}</div>
          <div class="bdue">pending</div>
        </div>
      </label>
    `).join('');

    // Auto-select if preselected
    if (preBillId){
      const radio = billList.querySelector(`input[value="${preBillId}"]`);
      if (radio){ radio.checked = true; radio.closest('.bill-row').classList.add('selected'); onBillSelected(Number(preBillId)); }
    }

    billList.querySelectorAll('input[name=selectedBill]').forEach(radio => {
      radio.addEventListener('change', () => {
        billList.querySelectorAll('.bill-row').forEach(r => r.classList.remove('selected'));
        radio.closest('.bill-row').classList.add('selected');
        onBillSelected(Number(radio.value));
      });
    });
  }

  function onBillSelected(billId){
    _selectedBillId = billId;
    const bill = state.cache.bills.find(b => b.id === billId);
    if (!bill) return;

    const amtSection = document.getElementById('pAmtSection');
    const amtInput = document.getElementById('pAmount');
    const amtHint = document.getElementById('pAmountHint');

    amtSection.style.display = 'block';
    amtInput.value = Number(bill.pending_amount).toFixed(2);
    amtHint.textContent = `Max: ${currency(bill.pending_amount)} (full pending amount)`;

    // Watch amount to update summary
    amtInput.addEventListener('input', updateSummary);
    document.getElementById('pMethod').addEventListener('change', updateSummary);
    updateSummary();
    document.getElementById('pSaveBtn').disabled = false;
  }

  function updateSummary(){
    const billId = _selectedBillId;
    const bill = state.cache.bills.find(b => b.id === billId);
    if (!bill) return;

    const amt = parseFloat(document.getElementById('pAmount').value);
    const shop = state.cache.shops.find(s => s.id === bill.shop_id);
    const user = state.cache.users.find(u => u.id === bill.user_id);
    const paidAlready = Number(bill.amount) - Number(bill.pending_amount);

    const summary = document.getElementById('pSummary');
    summary.style.display = 'block';
    document.getElementById('psTenant').textContent = user?.name || `#${bill.user_id}`;
    document.getElementById('psShop').textContent = shop?.shop_number || `#${bill.shop_id}`;
    document.getElementById('psBill').textContent = `#${bill.id} · ${bill.bill_type}`;
    document.getElementById('psBillTotal').textContent = currency(bill.amount);
    document.getElementById('psPaid').textContent = currency(paidAlready);
    document.getElementById('psNow').textContent = isNaN(amt) ? '—' : currency(amt);
  }

  // ---- Path toggle ----
  document.getElementById('pathByShop').addEventListener('click', () => {
    _currentPath = 'shop';
    document.getElementById('pathByShop').classList.add('active');
    document.getElementById('pathByUser').classList.remove('active');
    document.getElementById('pathShopFields').style.display = 'block';
    document.getElementById('pathUserFields').style.display = 'none';
    resetFromPath();
    // Re-trigger shop select if value set
    const shopSel = document.getElementById('pShop');
    if (shopSel.value) shopSel.dispatchEvent(new Event('change'));
  });

  document.getElementById('pathByUser').addEventListener('click', () => {
    _currentPath = 'user';
    document.getElementById('pathByUser').classList.add('active');
    document.getElementById('pathByShop').classList.remove('active');
    document.getElementById('pathUserFields').style.display = 'block';
    document.getElementById('pathShopFields').style.display = 'none';
    resetFromPath();
    const userSel = document.getElementById('pUser');
    if (userSel.value) userSel.dispatchEvent(new Event('change'));
  });

  // ---- Complex change: populate both shop and user lists ----
  function onComplexChange(){
    const complexId = Number(document.getElementById('pComplex').value);
    const pathSection = document.getElementById('pPathSection');
    const shopSel = document.getElementById('pShop');
    const userSel = document.getElementById('pUser');

    resetFromPath();
    document.getElementById('pShopTenantInfo').style.display = 'none';
    document.getElementById('pShopNoTenantWarn').style.display = 'none';
    document.getElementById('pUserShopInfo').style.display = 'none';

    if (!complexId){ pathSection.style.display = 'none'; return; }

    pathSection.style.display = 'block';

    // Populate shops in this complex
    const shopsInComplex = state.cache.shops.filter(s => s.complex_id === complexId);
    shopSel.innerHTML = '<option value="">— select shop —</option>' +
      shopsInComplex.map(s => {
        const suffix = s.assigned_to ? ` · ${s.assigned_to.name}` : ' · unoccupied';
        return `<option value="${s.id}" ${preShopId==s.id?'selected':''}>${escapeHtml(s.shop_number)}${escapeHtml(suffix)}</option>`;
      }).join('');

    // Populate tenants who have shops in this complex
    const tenantIdsInComplex = new Set(
      shopsInComplex.filter(s => s.assigned_to).map(s => s.assigned_to.id)
    );
    const tenantsInComplex = state.cache.users.filter(u => u.role === 'tenant' && tenantIdsInComplex.has(u.id));
    userSel.innerHTML = '<option value="">— select tenant —</option>' +
      tenantsInComplex.map(u => `<option value="${u.id}" ${preUserId==u.id?'selected':''}>${escapeHtml(u.name)} · ${escapeHtml(u.mobile)}</option>`).join('');

    if (tenantsInComplex.length === 0){
      userSel.innerHTML = '<option value="">No tenants with shops in this complex</option>';
    }

    // If preselected shop, trigger change
    if (preShopId && shopsInComplex.find(s => s.id == preShopId)){
      shopSel.value = preShopId;
      shopSel.dispatchEvent(new Event('change'));
    }
  }

  document.getElementById('pComplex').addEventListener('change', onComplexChange);

  // ---- By Shop: shop change → resolve tenant, load bills ----
  document.getElementById('pShop').addEventListener('change', () => {
    const shopId = Number(document.getElementById('pShop').value);
    const tenantInfo = document.getElementById('pShopTenantInfo');
    const tenantCard = document.getElementById('pShopTenantCard');
    const noTenantWarn = document.getElementById('pShopNoTenantWarn');
    resetBillSection();

    tenantInfo.style.display = 'none';
    noTenantWarn.style.display = 'none';

    if (!shopId) return;

    const shop = state.cache.shops.find(s => s.id === shopId);
    if (!shop || !shop.assigned_to){
      noTenantWarn.style.display = 'flex';
      return;
    }

    const user = state.cache.users.find(u => u.id === shop.assigned_to.id);
    tenantCard.innerHTML = `
      <div class="info-row"><span class="info-label">Tenant</span><span class="info-val">${escapeHtml(shop.assigned_to.name)}</span></div>
      <div class="info-row"><span class="info-label">Mobile</span><span class="info-val">${escapeHtml(user?.mobile || '—')}</span></div>
    `;
    tenantInfo.style.display = 'block';
    // Render bills: only for this tenant + this shop (no cross-contamination)
    if (_mode === 'auto') enableAutoSection(shop.assigned_to.id, shopId);
    else renderBills(shop.assigned_to.id, shopId);
  });

  // ---- By Tenant: user change → show shops, load bills ----
  document.getElementById('pUser').addEventListener('change', () => {
    const userId = Number(document.getElementById('pUser').value);
    const complexId = Number(document.getElementById('pComplex').value);
    const shopInfo = document.getElementById('pUserShopInfo');
    const shopCard = document.getElementById('pUserShopCard');
    resetBillSection();
    shopInfo.style.display = 'none';

    if (!userId) return;

    // Find shops this tenant holds in this complex
    const userShops = state.cache.shops.filter(s =>
      s.complex_id === complexId && s.assigned_to?.id === userId
    );

    if (userShops.length === 0){
      shopCard.innerHTML = `<div class="info-row"><span class="info-label">Shops</span><span class="info-val warn">None in this complex</span></div>`;
      shopInfo.style.display = 'block';
      return;
    }

    shopCard.innerHTML = userShops.map(s => `
      <div class="info-row"><span class="info-label">Shop</span><span class="info-val">${escapeHtml(s.shop_number)}</span></div>
    `).join('');
    shopInfo.style.display = 'block';

    if (_mode === 'auto'){
      if (userShops.length > 1){
        shopCard.innerHTML += `
          <label style="display:flex; align-items:center; gap:6px; margin-top:8px; font-size:13px; cursor:pointer;">
            <input type="checkbox" id="pAllShops" checked> Apply across all shops above (FIFO)
          </label>`;
        document.getElementById('pAllShops').addEventListener('change', (e) => {
          enableAutoSection(userId, e.target.checked ? null : userShops[0].id);
        });
        enableAutoSection(userId, null);
      } else {
        enableAutoSection(userId, userShops[0].id);
      }
      return;
    }

    // If only one shop, auto-load bills for that shop+user combo
    if (userShops.length === 1){
      renderBills(userId, userShops[0].id);
    } else {
      // Multiple shops: show all pending bills across all their shops in this complex
      // Pick the first shop with pending bills, or show combined
      // We aggregate bills across all user's shops in this complex
      const allUserShopIds = new Set(userShops.map(s => s.id));
      const pending = state.cache.bills.filter(b =>
        b.user_id === userId &&
        allUserShopIds.has(b.shop_id) &&
        b.status !== 'paid'
      );

      // Show bills but use actual shop_id from each bill (no conflict possible since user_id matches)
      _selectedUserId = userId;
      _selectedShopId = null; // multiple — will be resolved per bill
      const billSection = document.getElementById('pBillSection');
      const billList = document.getElementById('pBillList');
      const noBillsMsg = document.getElementById('pNoBillsMsg');
      billSection.style.display = 'block';

      if (pending.length === 0){
        billList.innerHTML = '';
        noBillsMsg.style.display = 'block';
        return;
      }
      noBillsMsg.style.display = 'none';
      billList.innerHTML = pending.map(b => {
        const billShop = state.cache.shops.find(s => s.id === b.shop_id);
        return `
        <label class="bill-row" id="billRow_${b.id}">
          <input type="radio" name="selectedBill" value="${b.id}" data-shop-id="${b.shop_id}">
          <div class="bill-row-info">
            <div class="btype">${escapeHtml(b.bill_type)} <span style="font-size:11.5px; color:var(--muted); font-weight:400;">· Shop ${escapeHtml(billShop?.shop_number||'#'+b.shop_id)}</span></div>
            <div class="bmeta">Bill #${b.id} · due ${dateFmt(b.due_date)}${b.description ? ' · '+escapeHtml(b.description) : ''}</div>
          </div>
          <div class="bill-row-amt">
            <div class="bpending">${currency(b.pending_amount)}</div>
            <div class="bdue">pending</div>
          </div>
        </label>`;
      }).join('');

      billList.querySelectorAll('input[name=selectedBill]').forEach(radio => {
        radio.addEventListener('change', () => {
          billList.querySelectorAll('.bill-row').forEach(r => r.classList.remove('selected'));
          radio.closest('.bill-row').classList.add('selected');
          _selectedShopId = Number(radio.dataset.shopId);
          onBillSelected(Number(radio.value));
        });
      });
    }
  });

  // ---- Save payment ----
  document.getElementById('pSaveBtn').addEventListener('click', async () => {
    if (_mode === 'auto'){
      if (!_selectedUserId){ showToast('Select a tenant/shop first', 'error'); return; }
      const payment_method = document.getElementById('pMethod').value;
      const remarks = document.getElementById('pRemarks').value.trim();
      const payment_date = document.getElementById('pPayDate').value ? new Date(document.getElementById('pPayDate').value).toISOString() : null;

      // STEP 1: build & show the preview — nothing is saved yet
      if (_autoStep === 'input'){
        const amount = parseFloat(document.getElementById('pAmount').value);
        if (isNaN(amount) || amount <= 0){
          showFieldError('pAmountErr', 'Enter a valid amount');
          document.getElementById('pAmount').classList.add('invalid');
          return;
        }
        await withSavingState('pSaveBtn', async () => {
          const res = await api('/api/payment/auto-allocate/preview', { method:'POST', body:{
            user_id: _selectedUserId, shop_id: _selectedShopId, amount
          }});
          _amountReceived = amount;
          _previewRows = res.rows.map(r => ({...r})); // editable copy
          _autoStep = 'preview';
          document.getElementById('pPreviewSection').style.display = 'block';
          document.getElementById('pAmountField').style.display = 'none';
          document.getElementById('pBackBtn').style.display = 'inline-flex';
          document.getElementById('pSaveBtn').textContent = 'Confirm & record payment(s)';
          document.getElementById('pSaveBtn').disabled = _previewRows.length === 0;
          renderPreviewRows();
        });
        return;
      }

      // STEP 2: admin has reviewed/edited the preview — actually create the payments
      const allocations = _previewRows.filter(r => r.allocated > 0).map(r => ({ bill_id: r.bill_id, amount: r.allocated }));
      if (allocations.length === 0){ showToast('Nothing to allocate — all amounts are 0', 'error'); return; }

      await withSavingState('pSaveBtn', async () => {
        const res = await api('/api/payment/auto-allocate/confirm', { method:'POST', body:{
          user_id: _selectedUserId, amount_received: _amountReceived,
          payment_method, remarks, allocations, payment_date
        }});
        state.loaded.bills = false;
        state.loaded.payments = false;
        closeModal();
        const n = res.allocations.length;
        const capped = res.allocations.filter(a => a.note).length;
        let msg = `${currency(res.total_allocated)} allocated across ${n} bill(s).`;
        if (res.unallocated_amount > 0.005) msg += ` ${currency(res.unallocated_amount)} left unallocated.`;
        if (capped > 0) msg += ` ${capped} amount(s) were capped — balances had changed since preview.`;
        showToast(msg, 'success');
        await renderView('billing');
      });
      return;
    }

    if (!_selectedBillId){ showToast('Select a bill first', 'error'); return; }

    const bill = state.cache.bills.find(b => b.id === _selectedBillId);
    if (!bill){ showToast('Bill not found', 'error'); return; }

    const amount = parseFloat(document.getElementById('pAmount').value);
    const payment_method = document.getElementById('pMethod').value;
    const remarks = document.getElementById('pRemarks').value.trim();
    const payment_date = document.getElementById('pPayDate').value ? new Date(document.getElementById('pPayDate').value).toISOString() : null;

    // Conflict guards
    if (isNaN(amount) || amount <= 0){
      showFieldError('pAmountErr', 'Enter a valid amount');
      document.getElementById('pAmount').classList.add('invalid');
      return;
    }
    if (amount > Number(bill.pending_amount) + 0.001){
      showFieldError('pAmountErr', `Amount exceeds pending due of ${currency(bill.pending_amount)}`);
      document.getElementById('pAmount').classList.add('invalid');
      return;
    }

    // Verify the bill actually belongs to the resolved tenant (final guard)
    if (_selectedUserId && bill.user_id !== _selectedUserId){
      showToast('Conflict: this bill does not belong to the selected tenant. Refresh and try again.', 'error');
      return;
    }

    await withSavingState('pSaveBtn', async () => {
      await api('/api/payment', { method:'POST', body:{
        bill_id: _selectedBillId,
        amount,
        payment_method,
        remarks,
        payment_date
      }});
      state.loaded.bills = false;
      state.loaded.payments = false;
      closeModal();
      showToast(`Payment of ${currency(amount)} recorded`, 'success');
      await renderView('billing');
    });
  });

  // If opened via a specific bill's quick-pay button, default to Manual mode so that bill stays preselected
  if (preBillId){
    document.getElementById('modeManual').click();
  }

  // Trigger preselected complex if coming from a bill's quick-pay button
  if (presel?.preselectedComplexId){
    document.getElementById('pComplex').value = presel.preselectedComplexId;
    onComplexChange();
  }

  // Trigger preselected tenant (no specific bill/shop) if coming from the billing browser
  if (preUserId && !preBillId && !preShopId){
    document.getElementById('pathByUser').click();
    const userSel = document.getElementById('pUser');
    if (userSel.value) userSel.dispatchEvent(new Event('change'));
  }
}

/* ---- DELETE confirm ---- */
function confirmDelete(type, id, name){
  const endpoints = { complex:'/api/complex', shop:'/api/shop', user:'/api/user' };
  openModal(`Delete ${type}`, `
    <div class="confirm-body">Are you sure you want to delete <strong>${escapeHtml(name)}</strong>? This can't be undone.</div>
  `, `
    <button class="btn btn-ghost" id="cancelBtn">Cancel</button>
    <button class="btn btn-danger-ghost" id="confirmDeleteBtn">Delete</button>
  `);
  document.getElementById('cancelBtn').addEventListener('click', closeModal);
  document.getElementById('confirmDeleteBtn').addEventListener('click', async () => {
    await withSavingState('confirmDeleteBtn', async () => {
      await api(`${endpoints[type]}/${id}`, { method:'DELETE' });
      state.loaded[type === 'complex' ? 'complexes' : type === 'shop' ? 'shops' : 'users'] = false;
      closeModal();
      showToast(`${name} deleted`, 'success');
      await renderView(state.view);
    }, 'Deleting…');
  });
}

/* ---- Saving-state helper for buttons ---- */
async function withSavingState(btnId, fn, label){
  const btn = document.getElementById(btnId);
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner${btn.classList.contains('btn-ghost')||btn.classList.contains('btn-danger-ghost') ? ' dark':''}"></span> ${label || 'Saving…'}`;
  try { await fn(); }
  catch (err) { showToast(err.message || 'Something went wrong', 'error'); btn.disabled = false; btn.innerHTML = original; }
}

/* ================================================================
   SHARED WITH TENANT PORTAL
   (also used here by the admin's own Ledger view — kept in sync with
   the identical copy in ../USER/script.js)
   ================================================================ */
function toggleCollapse(header){
  header.classList.toggle('open');
  const body = header.nextElementSibling;
  body.classList.toggle('open');
}

/* ================================================================
   INIT
   (the guard script in <head> already confirmed a valid admin session)
   ================================================================ */
(async function boot(){
  await initAdminUser();
  navigateTo('dashboard');
})();
