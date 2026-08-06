/* ================================================================
   ADMIN/js/nav.js — split from the old ADMIN/script.js
   Contains: ADMIN NAV / VIEW ROUTING (sidebar, viewMeta, renderView
   router, refresh) and GLOBAL SEARCH. Loads after core.js and
   before the view files (dashboard.js, billing.js, etc.) since
   renderView()'s switch statement calls into them — though since
   those are all function declarations, only the *order the views
   actually run in* (after every script has loaded) matters, not
   declaration order.
   ================================================================ */

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
  billing:   { title:'Finance', crumb:'Add, manage, and browse every bill and payment — tenant-wise, property-wise, or by dues overview', action:null },
  deposits:  { title:'Deposit Payments', crumb:'Security deposit collection tracking', action:'Record deposit' },
  reports:   { title:'Reports', crumb:'Occupancy, collections and outstanding dues', action:null },
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
      case 'deposits': content.innerHTML = await depositsView(); attachDepositHandlers(); break;
      case 'reports': content.innerHTML = await reportsView(); attachReportsHandlers(); break;
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
