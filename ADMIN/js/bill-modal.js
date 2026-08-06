/* ================================================================
   ADMIN/js/bill-modal.js — split from the old ADMIN/script.js
   Contains: BILL MODAL — Smart cascade: Complex → Shop → Tenant
   (auto-locked), used by the Billing/Finance "Add" flow.
   ================================================================ */
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
