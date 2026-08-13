/* ================================================================
   ADMIN/js/users.js — split from the old ADMIN/script.js
   Contains: USERS VIEW plus the RESET PASSWORD MODAL (kept together
   since the modal is only opened from this view's row actions).
   ================================================================ */
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
            <td>${u.role === 'tenant' ? tenantLinkHtml(u.id, u.name) : `<strong>${escapeHtml(u.name)}</strong>`}${u.email ? `<div style="font-size:12px;color:var(--muted);">${escapeHtml(u.email)}</div>` : ''}</td>
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
