/* ================================================================
   ADMIN/js/deposits.js — split from the old ADMIN/script.js
   Contains: DEPOSITS VIEW plus its edit/delete/record modals.
   ================================================================ */
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
