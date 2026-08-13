/* ================================================================
   ADMIN/js/meters.js — Submeter readings, meters and tariffs.

   The review screen is the important part of this file. It puts the
   tenant's photo, the previous approved reading and the tenant's own
   number side by side, then asks the admin to type what THEY can see
   in the photo. That admin number is what gets billed — the tenant's
   entry is only ever supporting information.
   ================================================================ */

const meterState = {
  section: 'review',     // 'review' | 'meters' | 'tariffs'
  statusFilter: 'pending',
  complexId: '',
};

async function metersView(){
  await Promise.all([
    ensureLoaded('complexes','/api/complex'),
    ensureLoaded('shops','/api/shop'),
    ensureLoaded('users','/api/user'),
  ]);
  return `
  <div class="billing-mode-switch">
    <button type="button" class="billing-mode-btn ${meterState.section==='review'?'active':''}" data-meter-section="review">Review readings</button>
    <button type="button" class="billing-mode-btn ${meterState.section==='meters'?'active':''}" data-meter-section="meters">Meters</button>
    <button type="button" class="billing-mode-btn ${meterState.section==='tariffs'?'active':''}" data-meter-section="tariffs">Unit price</button>
  </div>
  <div id="meterBody">${skeletonHtml()}</div>`;
}

function attachMeterHandlers(){
  document.querySelectorAll('[data-meter-section]').forEach(btn => btn.addEventListener('click', () => {
    if (btn.dataset.meterSection === meterState.section) return;
    meterState.section = btn.dataset.meterSection;
    document.querySelectorAll('[data-meter-section]').forEach(b =>
      b.classList.toggle('active', b.dataset.meterSection === meterState.section));
    renderMeterBody();
  }));
  renderMeterBody();
}

async function renderMeterBody(){
  const el = document.getElementById('meterBody');
  if (!el) return;
  el.innerHTML = skeletonHtml();
  try {
    if (meterState.section === 'meters')      el.innerHTML = await metersListHtml();
    else if (meterState.section === 'tariffs') el.innerHTML = await tariffsHtml();
    else                                       el.innerHTML = await reviewQueueHtml();
    attachMeterBodyHandlers();
  } catch (err) {
    el.innerHTML = errorBannerHtml(err.message);
    document.getElementById('retryBtn')?.addEventListener('click', renderMeterBody);
  }
}

/* ================================================================
   1. REVIEW QUEUE
   ================================================================ */
async function reviewQueueHtml(){
  const params = new URLSearchParams();
  if (meterState.statusFilter !== 'all') params.set('status', meterState.statusFilter);
  if (meterState.complexId) params.set('complex_id', meterState.complexId);
  const readings = await api(`/api/meter-readings?${params}`);
  meterState._readings = readings;

  const complexes = state.cache.complexes || [];
  const counts = { pending: 0, approved: 0, rejected: 0 };
  readings.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });

  const toolbar = `
  <div class="toolbar">
    <div class="filter-chips">
      ${['pending','approved','rejected','all'].map(s => `
        <button class="chip ${meterState.statusFilter===s?'active':''}" data-reading-status="${s}">
          ${s.charAt(0).toUpperCase()+s.slice(1)}${s===meterState.statusFilter?` (${readings.length})`:''}
        </button>`).join('')}
    </div>
    <select class="sort-select" id="meterComplexFilter">
      <option value="">All complexes</option>
      ${complexes.map(c=>`<option value="${c.id}" ${String(meterState.complexId)===String(c.id)?'selected':''}>${escapeHtml(c.name)}</option>`).join('')}
    </select>
  </div>`;

  if (readings.length === 0){
    return toolbar + emptyStateHtml(
      meterState.statusFilter === 'pending' ? 'Nothing waiting for review' : 'No readings here',
      meterState.statusFilter === 'pending'
        ? 'When a tenant sends a meter photo it will appear here for you to check.'
        : 'Try a different filter.',
      emptyIcon());
  }

  return toolbar + `
  <div class="meter-review-grid">
    ${readings.map(r => `
    <div class="card meter-review-card ${r.status==='pending'?'is-pending':''}" data-open-reading="${r.id}">
      <div class="mrc-head">
        <div>
          <div class="mrc-tenant">${escapeHtml(r.user_name || '—')}</div>
          <div class="mrc-meta">${escapeHtml(r.shop_number||'—')} · Meter ${escapeHtml(r.meter_number||'—')}</div>
        </div>
        ${readingStampHtml(r.status)}
      </div>
      <div class="mrc-body">
        <div class="mrc-figure">
          <div class="mrc-label">Previous</div>
          <div class="mrc-value mono">${fmtReading(r.previous_reading)}</div>
        </div>
        <div class="mrc-arrow">→</div>
        <div class="mrc-figure">
          <div class="mrc-label">Tenant says</div>
          <div class="mrc-value mono">${fmtReading(r.customer_reading)}</div>
        </div>
        ${r.status === 'approved' ? `
        <div class="mrc-figure">
          <div class="mrc-label">You approved</div>
          <div class="mrc-value mono" style="color:var(--success);">${fmtReading(r.approved_reading)}</div>
        </div>` : ''}
      </div>
      <div class="mrc-foot">
        <span class="mrc-date">${dateFmt(r.reading_date)}</span>
        ${r.has_photo ? '<span class="mrc-photo-tag">📷 photo</span>' : '<span class="mrc-photo-tag mrc-nophoto">no photo</span>'}
        ${r.bill_id ? `<span class="mrc-bill">Bill #${r.bill_id} · ${currency(r.bill?.amount)}</span>` : ''}
        ${r.status === 'pending' ? '<span class="btn btn-primary btn-sm mrc-cta">Review →</span>' : ''}
      </div>
    </div>`).join('')}
  </div>`;
}

function readingStampHtml(status){
  const map = { pending:'pending', approved:'paid', rejected:'pending' };
  return `<span class="stamp ${map[status]||'pending'}">${escapeHtml(status)}</span>`;
}

const fmtReading = (n) => n == null ? '—' : Number(n).toLocaleString('en-IN', {maximumFractionDigits:2});

/* ================================================================
   2. THE REVIEW MODAL — photo + manual verification
   ================================================================ */
async function openReadingReviewModal(id){
  openModal('Verify meter reading', `<div style="text-align:center; padding:30px 0;"><div class="spinner dark" style="margin:0 auto;"></div></div>`, '');
  document.getElementById('modalEl')?.classList.add('modal-wide');

  let data;
  try {
    data = await api(`/api/meter-readings/${id}`);
  } catch (err) {
    document.getElementById('modalBody').innerHTML = errorBannerHtml(err.message);
    return;
  }

  const rev = data.review;
  const readOnly = data.status !== 'pending';

  document.getElementById('modalBody').innerHTML = `
    <div class="mr-verify">
      <!-- who / what -->
      <div class="mr-ident">
        <div><span class="mr-ident-label">Tenant</span><strong>${escapeHtml(data.user_name||'—')}</strong>
             <span class="mono" style="color:var(--muted); font-size:12px;">${escapeHtml(data.user_mobile||'')}</span></div>
        <div><span class="mr-ident-label">Shop</span><strong>${escapeHtml(data.shop_number||'—')}</strong></div>
        <div><span class="mr-ident-label">Meter</span><strong class="mono">${escapeHtml(data.meter_number||'—')}</strong></div>
        <div><span class="mr-ident-label">Sent</span><strong>${dateFmt(data.reading_date)}</strong></div>
      </div>

      ${readOnly ? `<div class="warn-box" style="margin-bottom:14px;">
        This reading is already <strong>${escapeHtml(data.status)}</strong>${data.bill_id?` and produced bill #${data.bill_id}`:''}.
        It is shown here for reference only.
      </div>` : ''}

      <div class="mr-columns">
        <!-- LEFT: the evidence -->
        <div class="mr-photo-col">
          <div class="mr-section-title">The tenant's photo</div>
          ${data.has_photo ? `
            <div class="mr-photo-wrap" id="mrPhotoWrap">
              <img id="mrPhoto" alt="Meter photo submitted by the tenant" />
              <div class="mr-photo-loading">Loading photo…</div>
            </div>
            <div class="mr-photo-actions">
              <button type="button" class="btn btn-ghost btn-sm" id="mrZoomBtn">Open full size</button>
              <span class="mr-photo-hint">Zoom in and read the digits yourself.</span>
            </div>
          ` : `<div class="warn-box">No photo was attached to this reading. Consider rejecting it and asking the tenant to send one.</div>`}
          ${data.customer_note ? `<div class="mr-note"><strong>Tenant's note:</strong> ${escapeHtml(data.customer_note)}</div>` : ''}
        </div>

        <!-- RIGHT: the numbers -->
        <div class="mr-form-col">
          <div class="mr-section-title">Readings</div>
          <div class="mr-readout">
            <div class="mr-readout-row">
              <span>Previous approved</span>
              <strong class="mono">${fmtReading(rev.previous_reading)}</strong>
            </div>
            <div class="mr-readout-note">from ${escapeHtml(rev.previous_reading_source)}</div>
            <div class="mr-readout-row">
              <span>Tenant entered</span>
              <strong class="mono">${fmtReading(data.customer_reading)}</strong>
            </div>
          </div>

          ${readOnly ? `
            <div class="mr-readout" style="margin-top:12px;">
              <div class="mr-readout-row">
                <span>${data.status === 'approved' ? 'Your approved reading' : 'Your reading'}</span>
                <strong class="mono">${fmtReading(data.admin_verified_reading)}</strong>
              </div>
              ${data.calculated_units != null ? `<div class="mr-readout-row"><span>Units billed</span><strong class="mono">${fmtReading(data.calculated_units)}</strong></div>`:''}
              ${data.override_reason ? `<div class="mr-readout-note">Override reason: ${escapeHtml(data.override_reason)}</div>`:''}
              ${data.rejection_reason ? `<div class="mr-readout-note">Rejected: ${escapeHtml(data.rejection_reason)}</div>`:''}
            </div>
          ` : `
            <div class="field" style="margin-top:14px;">
              <label for="mrAdminReading" style="font-size:13px; color:var(--ink);">
                <strong>What do YOU read on the meter?</strong>
              </label>
              <input id="mrAdminReading" type="number" step="0.01" min="0"
                     class="mr-big-input mono" placeholder="Type the number from the photo"
                     value="${data.admin_verified_reading != null ? data.admin_verified_reading : ''}">
              <div class="hint">This is the number the bill will be calculated from — not the tenant's entry.</div>
              ${fieldErrorHtml('mrReadingErr')}
            </div>

            <div id="mrLive"></div>

            <div class="field" id="mrOverrideWrap" style="display:none;">
              <label for="mrOverrideReason">Why does your reading differ?</label>
              <textarea id="mrOverrideReason" rows="2" placeholder="e.g. Meter display clearly shows 12730."></textarea>
            </div>
          `}
        </div>
      </div>
    </div>`;

  document.getElementById('modalFoot').innerHTML = readOnly
    ? `<button class="btn btn-ghost" id="mrCloseBtn">Close</button>`
    : `<button class="btn btn-ghost" id="mrCloseBtn">Cancel</button>
       <button class="btn btn-danger-ghost" id="mrRejectBtn" style="margin-right:auto;">Reject…</button>
       <button class="btn btn-primary" id="mrApproveBtn" disabled>Approve &amp; create bill</button>`;

  document.getElementById('mrCloseBtn').addEventListener('click', closeModal);
  if (data.has_photo) loadReadingPhoto(data.id);
  if (readOnly) return;

  const input = document.getElementById('mrAdminReading');
  const approveBtn = document.getElementById('mrApproveBtn');
  let previewTimer = null;
  let lastPreview = null;

  const runPreview = async () => {
    const value = parseFloat(input.value);
    const live = document.getElementById('mrLive');
    const overrideWrap = document.getElementById('mrOverrideWrap');
    if (isNaN(value)){
      live.innerHTML = '';
      overrideWrap.style.display = 'none';
      approveBtn.disabled = true;
      return;
    }
    try {
      const p = await api(`/api/meter-readings/${data.id}/preview`, {
        method:'POST', body:{ admin_verified_reading: value },
      });
      lastPreview = p;
      live.innerHTML = previewHtml(p);
      const mismatch = p.comparison && p.comparison.matches === false;
      overrideWrap.style.display = (mismatch && rev.requires_override_reason) ? 'block' : 'none';
      approveBtn.disabled = !p.valid;
    } catch (err) {
      live.innerHTML = `<div class="warn-box" style="margin-top:12px;">${escapeHtml(err.message)}</div>`;
      approveBtn.disabled = true;
    }
  };

  input.addEventListener('input', () => {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(runPreview, 300);
  });
  if (input.value) runPreview();
  setTimeout(()=>input.focus(), 80);

  approveBtn.addEventListener('click', async () => {
    const value = parseFloat(input.value);
    if (isNaN(value)){ showFieldError('mrReadingErr','Enter the reading you can see in the photo'); return; }
    const reason = (document.getElementById('mrOverrideReason')?.value || '').trim();
    const mismatch = lastPreview?.comparison?.matches === false;
    if (mismatch && rev.requires_override_reason && !reason){
      showToast('Please give a short reason for the difference', 'error');
      document.getElementById('mrOverrideReason')?.focus();
      return;
    }
    await withSavingState('mrApproveBtn', async () => {
      const res = await api(`/api/meter-readings/${data.id}/approve`, {
        method:'POST', body:{ admin_verified_reading: value, override_reason: reason || null },
      });
      closeModal();
      showToast(res.message, 'success');
      state.loaded.bills = false;
      refreshMeterBadge();
      renderMeterBody();
    }, 'Approving…');
  });

  document.getElementById('mrRejectBtn').addEventListener('click', () => openRejectReadingModal(data));
}

function previewHtml(p){
  const c = p.comparison || {};
  const est = p.estimate || {};
  const matchClass = c.matches ? 'mr-cmp-ok' : 'mr-cmp-warn';

  if (!p.valid && p.error){
    return `<div class="warn-box" style="margin-top:12px;"><strong>Cannot approve:</strong> ${escapeHtml(p.error)}</div>`;
  }

  return `
  <div class="mr-live">
    <div class="mr-cmp ${matchClass}">
      ${c.matches
        ? '✓ Your reading matches the tenant\'s.'
        : `⚠ ${escapeHtml(c.message || 'Your reading differs from the tenant\'s.')}`}
    </div>

    ${(p.anomalies||[]).map(a=>`<div class="mr-anomaly">⚠ ${escapeHtml(a.message)}</div>`).join('')}

    <div class="mr-calc">
      <div class="mr-calc-row"><span>${fmtReading(p.admin_verified_reading)} − ${fmtReading(p.previous_reading)}</span><strong class="mono">${fmtReading(p.units)} units</strong></div>
      ${est.unit_price != null ? `
      <div class="mr-calc-row"><span>${fmtReading(p.units)} × ${currency(est.unit_price)}/unit</span><strong class="mono">${currency(est.energy_charge)}</strong></div>
      ${est.fixed_charge ? `<div class="mr-calc-row"><span>Fixed charge</span><strong class="mono">${currency(est.fixed_charge)}</strong></div>`:''}
      ${est.tax_percent ? `<div class="mr-calc-row"><span>Tax ${est.tax_percent}%</span><strong class="mono">${currency(est.tax_amount)}</strong></div>`:''}
      <div class="mr-calc-row mr-calc-total"><span>Bill total</span><strong class="mono">${currency(est.total)}</strong></div>
      `: `<div class="warn-box" style="margin-top:8px;">${escapeHtml(est.error||'No unit price configured.')}</div>`}
    </div>
  </div>`;
}

async function loadReadingPhoto(readingId){
  /* The photo endpoint needs the auth header, so it can't just be an <img src>.
     Fetch it as a blob and hand the object URL to the image instead. */
  const img = document.getElementById('mrPhoto');
  if (!img) return;
  try {
    const res = await fetch(`${API_BASE_URL}/api/meter-readings/${readingId}/photo`, {
      headers: { 'Authorization': `Bearer ${state.token}` },
    });
    if (!res.ok) throw new Error('Photo could not be loaded');
    const url = URL.createObjectURL(await res.blob());
    img.src = url;
    img.onload = () => document.querySelector('.mr-photo-loading')?.remove();
    document.getElementById('mrZoomBtn')?.addEventListener('click', () => window.open(url, '_blank'));
    document.getElementById('mrPhotoWrap')?.addEventListener('click', () => img.classList.toggle('mr-photo-zoomed'));
  } catch (err) {
    const wrap = document.getElementById('mrPhotoWrap');
    if (wrap) wrap.innerHTML = `<div class="warn-box">${escapeHtml(err.message)}</div>`;
  }
}

function openRejectReadingModal(reading){
  openModal('Reject this reading', `
    <div class="confirm-body">
      <p style="margin-top:0;">The tenant will see your reason and can send a new photo.</p>
      <div class="field">
        <label for="mrRejectReason">Reason</label>
        <textarea id="mrRejectReason" rows="3" placeholder="e.g. The photo is too blurry to read the last digit."></textarea>
        ${fieldErrorHtml('mrRejectErr')}
      </div>
      <div style="font-size:12.5px; color:var(--muted);">Common reasons: blurry photo, wrong meter, display not visible, number doesn't match the photo.</div>
    </div>
  `, `
    <button class="btn btn-ghost" id="cancelBtn">Back</button>
    <button class="btn btn-danger-ghost" id="confirmRejectBtn">Reject reading</button>
  `);
  document.getElementById('cancelBtn').addEventListener('click', () => openReadingReviewModal(reading.id));
  document.getElementById('confirmRejectBtn').addEventListener('click', async () => {
    const reason = document.getElementById('mrRejectReason').value.trim();
    if (!reason){ showFieldError('mrRejectErr','Please give a reason so the tenant knows what to fix'); return; }
    await withSavingState('confirmRejectBtn', async () => {
      await api(`/api/meter-readings/${reading.id}/reject`, { method:'POST', body:{ reason } });
      closeModal();
      showToast('Reading rejected — the tenant can send a new photo', 'success');
      refreshMeterBadge();
      renderMeterBody();
    }, 'Rejecting…');
  });
}

/* ================================================================
   3. METERS
   ================================================================ */
async function metersListHtml(){
  const params = new URLSearchParams();
  if (meterState.complexId) params.set('complex_id', meterState.complexId);
  const meters = await api(`/api/meters?${params}`);
  meterState._meters = meters;
  const complexes = state.cache.complexes || [];

  const toolbar = `
  <div class="toolbar">
    <input class="search-input" id="tableSearch" placeholder="Search meters…">
    <select class="sort-select" id="meterComplexFilter">
      <option value="">All complexes</option>
      ${complexes.map(c=>`<option value="${c.id}" ${String(meterState.complexId)===String(c.id)?'selected':''}>${escapeHtml(c.name)}</option>`).join('')}
    </select>
    <button class="btn btn-primary btn-sm" id="addMeterBtn">+ Add meter</button>
  </div>`;

  if (!meters.length){
    return toolbar + emptyStateHtml('No meters registered',
      'Add a submeter to a shop so its tenant can start sending readings.', emptyIcon());
  }

  return toolbar + `
  <div class="table-wrap">
    <table>
      <thead><tr><th>Meter</th><th>Shop</th><th>Complex</th><th>Tenant</th>
        <th class="num">Next reading must exceed</th><th>Last reading</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${meters.map(m => `
        <tr data-search="${escapeHtml(m.meter_number+' '+(m.shop_number||'')+' '+(m.assigned_to?.name||''))}">
          <td class="mono"><strong>${escapeHtml(m.meter_number)}</strong>
              <div style="font-size:11.5px; color:var(--muted);">${escapeHtml(m.meter_type)}</div></td>
          <td class="mono">${escapeHtml(m.shop_number||'—')}</td>
          <td>${escapeHtml(m.complex_name||'—')}</td>
          <td>${m.assigned_to ? tenantLinkHtml(m.assigned_to.id, m.assigned_to.name) : '<span style="color:var(--muted);">— vacant —</span>'}</td>
          <td class="num mono">${fmtReading(m.current_previous_reading)}</td>
          <td>${m.last_reading_date ? dateFmt(m.last_reading_date) : '<span style="color:var(--muted);">never</span>'}</td>
          <td><span class="pill ${m.is_active?'active-pill':'inactive-pill'}"><span class="pill-dot"></span>${m.is_active?'active':'inactive'}</span></td>
          <td><div class="row-actions">
            <button class="btn-icon" data-edit-meter="${m.id}" aria-label="Edit meter">${editIcon()}</button>
            <button class="btn-icon" data-delete-meter="${m.id}" data-name="${escapeHtml(m.meter_number)}" aria-label="Delete meter">${trashIcon()}</button>
          </div></td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

function openMeterModal(existing){
  const shops = state.cache.shops || [];
  const isEdit = !!existing;
  openModal(isEdit ? `Edit meter ${existing.meter_number}` : 'Add a meter', `
    <form id="meterForm">
      <div class="field">
        <label for="mShop">Shop</label>
        <select id="mShop" ${isEdit?'disabled':''}>
          <option value="">— select shop —</option>
          ${shops.map(s=>`<option value="${s.id}" ${existing && existing.shop_id===s.id?'selected':''}>${escapeHtml(s.shop_number)}${s.assigned_to?' · '+escapeHtml(s.assigned_to.name):' · vacant'}</option>`).join('')}
        </select>
        ${fieldErrorHtml('mShopErr')}
      </div>
      <div class="form-grid">
        <div class="field">
          <label for="mNumber">Meter number</label>
          <input id="mNumber" value="${existing?escapeHtml(existing.meter_number):''}" placeholder="MTR-001">
          ${fieldErrorHtml('mNumberErr')}
        </div>
        <div class="field">
          <label for="mType">Type</label>
          <select id="mType">
            ${['electricity','water','gas'].map(t=>`<option value="${t}" ${existing&&existing.meter_type===t?'selected':''}>${t}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="mInitial">Reading when installed</label>
          <input id="mInitial" type="number" step="0.01" min="0" value="${existing?existing.initial_reading:0}" ${isEdit && existing.last_approved_reading!=null?'disabled':''}>
          <div class="hint">${isEdit && existing.last_approved_reading!=null
            ? 'Locked — this meter already has approved readings.'
            : 'The first bill only charges units consumed above this number.'}</div>
        </div>
        <div class="field">
          <label for="mInstalled">Installed on</label>
          <input id="mInstalled" type="date" value="${existing&&existing.installation_date?String(existing.installation_date).slice(0,10):''}">
        </div>
        <div class="field full">
          <label for="mNotes">Notes</label>
          <input id="mNotes" value="${existing?escapeHtml(existing.notes||''):''}" placeholder="Optional — e.g. located behind the shop">
        </div>
        ${isEdit ? `<div class="field full">
          <label class="checkbox-row" style="padding:0;">
            <input type="checkbox" id="mActive" ${existing.is_active?'checked':''}> Meter is in use
          </label>
        </div>`:''}
      </div>
    </form>
  `, `
    <button class="btn btn-ghost" id="cancelBtn">Cancel</button>
    <button class="btn btn-primary" id="saveBtn">${isEdit?'Save changes':'Add meter'}</button>
  `);
  document.getElementById('cancelBtn').addEventListener('click', closeModal);
  document.getElementById('saveBtn').addEventListener('click', async () => {
    const form = document.getElementById('meterForm');
    clearFieldErrors(form);
    const shopId = Number(document.getElementById('mShop').value);
    const number = document.getElementById('mNumber').value.trim();
    let ok = true;
    if (!isEdit && !shopId){ showFieldError('mShopErr','Select a shop'); ok = false; }
    if (!number){ showFieldError('mNumberErr','Enter the meter number'); ok = false; }
    if (!ok) return;

    const installed = document.getElementById('mInstalled').value;
    const body = {
      meter_number: number,
      meter_type: document.getElementById('mType').value,
      notes: document.getElementById('mNotes').value.trim() || null,
      installation_date: installed ? new Date(installed).toISOString() : null,
    };
    const initialEl = document.getElementById('mInitial');
    if (!initialEl.disabled) body.initial_reading = parseFloat(initialEl.value) || 0;
    if (isEdit) body.is_active = document.getElementById('mActive').checked;
    else body.shop_id = shopId;

    await withSavingState('saveBtn', async () => {
      if (isEdit) await api(`/api/meters/${existing.id}`, { method:'PUT', body });
      else await api('/api/meters', { method:'POST', body });
      closeModal();
      showToast(isEdit?'Meter updated':'Meter added', 'success');
      renderMeterBody();
    });
  });
}

/* ================================================================
   4. TARIFFS
   ================================================================ */
async function tariffsHtml(){
  const data = await api('/api/meter-tariffs');
  const rows = data.tariffs || [];

  return `
  <div class="card card-pad" style="margin-bottom:16px;">
    <h3 style="font-size:15px; margin:0 0 6px;">How the unit price works</h3>
    <p style="font-size:13px; color:var(--muted); margin:0;">
      To change the rate, add a new one with the date it starts from — never edit an old rate.
      Bills already raised keep the price that applied on their date, so your history stays correct.
    </p>
  </div>
  <div class="toolbar">
    <button class="btn btn-primary btn-sm" id="addTariffBtn">+ Add new rate</button>
  </div>
  ${rows.length === 0 ? emptyStateHtml('No unit price set',
      'Add a rate before approving any meter reading, otherwise there is no price to bill at.', emptyIcon()) : `
  <div class="table-wrap">
    <table>
      <thead><tr><th>Effective from</th><th>Type</th><th class="num">Per unit</th><th class="num">Fixed charge</th><th class="num">Tax</th><th>Notes</th><th></th></tr></thead>
      <tbody>
        ${rows.map(t => `
        <tr>
          <td>${dateFmt(t.effective_from)} ${t.id===data.current_tariff_id?'<span class="pill available" style="margin-left:6px;"><span class="pill-dot"></span>current</span>':''}</td>
          <td>${escapeHtml(t.meter_type)}</td>
          <td class="num mono"><strong>${currency(t.unit_price)}</strong></td>
          <td class="num mono">${t.fixed_charge?currency(t.fixed_charge):'—'}</td>
          <td class="num mono">${t.tax_percent?t.tax_percent+'%':'—'}</td>
          <td style="font-size:12.5px; color:var(--muted);">${escapeHtml(t.notes||'—')}</td>
          <td><div class="row-actions">
            <button class="btn-icon" data-delete-tariff="${t.id}" aria-label="Delete rate">${trashIcon()}</button>
          </div></td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`}`;
}

function openTariffModal(){
  const today = new Date().toISOString().slice(0,10);
  openModal('Add a unit price', `
    <form id="tariffForm">
      <div class="form-grid">
        <div class="field">
          <label for="tPrice">Price per unit</label>
          <input id="tPrice" type="number" step="0.0001" min="0.0001" placeholder="9.50">
          ${fieldErrorHtml('tPriceErr')}
        </div>
        <div class="field">
          <label for="tFrom">Effective from</label>
          <input id="tFrom" type="date" value="${today}">
          <div class="hint">Readings on or after this date use this rate.</div>
        </div>
        <div class="field">
          <label for="tFixed">Fixed charge (optional)</label>
          <input id="tFixed" type="number" step="0.01" min="0" value="0">
        </div>
        <div class="field">
          <label for="tTax">Tax % (optional)</label>
          <input id="tTax" type="number" step="0.01" min="0" max="100" value="0">
        </div>
        <div class="field">
          <label for="tType">Meter type</label>
          <select id="tType">${['electricity','water','gas'].map(t=>`<option value="${t}">${t}</option>`).join('')}</select>
        </div>
        <div class="field full">
          <label for="tNotes">Notes</label>
          <input id="tNotes" placeholder="Optional — e.g. revised board tariff">
        </div>
      </div>
    </form>
  `, `
    <button class="btn btn-ghost" id="cancelBtn">Cancel</button>
    <button class="btn btn-primary" id="saveBtn">Add rate</button>
  `);
  document.getElementById('cancelBtn').addEventListener('click', closeModal);
  document.getElementById('saveBtn').addEventListener('click', async () => {
    clearFieldErrors(document.getElementById('tariffForm'));
    const price = parseFloat(document.getElementById('tPrice').value);
    if (isNaN(price) || price <= 0){ showFieldError('tPriceErr','Enter a valid price'); return; }
    const from = document.getElementById('tFrom').value;
    await withSavingState('saveBtn', async () => {
      await api('/api/meter-tariffs', { method:'POST', body:{
        meter_type: document.getElementById('tType').value,
        unit_price: price,
        fixed_charge: parseFloat(document.getElementById('tFixed').value)||0,
        tax_percent: parseFloat(document.getElementById('tTax').value)||0,
        effective_from: new Date(from || new Date()).toISOString(),
        notes: document.getElementById('tNotes').value.trim() || null,
      }});
      closeModal();
      showToast('New rate added', 'success');
      renderMeterBody();
    });
  });
}

/* ================================================================
   Handlers
   ================================================================ */
function attachMeterBodyHandlers(){
  document.querySelectorAll('[data-reading-status]').forEach(chip => chip.addEventListener('click', () => {
    meterState.statusFilter = chip.dataset.readingStatus;
    renderMeterBody();
  }));
  document.getElementById('meterComplexFilter')?.addEventListener('change', (e) => {
    meterState.complexId = e.target.value;
    renderMeterBody();
  });
  document.querySelectorAll('[data-open-reading]').forEach(card => card.addEventListener('click', () => {
    openReadingReviewModal(Number(card.dataset.openReading));
  }));

  document.getElementById('addMeterBtn')?.addEventListener('click', () => openMeterModal(null));
  document.querySelectorAll('[data-edit-meter]').forEach(btn => btn.addEventListener('click', () => {
    openMeterModal((meterState._meters||[]).find(m => m.id === Number(btn.dataset.editMeter)));
  }));
  document.querySelectorAll('[data-delete-meter]').forEach(btn => btn.addEventListener('click', () => {
    confirmDeleteMeter(Number(btn.dataset.deleteMeter), btn.dataset.name);
  }));

  document.getElementById('addTariffBtn')?.addEventListener('click', openTariffModal);
  document.querySelectorAll('[data-delete-tariff]').forEach(btn => btn.addEventListener('click', () => {
    confirmDeleteTariff(Number(btn.dataset.deleteTariff));
  }));

  attachSearchFilter();
}

function confirmDeleteMeter(id, name){
  openModal('Delete meter', `<div class="confirm-body">Delete meter <strong>${escapeHtml(name)}</strong>? This can't be undone.
    <div style="margin-top:8px; font-size:13px; color:var(--muted);">Meters with approved readings can't be deleted — mark them inactive instead so their billing history is kept.</div></div>`, `
    <button class="btn btn-ghost" id="cancelBtn">Cancel</button>
    <button class="btn btn-danger-ghost" id="confirmDeleteBtn">Delete</button>`);
  document.getElementById('cancelBtn').addEventListener('click', closeModal);
  document.getElementById('confirmDeleteBtn').addEventListener('click', async () => {
    await withSavingState('confirmDeleteBtn', async () => {
      await api(`/api/meters/${id}`, { method:'DELETE' });
      closeModal(); showToast('Meter deleted','success'); renderMeterBody();
    }, 'Deleting…');
  });
}

function confirmDeleteTariff(id){
  openModal('Delete rate', `<div class="confirm-body">Delete this unit price? Rates already used on a bill can't be deleted.</div>`, `
    <button class="btn btn-ghost" id="cancelBtn">Cancel</button>
    <button class="btn btn-danger-ghost" id="confirmDeleteBtn">Delete</button>`);
  document.getElementById('cancelBtn').addEventListener('click', closeModal);
  document.getElementById('confirmDeleteBtn').addEventListener('click', async () => {
    await withSavingState('confirmDeleteBtn', async () => {
      await api(`/api/meter-tariffs/${id}`, { method:'DELETE' });
      closeModal(); showToast('Rate deleted','success'); renderMeterBody();
    }, 'Deleting…');
  });
}
