/* ================================================================
   ADMIN/js/submeters.js — Submeters (master data)

   Everything about the meters themselves lives here: adding them,
   editing them, putting them on a shop, taking them off, and looking
   at one meter's whole history.

   Reviewing/approving the readings tenants send is a different job and
   lives in the Meter Readings screen.
   ================================================================ */

const submeterState = {
  view: 'list',        // 'list' | 'detail'
  detailId: null,
  filter: 'all',       // 'all' | 'assigned' | 'unassigned' | 'inactive'
  complexId: '',
  _meters: [],
};

async function submetersView(){
  await Promise.all([
    ensureLoaded('complexes','/api/complex'),
    ensureLoaded('shops','/api/shop'),
  ]);
  if (submeterState.view === 'detail' && submeterState.detailId){
    return await submeterDetailHtml(submeterState.detailId);
  }
  return await submeterListHtml();
}

/* ================================================================
   LIST
   ================================================================ */
async function submeterListHtml(){
  const meters = await api('/api/meters');
  submeterState._meters = meters;
  const complexes = state.cache.complexes || [];

  const counts = {
    all: meters.length,
    assigned: meters.filter(m => m.is_assigned).length,
    unassigned: meters.filter(m => !m.is_assigned).length,
    inactive: meters.filter(m => !m.is_active).length,
  };

  let rows = meters;
  if (submeterState.filter === 'assigned')   rows = rows.filter(m => m.is_assigned);
  if (submeterState.filter === 'unassigned') rows = rows.filter(m => !m.is_assigned);
  if (submeterState.filter === 'inactive')   rows = rows.filter(m => !m.is_active);
  if (submeterState.complexId) rows = rows.filter(m => String(m.complex_id) === String(submeterState.complexId));

  const stats = `
  <div class="stat-row" style="margin-bottom:18px;">
    <div class="card stat-card"><div class="label">Submeters</div><div class="value">${counts.all}</div><div class="sub">registered in total</div></div>
    <div class="card stat-card accent-green"><div class="label">On a shop</div><div class="value">${counts.assigned}</div><div class="sub">tenants can send readings</div></div>
    <button type="button" class="card stat-card glance-card ${counts.unassigned?'accent-rust':''}" data-submeter-filter="unassigned" style="text-align:left; cursor:pointer;">
      <div class="label">Not assigned</div><div class="value">${counts.unassigned}</div>
      <div class="sub">${counts.unassigned ? 'need a shop — click to see' : 'all assigned'}</div>
    </button>
    <div class="card stat-card"><div class="label">Inactive</div><div class="value">${counts.inactive}</div><div class="sub">no longer in use</div></div>
  </div>`;

  const toolbar = `
  <div class="toolbar">
    <input class="search-input" id="tableSearch" placeholder="Search by meter number, shop or tenant…">
    <div class="filter-chips">
      ${[['all','All'],['assigned','On a shop'],['unassigned','Not assigned'],['inactive','Inactive']].map(([k,label])=>`
        <button class="chip ${submeterState.filter===k?'active':''}" data-submeter-filter="${k}">${label} (${counts[k]})</button>`).join('')}
    </div>
    <select class="sort-select" id="submeterComplexFilter">
      <option value="">All complexes</option>
      ${complexes.map(c=>`<option value="${c.id}" ${String(submeterState.complexId)===String(c.id)?'selected':''}>${escapeHtml(c.name)}</option>`).join('')}
    </select>
    <button class="btn btn-primary btn-sm" id="addSubmeterBtn">+ Add submeter</button>
  </div>`;

  if (!rows.length){
    return stats + toolbar + emptyStateHtml(
      meters.length ? 'No submeters match this filter' : 'No submeters yet',
      meters.length ? 'Try a different filter above.'
        : 'Add your first electricity submeter. You can register it now and put it on a shop later.',
      emptyIcon());
  }

  return stats + toolbar + `
  <div class="table-wrap">
    <table>
      <thead><tr>
        <th>Meter</th><th>Assigned to</th><th>Tenant</th>
        <th class="num">Current reading</th><th>Last updated</th><th>Status</th><th></th>
      </tr></thead>
      <tbody>
        ${rows.map(m => `
        <tr data-search="${escapeHtml(m.meter_number+' '+(m.shop_number||'')+' '+(m.complex_name||'')+' '+(m.assigned_to?.name||''))}">
          <td>
            <button type="button" class="submeter-link mono" data-open-submeter="${m.id}">${escapeHtml(m.meter_number)}</button>
            <div style="font-size:11.5px; color:var(--muted);">${escapeHtml(m.meter_type)}${m.reading_count?` · ${m.reading_count} reading${m.reading_count!==1?'s':''}`:' · never read'}</div>
          </td>
          <td>
            ${m.is_assigned
              ? `<strong class="mono">${escapeHtml(m.shop_number)}</strong><div style="font-size:11.5px; color:var(--muted);">${escapeHtml(m.complex_name||'—')}</div>`
              : `<span class="pill inactive-pill"><span class="pill-dot"></span>not assigned</span>`}
          </td>
          <td>${m.assigned_to ? tenantLinkHtml(m.assigned_to.id, m.assigned_to.name)
                : `<span style="color:var(--muted); font-size:13px;">—</span>`}</td>
          <td class="num mono"><strong>${fmtReading(m.current_reading)}</strong></td>
          <td>
            ${m.last_updated
              ? `${dateFmt(m.last_updated)}${m.has_pending_reading?'<div style="font-size:11.5px; color:var(--rust); font-weight:600;">new reading waiting</div>':''}`
              : `<span style="color:var(--muted);">never</span>${m.has_pending_reading?'<div style="font-size:11.5px; color:var(--rust); font-weight:600;">first reading waiting</div>':''}`}
          </td>
          <td><span class="pill ${m.is_active?'active-pill':'inactive-pill'}"><span class="pill-dot"></span>${m.is_active?'active':'inactive'}</span></td>
          <td><div class="row-actions">
            ${!m.is_assigned ? `<button class="btn btn-primary btn-sm" data-assign-submeter="${m.id}">Assign</button>` : ''}
            <button class="btn-icon" data-edit-submeter="${m.id}" title="Edit" aria-label="Edit submeter">${editIcon()}</button>
            <button class="btn-icon" data-delete-submeter="${m.id}" data-name="${escapeHtml(m.meter_number)}" title="Delete" aria-label="Delete submeter">${trashIcon()}</button>
          </div></td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

/* ================================================================
   DETAIL — one meter's whole story
   ================================================================ */
async function submeterDetailHtml(meterId){
  const data = await api(`/api/meters/${meterId}/history`);
  const m = data.meter, s = data.summary;

  const timeline = data.readings.length === 0
    ? `<div class="empty-compact">No readings have been sent for this meter yet.</div>`
    : data.readings.map(r => submeterHistoryRowHtml(r)).join('');

  return `
  <div class="toolbar" style="align-items:center;">
    <button class="btn btn-ghost btn-sm" id="submeterBackBtn">← All submeters</button>
    <div style="font-weight:700; font-size:16px;">Meter ${escapeHtml(m.meter_number)}</div>
    <span class="pill ${m.is_active?'active-pill':'inactive-pill'}"><span class="pill-dot"></span>${m.is_active?'active':'inactive'}</span>
    <div style="flex:1;"></div>
    ${!m.is_assigned ? `<button class="btn btn-primary btn-sm" data-assign-submeter="${m.id}">Assign to a shop</button>`
                     : `<button class="btn btn-ghost btn-sm" data-unassign-submeter="${m.id}">Remove from shop</button>`}
    <button class="btn btn-ghost btn-sm" data-edit-submeter="${m.id}">Edit details</button>
  </div>

  <!-- Where it is -->
  <div class="card card-pad sm-detail-head">
    <div>
      <div class="sm-detail-label">Installed at</div>
      <div class="sm-detail-value">${m.is_assigned
        ? `${escapeHtml(m.shop_number)} <span style="font-weight:400; color:var(--muted); font-size:13px;">· ${escapeHtml(m.complex_name||'—')}</span>`
        : '<span style="color:var(--rust);">Not assigned to any shop</span>'}</div>
    </div>
    <div>
      <div class="sm-detail-label">Tenant</div>
      <div class="sm-detail-value">${m.assigned_to ? escapeHtml(m.assigned_to.name) : '—'}</div>
    </div>
    <div>
      <div class="sm-detail-label">Reading when installed</div>
      <div class="sm-detail-value mono">${fmtReading(m.initial_reading)}</div>
    </div>
    <div>
      <div class="sm-detail-label">Installed on</div>
      <div class="sm-detail-value">${m.installation_date ? dateFmt(m.installation_date) : '—'}</div>
    </div>
  </div>

  <!-- Headline numbers -->
  <div class="stat-row">
    <div class="card stat-card accent-green">
      <div class="label">Current reading</div>
      <div class="value mono">${fmtReading(m.current_reading)}</div>
      <div class="sub">${m.last_updated ? 'confirmed '+dateFmt(m.last_updated) : 'nothing confirmed yet'}</div>
    </div>
    <div class="card stat-card">
      <div class="label">Total units billed</div>
      <div class="value mono">${fmtReading(s.total_units)}</div>
      <div class="sub">over ${s.approved_count} confirmed reading${s.approved_count!==1?'s':''}</div>
    </div>
    <div class="card stat-card">
      <div class="label">Total billed</div>
      <div class="value mono">${currency(s.total_billed)}</div>
      <div class="sub">${s.average_units_per_reading!=null?`avg ${fmtReading(s.average_units_per_reading)} units each`:'—'}</div>
    </div>
    <div class="card stat-card ${s.pending_count?'accent-rust':''}">
      <div class="label">Waiting for review</div>
      <div class="value">${s.pending_count}</div>
      <div class="sub">${s.rejected_count} rejected in the past</div>
    </div>
  </div>

  <!-- History -->
  <div class="card">
    <div class="card-pad" style="padding-bottom:4px;">
      <h3 style="font-size:15.5px;">Reading history</h3>
      <p style="font-size:12.5px; color:var(--muted); margin:4px 0 0;">
        Newest first. Each row shows what the meter went from and to, and what it cost.
      </p>
    </div>
    <div class="sm-timeline">${timeline}</div>
  </div>`;
}

function submeterHistoryRowHtml(r){
  const statusPill = {
    approved: '<span class="stamp paid">confirmed</span>',
    pending:  '<span class="stamp pending">waiting for you</span>',
    rejected: '<span class="stamp pending" style="color:var(--danger);">rejected</span>',
  }[r.status] || '';

  const overrideNote = (r.status === 'approved' && r.admin_verified_reading != null
      && Number(r.admin_verified_reading) !== Number(r.customer_reading))
    ? `<div class="sm-tl-note">Tenant sent ${fmtReading(r.customer_reading)}, you corrected it to
       ${fmtReading(r.admin_verified_reading)}${r.override_reason?` — “${escapeHtml(r.override_reason)}”`:''}</div>`
    : '';

  return `
  <div class="sm-tl-row sm-tl-${r.status}">
    <div class="sm-tl-date">
      <div class="sm-tl-day">${dateFmt(r.reading_date)}</div>
      <div class="sm-tl-by">${escapeHtml(r.user_name||'')}</div>
    </div>

    <div class="sm-tl-main">
      <div class="sm-tl-figures">
        <span class="mono">${fmtReading(r.previous_reading)}</span>
        <span class="sm-tl-arrow">→</span>
        <span class="mono sm-tl-current">${fmtReading(
          r.status === 'approved' ? r.approved_reading : r.customer_reading)}</span>
        ${r.units != null ? `<span class="sm-tl-units">${fmtReading(r.units)} units</span>` : ''}
      </div>
      ${overrideNote}
      ${r.status === 'rejected' && r.rejection_reason
        ? `<div class="sm-tl-note" style="color:var(--danger);">Rejected: ${escapeHtml(r.rejection_reason)}</div>` : ''}
      ${r.status === 'pending'
        ? `<div class="sm-tl-note">Tenant sent ${fmtReading(r.customer_reading)} — open Meter Readings to check the photo.</div>` : ''}
      ${r.customer_note ? `<div class="sm-tl-note">Tenant's note: ${escapeHtml(r.customer_note)}</div>` : ''}
    </div>

    <div class="sm-tl-right">
      ${statusPill}
      ${r.amount != null ? `<div class="sm-tl-amount mono">${currency(r.amount)}</div>` : ''}
      ${r.bill_id ? `<div class="sm-tl-bill">Bill #${r.bill_id}</div>` : ''}
      ${r.has_photo ? `<button type="button" class="sm-tl-photo" data-view-photo="${r.id}">View photo</button>` : ''}
    </div>
  </div>`;
}

/* ================================================================
   ADD / EDIT
   ================================================================ */
function openSubmeterModal(existing, presetShopId){
  const shops = state.cache.shops || [];
  const isEdit = !!existing;
  const today = new Date().toISOString().slice(0,10);
  const lockInitial = isEdit && existing.reading_count > 0;

  openModal(isEdit ? `Edit meter ${existing.meter_number}` : 'Add a submeter', `
    <form id="submeterForm">
      <div class="form-grid">
        <div class="field">
          <label for="smNumber">Meter number</label>
          <input id="smNumber" value="${existing?escapeHtml(existing.meter_number):''}" placeholder="MTR-001">
          ${fieldErrorHtml('smNumberErr')}
        </div>
        <div class="field">
          <label for="smType">Type</label>
          <select id="smType">
            ${['electricity','water','gas'].map(t=>`<option value="${t}" ${(existing?existing.meter_type:'electricity')===t?'selected':''}>${t}</option>`).join('')}
          </select>
        </div>

        ${!isEdit ? `
        <div class="field full">
          <label for="smShop">Which shop is it on?</label>
          <select id="smShop">
            <option value="">Not assigned yet — I'll assign it later</option>
            ${shops.map(s=>`<option value="${s.id}" ${String(presetShopId)===String(s.id)?'selected':''}>${escapeHtml(s.shop_number)}${s.assigned_to?' · '+escapeHtml(s.assigned_to.name):' · vacant'}</option>`).join('')}
          </select>
          <div class="hint">You can register the meter now and put it on a shop later.</div>
        </div>` : ''}

        <div class="field">
          <label for="smInitial">Reading on the meter today</label>
          <input id="smInitial" type="number" step="0.01" min="0"
                 value="${existing?existing.initial_reading:0}" ${lockInitial?'disabled':''}>
          <div class="hint">${lockInitial
            ? 'Locked — this meter already has confirmed readings.'
            : 'The first bill only charges units used above this number.'}</div>
        </div>
        <div class="field">
          <label for="smInstalled">Installed on</label>
          <input id="smInstalled" type="date" value="${existing&&existing.installation_date?String(existing.installation_date).slice(0,10):today}">
        </div>
        <div class="field full">
          <label for="smNotes">Notes</label>
          <input id="smNotes" value="${existing?escapeHtml(existing.notes||''):''}" placeholder="Optional — e.g. located behind the shop">
        </div>
        ${isEdit ? `
        <div class="field full">
          <label class="checkbox-row" style="padding:0;">
            <input type="checkbox" id="smActive" ${existing.is_active?'checked':''}> Meter is in use
          </label>
          <div class="hint">Switch this off instead of deleting — the tenant stops seeing it but the history is kept.</div>
        </div>`:''}
      </div>
    </form>
  `, `
    <button class="btn btn-ghost" id="cancelBtn">Cancel</button>
    <button class="btn btn-primary" id="saveBtn">${isEdit?'Save changes':'Add submeter'}</button>
  `);

  document.getElementById('cancelBtn').addEventListener('click', closeModal);
  document.getElementById('saveBtn').addEventListener('click', async () => {
    const form = document.getElementById('submeterForm');
    clearFieldErrors(form);
    const number = document.getElementById('smNumber').value.trim();
    if (!number){ showFieldError('smNumberErr','Enter the meter number'); return; }

    const installed = document.getElementById('smInstalled').value;
    const body = {
      meter_number: number,
      meter_type: document.getElementById('smType').value,
      notes: document.getElementById('smNotes').value.trim() || null,
      installation_date: installed ? new Date(installed).toISOString() : null,
    };
    const initialEl = document.getElementById('smInitial');
    if (!initialEl.disabled) body.initial_reading = parseFloat(initialEl.value) || 0;

    if (isEdit){
      body.is_active = document.getElementById('smActive').checked;
    } else {
      const shopId = document.getElementById('smShop').value;
      if (shopId) body.shop_id = Number(shopId);
    }

    await withSavingState('saveBtn', async () => {
      if (isEdit) await api(`/api/meters/${existing.id}`, { method:'PUT', body });
      else await api('/api/meters', { method:'POST', body });
      closeModal();
      showToast(isEdit ? 'Submeter updated' : 'Submeter added', 'success');
      // Re-render whichever screen we were called from (this modal is also
      // opened from the Shops list), not always the Submeters one.
      await renderView(state.view || 'submeters');
    });
  });
}

/* ================================================================
   ASSIGN / UNASSIGN
   ================================================================ */
function openAssignSubmeterModal(meterId){
  const meter = (submeterState._meters || []).find(m => m.id === meterId)
             || { id: meterId, meter_number: '' };
  const shops = state.cache.shops || [];

  openModal(`Assign meter ${escapeHtml(meter.meter_number)}`, `
    <div class="field">
      <label for="smAssignShop">Put this meter on</label>
      <select id="smAssignShop">
        <option value="">— choose a shop —</option>
        ${shops.map(s=>`<option value="${s.id}">${escapeHtml(s.shop_number)}${s.assigned_to?' · '+escapeHtml(s.assigned_to.name):' · vacant'}</option>`).join('')}
      </select>
      ${fieldErrorHtml('smAssignErr')}
    </div>
    <div style="font-size:12.5px; color:var(--muted);">
      Whoever is renting that shop will immediately see this meter in their portal and can start sending readings.
    </div>
  `, `
    <button class="btn btn-ghost" id="cancelBtn">Cancel</button>
    <button class="btn btn-primary" id="assignBtn">Assign</button>
  `);
  document.getElementById('cancelBtn').addEventListener('click', closeModal);
  document.getElementById('assignBtn').addEventListener('click', async () => {
    const shopId = Number(document.getElementById('smAssignShop').value);
    if (!shopId){ showFieldError('smAssignErr','Choose a shop'); return; }
    await withSavingState('assignBtn', async () => {
      const res = await api(`/api/meters/${meterId}/assign-shop`, { method:'POST', body:{ shop_id: shopId } });
      closeModal();
      showToast(res.message, 'success');
      await renderView('submeters');
    }, 'Assigning…');
  });
}

function confirmUnassignSubmeter(meterId){
  openModal('Remove from shop', `
    <div class="confirm-body">
      Take this meter off its shop? The tenant will stop seeing it and can't send readings for it.
      <div style="margin-top:8px; font-size:13px; color:var(--muted);">
        Past readings and the bills they produced are kept exactly as they are.
      </div>
    </div>
  `, `
    <button class="btn btn-ghost" id="cancelBtn">Cancel</button>
    <button class="btn btn-danger-ghost" id="confirmBtn">Remove from shop</button>
  `);
  document.getElementById('cancelBtn').addEventListener('click', closeModal);
  document.getElementById('confirmBtn').addEventListener('click', async () => {
    await withSavingState('confirmBtn', async () => {
      const res = await api(`/api/meters/${meterId}/unassign`, { method:'POST' });
      closeModal();
      showToast(res.message, 'success');
      await renderView('submeters');
    }, 'Removing…');
  });
}

function confirmDeleteSubmeter(id, name){
  openModal('Delete submeter', `
    <div class="confirm-body">
      Delete meter <strong>${escapeHtml(name)}</strong>? This can't be undone.
      <div style="margin-top:8px; font-size:13px; color:var(--muted);">
        Meters with confirmed readings can't be deleted — switch them to inactive instead,
        so the billing history behind old bills stays intact.
      </div>
    </div>
  `, `
    <button class="btn btn-ghost" id="cancelBtn">Cancel</button>
    <button class="btn btn-danger-ghost" id="confirmDeleteBtn">Delete</button>
  `);
  document.getElementById('cancelBtn').addEventListener('click', closeModal);
  document.getElementById('confirmDeleteBtn').addEventListener('click', async () => {
    await withSavingState('confirmDeleteBtn', async () => {
      await api(`/api/meters/${id}`, { method:'DELETE' });
      closeModal();
      showToast('Submeter deleted', 'success');
      submeterState.view = 'list';
      await renderView('submeters');
    }, 'Deleting…');
  });
}

/* View the evidence photo from the history timeline. */
async function openSubmeterPhotoModal(readingId){
  openModal('Meter photo', `<div style="text-align:center; padding:30px 0;"><div class="spinner dark" style="margin:0 auto;"></div></div>`,
            `<button class="btn btn-ghost" id="cancelBtn">Close</button>`);
  document.getElementById('cancelBtn').addEventListener('click', closeModal);
  try {
    const res = await fetch(`${API_BASE_URL}/api/meter-readings/${readingId}/photo`, {
      headers: { 'Authorization': `Bearer ${state.token}` },
    });
    if (!res.ok) throw new Error('Photo could not be loaded');
    const url = URL.createObjectURL(await res.blob());
    document.getElementById('modalBody').innerHTML =
      `<div class="mr-photo-wrap"><img src="${url}" alt="Meter photo"></div>`;
    document.getElementById('modalFoot').innerHTML =
      `<button class="btn btn-ghost" id="openFullBtn">Open full size</button>
       <button class="btn btn-primary" id="cancelBtn2">Close</button>`;
    document.getElementById('openFullBtn').addEventListener('click', () => window.open(url, '_blank'));
    document.getElementById('cancelBtn2').addEventListener('click', closeModal);
  } catch (err) {
    document.getElementById('modalBody').innerHTML = errorBannerHtml(err.message);
  }
}

/* ================================================================
   Handlers
   ================================================================ */
function attachSubmeterHandlers(){
  document.querySelectorAll('[data-submeter-filter]').forEach(el => el.addEventListener('click', () => {
    submeterState.filter = el.dataset.submeterFilter;
    renderView('submeters');
  }));
  document.getElementById('submeterComplexFilter')?.addEventListener('change', (e) => {
    submeterState.complexId = e.target.value;
    renderView('submeters');
  });

  document.querySelectorAll('[data-open-submeter]').forEach(el => el.addEventListener('click', () => {
    submeterState.view = 'detail';
    submeterState.detailId = Number(el.dataset.openSubmeter);
    renderView('submeters');
  }));
  document.getElementById('submeterBackBtn')?.addEventListener('click', () => {
    submeterState.view = 'list';
    submeterState.detailId = null;
    renderView('submeters');
  });

  document.getElementById('addSubmeterBtn')?.addEventListener('click', () => openSubmeterModal(null));
  document.querySelectorAll('[data-edit-submeter]').forEach(btn => btn.addEventListener('click', async () => {
    const id = Number(btn.dataset.editSubmeter);
    let meter = (submeterState._meters || []).find(m => m.id === id);
    if (!meter) meter = await api(`/api/meters/${id}`);
    openSubmeterModal(meter);
  }));
  document.querySelectorAll('[data-delete-submeter]').forEach(btn => btn.addEventListener('click', () =>
    confirmDeleteSubmeter(Number(btn.dataset.deleteSubmeter), btn.dataset.name)));
  document.querySelectorAll('[data-assign-submeter]').forEach(btn => btn.addEventListener('click', () =>
    openAssignSubmeterModal(Number(btn.dataset.assignSubmeter))));
  document.querySelectorAll('[data-unassign-submeter]').forEach(btn => btn.addEventListener('click', () =>
    confirmUnassignSubmeter(Number(btn.dataset.unassignSubmeter))));
  document.querySelectorAll('[data-view-photo]').forEach(btn => btn.addEventListener('click', () =>
    openSubmeterPhotoModal(Number(btn.dataset.viewPhoto))));

  attachSearchFilter();
}
