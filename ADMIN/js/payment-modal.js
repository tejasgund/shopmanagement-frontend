/* ================================================================
   ADMIN/js/payment-modal.js — split from the old ADMIN/script.js
   Contains: PAYMENT MODAL — guided Complex → By Shop OR By Tenant →
   Bills flow (Auto Allocate + Manual modes), plus the generic
   confirmDelete() and withSavingState() helpers used across every
   modal in the app.
   ================================================================ */
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
