/* ================================================================
   ADMIN/js/modals.js — split from the old ADMIN/script.js
   Contains: the shared MODAL ENGINE (open/close, field errors) plus
   the Complex / Shop / User create-edit modals and the Assign Shops
   modal. Bill and Payment modals live in their own files.
   ================================================================ */
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
function closeModal(){ modalOverlay.classList.remove('show'); document.getElementById('modalEl')?.classList.remove('modal-wide'); }

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

      ${!isEdit ? `
      <!-- Optional submeter, so a metered shop can be set up in one go instead
           of a second trip through the Submeters screen. -->
      <div class="shop-meter-block">
        <label class="checkbox-row" style="padding:0;">
          <input type="checkbox" id="sHasMeter"> <strong>This shop has an electricity submeter</strong>
        </label>
        <div id="sMeterFields" style="display:none; margin-top:12px;">
          <div class="form-grid">
            <div class="field">
              <label for="sMeterNumber">Meter number</label>
              <input id="sMeterNumber" placeholder="MTR-001">
              ${fieldErrorHtml('sMeterNumberErr')}
            </div>
            <div class="field">
              <label for="sMeterReading">Reading on the meter today</label>
              <input id="sMeterReading" type="number" step="0.01" min="0" value="0">
              <div class="hint">The first bill only charges units used above this.</div>
            </div>
          </div>
        </div>
      </div>` : ''}
    </form>
  `, `
    <button class="btn btn-ghost" id="cancelBtn">Cancel</button>
    <button class="btn btn-primary" id="saveBtn" ${complexes.length===0?'disabled':''}>${isEdit ? 'Save changes' : 'Add shop'}</button>
  `);
  document.getElementById('cancelBtn').addEventListener('click', closeModal);

  // Reveal the meter fields only when the box is ticked.
  document.getElementById('sHasMeter')?.addEventListener('change', (e) => {
    document.getElementById('sMeterFields').style.display = e.target.checked ? 'block' : 'none';
    if (e.target.checked) document.getElementById('sMeterNumber').focus();
  });

  document.getElementById('saveBtn').addEventListener('click', async () => {
    const form = document.getElementById('shopForm');
    clearFieldErrors(form);
    const shop_number = document.getElementById('sNumber').value.trim();
    const area_sqft = parseFloat(document.getElementById('sArea').value);
    const status = document.getElementById('sStatus').value;
    const complex_id = Number(document.getElementById('sComplex').value);
    const wantsMeter = document.getElementById('sHasMeter')?.checked;
    const meterNumber = (document.getElementById('sMeterNumber')?.value || '').trim();

    let ok = true;
    if (!shop_number){ showFieldError('sNumberErr','Shop number is required'); document.getElementById('sNumber').classList.add('invalid'); ok=false; }
    if (isNaN(area_sqft) || area_sqft <= 0){ showFieldError('sAreaErr','Enter a valid area'); document.getElementById('sArea').classList.add('invalid'); ok=false; }
    if (wantsMeter && !meterNumber){ showFieldError('sMeterNumberErr','Enter the meter number, or untick the box'); ok=false; }
    if (!ok) return;

    await withSavingState('saveBtn', async () => {
      const body = { shop_number, area_sqft, status, complex_id,
        shop_rent: parseFloat(document.getElementById('sRent').value) || 0,
        shop_deposit: parseFloat(document.getElementById('sDeposit').value) || 0
      };

      if (isEdit){
        await api(`/api/shop/${existing.id}`, { method:'PUT', body });
        state.loaded.shops = false;
        closeModal();
        showToast('Shop updated', 'success');
        await renderView('shops');
        return;
      }

      const shop = await api('/api/shop', { method:'POST', body });
      state.loaded.shops = false;

      if (wantsMeter){
        // The shop already exists at this point, so if the meter fails we say
        // so plainly rather than pretending the whole thing failed.
        try {
          await api('/api/meters', { method:'POST', body:{
            shop_id: shop.id,
            meter_number: meterNumber,
            meter_type: 'electricity',
            initial_reading: parseFloat(document.getElementById('sMeterReading').value) || 0,
            installation_date: new Date().toISOString(),
          }});
          closeModal();
          showToast(`Shop added with meter ${meterNumber}`, 'success');
        } catch (err) {
          closeModal();
          showToast(`Shop added, but the meter could not be created: ${err.message}`, 'error');
        }
      } else {
        closeModal();
        showToast('Shop added', 'success');
      }
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
