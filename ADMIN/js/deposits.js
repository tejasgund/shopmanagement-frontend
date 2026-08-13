/* ================================================================
   ADMIN/js/deposits.js — split from the old ADMIN/script.js, then
   redesigned with three views so the numbers that matter for the
   business are visible at a glance instead of buried in a raw list:

     - By tenant   — required vs paid vs remaining per tenant, with
                     a progress bar, and an Active/Inactive toggle
                     (inactive = tenant currently holds no shop).
     - By property — the same, grouped by complex.
     - All payments — the original flat, chronological payment log,
                     kept for record-keeping and the edit/delete
                     actions.
   ================================================================ */

async function depositsView(){
  await Promise.all([
    ensureLoaded('complexes','/api/complex'),
    ensureLoaded('users','/api/user'),
    ensureLoaded('shops','/api/shop'),
  ]);
  let deposits = [];
  try { deposits = await api('/api/deposit-payment'); } catch(e){}
  state.cache.deposits = deposits;

  const mode = state.deposits.mode || 'tenant';
  return `
  <div class="billing-mode-switch">
    <button type="button" class="billing-mode-btn ${mode==='tenant'?'active':''}" data-deposit-mode="tenant">By tenant</button>
    <button type="button" class="billing-mode-btn ${mode==='property'?'active':''}" data-deposit-mode="property">By property</button>
    <button type="button" class="billing-mode-btn ${mode==='all'?'active':''}" data-deposit-mode="all">All payments</button>
  </div>
  <div id="depositsBody"></div>
  `;
}

function attachDepositHandlers(){
  document.querySelectorAll('[data-deposit-mode]').forEach(btn => btn.addEventListener('click', () => {
    const mode = btn.dataset.depositMode;
    if (mode === state.deposits.mode) return;
    state.deposits.mode = mode;
    document.querySelectorAll('[data-deposit-mode]').forEach(b => b.classList.toggle('active', b.dataset.depositMode === mode));
    renderDepositsBody();
  }));
  renderDepositsBody();
}

function renderDepositsBody(){
  const container = document.getElementById('depositsBody');
  if (!container) return;
  const mode = state.deposits.mode || 'tenant';
  if (mode === 'property') container.innerHTML = depositsByPropertyHtml();
  else if (mode === 'all') container.innerHTML = depositsAllPaymentsHtml();
  else container.innerHTML = depositsByTenantHtml();
  attachDepositsBodyHandlers();
}

function depositTenantStats(u){
  const shops = state.cache.shops || [];
  const deposits = state.cache.deposits || [];
  const ownedShops = shops.filter(s => s.assigned_to?.id === u.id);
  const isActive = ownedShops.length > 0;
  const required = ownedShops.reduce((s,sh)=>s+Number(sh.shop_deposit||0),0);
  const userDeposits = deposits.filter(d => d.user_id === u.id);
  const paid = userDeposits.reduce((s,d)=>s+Number(d.amount||0),0);
  const remaining = Math.max(0, required - paid);
  const pct = required > 0 ? Math.min(100, Math.round(paid/required*100)) : (paid>0 ? 100 : 0);
  return { user:u, ownedShops, isActive, required, paid, remaining, pct, paymentCount: userDeposits.length };
}

function depositsByTenantHtml(){
  const users = (state.cache.users || []).filter(u => u.role === 'tenant');
  const showInactive = state.deposits.showInactive;

  const rows = users.map(depositTenantStats)
    .filter(r => showInactive ? true : r.isActive)
    .sort((a,b)=> b.remaining - a.remaining || a.user.name.localeCompare(b.user.name));

  const toolbar = `
  <div class="deposit-toolbar">
    <label class="deposit-toggle"><input type="checkbox" id="depositShowInactive" ${showInactive?'checked':''}> Show inactive tenants (no shops assigned)</label>
    <span class="filter-count">${rows.length} tenant${rows.length!==1?'s':''}</span>
  </div>`;

  if (rows.length === 0){
    return toolbar + emptyStateHtml('No tenants to show', 'Try including inactive tenants, or add a tenant first.', emptyIcon());
  }

  return toolbar + `
  <div class="deposit-group-grid">
    ${rows.map(r => `
    <div class="card deposit-group-card clickable-card" data-open-tenant-deposit="${r.user.id}" data-tenant-name="${escapeHtml(r.user.name)}" title="View ${escapeHtml(r.user.name)}'s full statement">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom:6px;">
        <div>
          <div style="font-weight:700; font-size:14.5px;">${escapeHtml(r.user.name)}</div>
          <div class="mono" style="font-size:12px; color:var(--muted);">${escapeHtml(r.user.mobile)}</div>
        </div>
        <span class="pill ${r.isActive?'active-pill':'inactive-pill'}"><span class="pill-dot"></span>${r.isActive?'Active':'Inactive'}</span>
      </div>
      <div style="font-size:11.5px; color:var(--muted); margin-bottom:10px;">${r.ownedShops.map(s=>escapeHtml(s.shop_number)).join(', ') || 'No shops assigned'}</div>
      <div class="billing-stat-line"><span>Required</span><strong>${currency(r.required)}</strong></div>
      <div class="billing-stat-line"><span>Paid</span><strong style="color:var(--green-deep);">${currency(r.paid)}</strong></div>
      <div class="billing-stat-line"><span>Remaining</span><strong style="color:${r.remaining>0?'var(--rust)':'var(--success)'};">${currency(r.remaining)}</strong></div>
      <div class="deposit-bar-wrap" style="margin-top:8px;"><div class="deposit-bar" style="width:${r.pct}%;"></div></div>
      <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--muted); margin-top:4px;">
        <span>${r.pct}% collected</span><span>${r.paymentCount} payment${r.paymentCount!==1?'s':''}</span>
      </div>
      <div style="margin-top:12px;">
        <button type="button" class="btn btn-ghost btn-sm" data-deposit-record="${r.user.id}">Record deposit</button>
      </div>
    </div>`).join('')}
  </div>`;
}

function depositsByPropertyHtml(){
  const complexes = state.cache.complexes || [];
  const shops = state.cache.shops || [];
  const deposits = state.cache.deposits || [];

  const groups = complexes.map(c => {
    const cShops = shops.filter(s => s.complex_id === c.id);
    const occupiedShops = cShops.filter(s => s.assigned_to);
    const required = cShops.reduce((s,sh)=>s+Number(sh.shop_deposit||0),0);
    const shopIds = new Set(cShops.map(s=>s.id));
    const paid = deposits.filter(d => shopIds.has(d.shop_id)).reduce((s,d)=>s+Number(d.amount||0),0);
    const remaining = Math.max(0, required - paid);
    const pct = required > 0 ? Math.min(100, Math.round(paid/required*100)) : (paid>0?100:0);
    return { id:c.id, name:c.name, shopCount:cShops.length, occupiedCount:occupiedShops.length, required, paid, remaining, pct };
  }).sort((a,b)=> b.remaining - a.remaining);

  if (groups.length === 0) return emptyStateHtml('No properties yet', 'Add a complex and assign shops to start tracking deposits.', emptyIcon());

  return `
  <div class="deposit-group-grid">
    ${groups.map(g => `
    <div class="card deposit-group-card clickable-card" data-open-complex-deposit="${g.id}" title="View ${escapeHtml(g.name)}'s shops">
      <div style="font-weight:700; font-size:14.5px; margin-bottom:4px;">${escapeHtml(g.name)}</div>
      <div style="font-size:11.5px; color:var(--muted); margin-bottom:10px;">${g.occupiedCount}/${g.shopCount} shops occupied</div>
      <div class="billing-stat-line"><span>Required</span><strong>${currency(g.required)}</strong></div>
      <div class="billing-stat-line"><span>Paid</span><strong style="color:var(--green-deep);">${currency(g.paid)}</strong></div>
      <div class="billing-stat-line"><span>Remaining</span><strong style="color:${g.remaining>0?'var(--rust)':'var(--success)'};">${currency(g.remaining)}</strong></div>
      <div class="deposit-bar-wrap" style="margin-top:8px;"><div class="deposit-bar" style="width:${g.pct}%;"></div></div>
      <div style="font-size:11px; color:var(--muted); margin-top:4px;">${g.pct}% collected</div>
    </div>`).join('')}
  </div>`;
}

function depositsAllPaymentsHtml(){
  const deposits = state.cache.deposits || [];
  const users = state.cache.users || [];
  const userName = (id) => users.find(u=>u.id===id)?.name || `#${id}`;

  return `
  <div class="toolbar"><input class="search-input" id="tableSearch" placeholder="Search deposits…"></div>
  ${deposits.length === 0 ? emptyStateHtml('No deposit payments', 'Record the first deposit payment using "Record deposit" in the By tenant view.', emptyIcon()) : `
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

function attachDepositsBodyHandlers(){
  document.getElementById('depositShowInactive')?.addEventListener('change', (e) => {
    state.deposits.showInactive = e.target.checked;
    renderDepositsBody();
  });
  document.querySelectorAll('[data-deposit-record]').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    openDepositModal(Number(btn.dataset.depositRecord));
  }));
  document.querySelectorAll('[data-edit-deposit]').forEach(btn => btn.addEventListener('click', () => openEditDepositModal(Number(btn.dataset.editDeposit))));
  document.querySelectorAll('[data-delete-deposit]').forEach(btn => btn.addEventListener('click', () => {
    const dp = (state.cache.deposits || []).find(x => x.id === Number(btn.dataset.deleteDeposit));
    if (dp) confirmDeleteDeposit(dp);
  }));
  document.querySelectorAll('[data-open-tenant-deposit]').forEach(card => card.addEventListener('click', (e) => {
    if (e.target.closest('[data-deposit-record]')) return;
    openTenantFullStatementModal(Number(card.dataset.openTenantDeposit), card.dataset.tenantName);
  }));
  document.querySelectorAll('[data-open-complex-deposit]').forEach(card => card.addEventListener('click', () => {
    goToShopsForComplex(Number(card.dataset.openComplexDeposit));
  }));
  attachSearchFilter();
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
async function openDepositModal(presetUserId){
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
          ${tenants.map(u=>`<option value="${u.id}" ${presetUserId==u.id?'selected':''}>${escapeHtml(u.name)} · ${escapeHtml(u.mobile)}</option>`).join('')}
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

  if (presetUserId){
    document.getElementById('dpTenant').dispatchEvent(new Event('change'));
  }

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
