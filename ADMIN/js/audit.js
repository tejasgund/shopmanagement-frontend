/* ================================================================
   ADMIN/js/audit.js — split from the old ADMIN/script.js
   Contains: AUDIT LOG VIEW.
   ================================================================ */
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
