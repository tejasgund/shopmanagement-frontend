/* ================================================================
   ADMIN/js/collect-submeter.js — Collect Submeter

   For tenants who can't (or won't) send their own reading through the
   app — the admin stands at the meter instead, types the number and
   optionally attaches a photo, on the tenant's behalf.

   This does NOT skip the usual checks: what gets submitted here lands
   in the Meter Readings pending queue exactly like a tenant's own
   submission would, so it still goes through the normal review/approve
   step before a bill is raised.

   Backend contract this screen expects (see chat for the full note):
     POST /api/meter-readings/collect   (admin-only, multipart/form-data)
       fields: meter_id (required), customer_reading (required),
               customer_note (optional), photo (optional file)
       -> creates a reading with status 'pending', collected_by = the
          signed-in admin, so the Meter Readings queue and the meter's
          history timeline both show it was admin-collected.
   ================================================================ */

const collectSubmeterState = {
  complexId: '',
  _meters: [],
};

async function collectSubmeterView(){
  await Promise.all([
    ensureLoaded('complexes','/api/complex'),
  ]);

  const params = new URLSearchParams();
  if (collectSubmeterState.complexId) params.set('complex_id', collectSubmeterState.complexId);
  const meters = await api(`/api/meters?${params}`);
  const assigned = meters.filter(m => m.is_assigned && m.is_active);
  collectSubmeterState._meters = assigned;
  const complexes = state.cache.complexes || [];

  const toolbar = `
  <div class="toolbar">
    <input class="search-input" id="tableSearch" placeholder="Search by meter number, shop or tenant…">
    <select class="sort-select" id="collectComplexFilter">
      <option value="">All complexes</option>
      ${complexes.map(c=>`<option value="${c.id}" ${String(collectSubmeterState.complexId)===String(c.id)?'selected':''}>${escapeHtml(c.name)}</option>`).join('')}
    </select>
  </div>`;

  if (!assigned.length){
    return toolbar + emptyStateHtml(
      'No meters ready to collect from',
      'A meter needs to be added and assigned to a shop first — do that in Add Submeter.',
      emptyIcon());
  }

  return toolbar + `
  <div class="card card-pad" style="margin-bottom:16px;">
    <p style="font-size:13px; color:var(--muted); margin:0;">
      Use this when a tenant can't send their own reading. Whatever you enter here still goes
      through the normal review step in <strong>Meter Readings</strong> before a bill is raised.
    </p>
  </div>
  <div class="table-wrap">
    <table>
      <thead><tr>
        <th>Meter</th><th>Shop</th><th>Tenant</th>
        <th class="num">Last confirmed reading</th><th>Last updated</th><th></th>
      </tr></thead>
      <tbody>
        ${assigned.map(m => `
        <tr data-search="${escapeHtml(m.meter_number+' '+(m.shop_number||'')+' '+(m.complex_name||'')+' '+(m.assigned_to?.name||''))}">
          <td><span class="mono">${escapeHtml(m.meter_number)}</span>
              <div style="font-size:11.5px; color:var(--muted);">${escapeHtml(m.meter_type)}</div></td>
          <td><strong class="mono">${escapeHtml(m.shop_number)}</strong>
              <div style="font-size:11.5px; color:var(--muted);">${escapeHtml(m.complex_name||'—')}</div></td>
          <td>${m.assigned_to ? tenantLinkHtml(m.assigned_to.id, m.assigned_to.name) : `<span style="color:var(--muted); font-size:13px;">—</span>`}</td>
          <td class="num mono"><strong>${fmtReading(m.current_reading)}</strong></td>
          <td>${m.last_updated ? dateFmt(m.last_updated) : `<span style="color:var(--muted);">never</span>`}
              ${m.has_pending_reading?'<div style="font-size:11.5px; color:var(--rust); font-weight:600;">already has one waiting for review</div>':''}</td>
          <td><button class="btn btn-primary btn-sm" data-collect-reading="${m.id}">Collect reading</button></td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

function attachCollectSubmeterHandlers(){
  document.getElementById('collectComplexFilter')?.addEventListener('change', (e) => {
    collectSubmeterState.complexId = e.target.value;
    renderView('collectSubmeter');
  });
  document.querySelectorAll('[data-collect-reading]').forEach(btn => btn.addEventListener('click', () =>
    openCollectReadingModal(Number(btn.dataset.collectReading))));
  attachSearchFilter();
}

/* ================================================================
   COLLECT — manual entry on the tenant's behalf
   ================================================================ */
async function openCollectReadingModal(meterId){
  const meter = (collectSubmeterState._meters || []).find(m => m.id === meterId);
  if (!meter) return;
  const prev = Number(meter.current_reading || 0);

  /* "Allow admin to upload meter reading image" (Settings -> Meter readings).
     Off hides the photo field only - the reading itself is collected exactly
     as before. Independent of the tenant's own switch. The API enforces this
     too; hiding the field just stops us offering something it would refuse.
     If the setting can't be read we leave the field visible, matching the
     API's "missing key means allowed" default. */
  let photoAllowed = true;
  try {
    photoAllowed = await getSettingBool('meter.allow_admin_photo_upload');
  } catch (err) { /* keep the existing field */ }

  /* "Allow gallery upload" (Settings -> Meter readings). Off keeps
     capture="environment" on the input, which is what makes a phone open the
     camera instead of the photo picker; on simply omits it, so the picker
     offers the device's existing photos AND the camera. Nothing else about
     the upload changes. Defaults to off (camera only) if the setting can't be
     read, matching the behaviour that shipped before it existed. */
  let galleryAllowed = false;
  try {
    // Explicit false fallback, NOT getSettingBool() - that defaults a missing
    // key to true, which is right for the "may this role upload at all"
    // switches but would silently switch the gallery ON against an older
    // backend that has never heard of this setting.
    galleryAllowed = Boolean(await getSetting('meter.allow_gallery_upload', false));
  } catch (err) { /* stay camera-only */ }

  openModal(`Collect reading — ${escapeHtml(meter.meter_number)}`, `
    <form id="collectForm">
      <div class="mr-ident" style="margin-bottom:14px;">
        <div><span class="mr-ident-label">Shop</span><strong class="mono">${escapeHtml(meter.shop_number)}</strong></div>
        <div><span class="mr-ident-label">Tenant</span><strong>${meter.assigned_to ? escapeHtml(meter.assigned_to.name) : '—'}</strong></div>
        <div><span class="mr-ident-label">Last confirmed</span><strong class="mono">${fmtReading(prev)}</strong></div>
      </div>

      <div class="field">
        <label for="csReading">What does the meter show right now?</label>
        <input id="csReading" type="number" step="0.01" min="0" class="mr-big-input mono" placeholder="${(prev + 250).toLocaleString('en-IN')}">
        ${fieldErrorHtml('csReadingErr')}
      </div>

      ${photoAllowed ? `
      <div class="field">
        <label for="csPhoto">Photo of the meter <span style="font-weight:400; color:var(--muted);">(optional, but recommended)</span></label>
        <input id="csPhoto" type="file" accept="image/*"${galleryAllowed ? '' : ' capture="environment"'}>
        <div class="hint" style="margin-top:4px;">${galleryAllowed
          ? 'Take a photo now, or choose one already on this device.'
          : 'Opens the camera — the photo must be taken now.'}</div>
        <div id="csPreviewWrap" style="display:none; margin-top:8px;">
          <img id="csPreview" alt="Selected photo" style="max-width:100%; max-height:220px; border-radius:var(--radius-sm); border:1px solid var(--line);">
        </div>
      </div>` : ''}

      <div class="field">
        <label for="csNote">Note <span style="font-weight:400; color:var(--muted);">(optional)</span></label>
        <input id="csNote" placeholder="e.g. Collected in person — tenant's phone isn't working">
      </div>

      <div style="font-size:12.5px; color:var(--muted);">
        This is saved as a pending reading, exactly like a tenant's own submission — it still needs
        approving in Meter Readings before a bill is raised.
      </div>
    </form>
  `, `
    <button class="btn btn-ghost" id="cancelBtn">Cancel</button>
    <button class="btn btn-primary" id="csSaveBtn">Save reading</button>
  `);

  document.getElementById('cancelBtn').addEventListener('click', closeModal);
  document.getElementById('csPhoto')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    const wrap = document.getElementById('csPreviewWrap');
    if (!file){ wrap.style.display = 'none'; return; }
    document.getElementById('csPreview').src = URL.createObjectURL(file);
    wrap.style.display = 'block';
  });
  setTimeout(() => document.getElementById('csReading')?.focus(), 80);

  document.getElementById('csSaveBtn').addEventListener('click', async () => {
    const form = document.getElementById('collectForm');
    clearFieldErrors(form);
    const value = parseFloat(document.getElementById('csReading').value);
    if (isNaN(value)){ showFieldError('csReadingErr','Enter the reading you can see on the meter'); return; }
    if (value < prev){ showFieldError('csReadingErr', `Can't be lower than the last confirmed reading (${fmtReading(prev)})`); return; }

    const body = new FormData();
    body.append('meter_id', meter.id);
    body.append('customer_reading', value);
    const note = document.getElementById('csNote').value.trim();
    if (note) body.append('customer_note', note);
    const file = document.getElementById('csPhoto')?.files[0];
    if (file) body.append('photo', file);

    await withSavingState('csSaveBtn', async () => {
      // FormData must not go through api() — the browser has to set the
      // multipart boundary itself. Same pattern as the tenant's own submit.
      const res = await fetch(`${API_BASE_URL}/api/meter-readings/collect`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${state.token}` },
        body,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.detail || `Could not save (${res.status})`);

      closeModal();
      showToast('Reading saved — waiting for review in Meter Readings', 'success');
      refreshMeterBadge();
      await renderView('collectSubmeter');
    }, 'Saving…');
  });
}
