/* ================================================================
   ADMIN/js/shops.js — split from the old ADMIN/script.js
   Contains: SHOPS VIEW — grouped by complex.
   Level 1: one summary card per complex (total / occupied / vacant + progress bar).
   Level 2: click a card to drill into that complex's shop details table.
   Shops with no complex fall into a "Shops without a Complex" card.
   ================================================================ */
let _shopsSelectedComplex = null;   // null = show cards; number = complex id; 'unassigned' = orphan shops

/* Shared drill-in helper — any view that shows a complex (Complexes list,
   Dashboard complex overview, Deposits "by property") can call this to jump
   straight to that complex's shop list, reusing the Level 1→2 drill already
   built here instead of each view inventing its own navigation. */
function goToShopsForComplex(complexId){
  _shopsSelectedComplex = complexId;
  navigateTo('shops');
}

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
