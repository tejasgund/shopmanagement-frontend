/* ================================================================
   USER/js/tenant-meters.js — "Meter"

   Written for someone standing at their meter holding a phone:
   one card, one big button, photo, number, send.
   ================================================================ */

function renderMeterScreen(){
  if (!tp.meters.length){
    return `
    <div class="tp-empty">
      <div class="tp-empty-title">${t('meter.noMeterTitle')}</div>
      <div class="tp-empty-sub">${t('meter.noMeterSub')}</div>
    </div>`;
  }

  const rejected = tp.readings.find(r => r.status === 'rejected');
  const stillRejected = rejected &&
    !tp.readings.some(r => r.meter_id === rejected.meter_id &&
                           new Date(r.reading_date) > new Date(rejected.reading_date));

  return `
    ${stillRejected ? `
    <div class="tp-alert tp-alert-late">
      <strong>${t('meter.rejectedTitle')}</strong>
      ${escapeHtml(rejected.rejection_reason || '')}<br>
      ${t('meter.rejectedAgain')}
    </div>` : ''}

    ${tp.meters.map(meterCardHtml).join('')}
    ${meterHistoryHtml()}
  `;
}

/* Newest-first readings for this meter, used to tell "current" from "old". */
function meterReadingsSorted(meterId){
  return tp.readings
    .filter(r => r.meter_id === meterId)
    .sort((a, b) => new Date(b.reading_date) - new Date(a.reading_date));
}

function meterCardHtml(m){
  const [current, old] = meterReadingsSorted(m.id);
  const photoSlots = [
    current && current.has_photo ? { slot: 'current', reading: current, label: t('meter.currentPhoto') } : null,
    old && old.has_photo ? { slot: 'old', reading: old, label: t('meter.oldPhoto') } : null,
  ].filter(Boolean);

  return `
  <div class="tp-meter-card">
    <div class="tp-meter-head">
      <div>
        <div class="tp-meter-no">${t('meter.number')} ${escapeHtml(m.meter_number)}</div>
        <div class="tp-meter-shop">${escapeHtml(m.shop_number || '')}</div>
      </div>
    </div>

    <div class="tp-meter-prev">
      <span>${t('meter.lastConfirmed')}</span>
      <strong>${Number(m.previous_reading).toLocaleString('en-IN')}</strong>
    </div>

    ${photoSlots.length ? `
    <div class="tp-meter-photos">
      ${photoSlots.map(p => `
        <button type="button" class="tp-meter-photo" data-meter-photo="${p.reading.id}" data-meter-photo-slot="${p.slot}">
          <div class="tp-meter-photo-frame" id="tmPhotoFrame-${p.reading.id}">
            <span class="tp-spinner tp-spinner-dark"></span>
          </div>
          <span class="tp-meter-photo-label">${p.label} · ${dateFmt(p.reading.reading_date)}</span>
        </button>`).join('')}
    </div>` : ''}

    ${m.has_pending ? `
      <div class="tp-meter-waiting">
        <strong>${t('meter.sentTitle')}</strong>
        ${t('meter.sentBody')}
      </div>
    ` : `
      <button class="tp-btn tp-btn-primary tp-btn-block tp-btn-lg" data-send-reading="${m.id}">
        ${t('meter.sendThisMonth')}
      </button>
    `}
  </div>`;
}

function meterHistoryHtml(){
  const rows = tp.readings.slice(0, 12);
  if (!rows.length) return '';

  return `
  <div class="tp-block">
    <div class="tp-block-head"><h2>${t('meter.history')}</h2></div>
    ${rows.map(r => {
      const label = r.status === 'approved' ? t('meter.confirmed')
                  : r.status === 'rejected' ? t('meter.rejected') : t('meter.checking');
      const cls = r.status === 'approved' ? 'paid' : r.status === 'rejected' ? 'unpaid' : 'part';
      return `
      <div class="tp-row">
        <div>
          <div class="tp-row-title">${dateFmt(r.reading_date)}</div>
          <div class="tp-row-sub">
            ${t('meter.youSent')} ${Number(r.customer_reading).toLocaleString('en-IN')}${
              r.status === 'approved' && r.calculated_units != null
                ? ` · ${Number(r.calculated_units).toLocaleString('en-IN')} ${t('meter.unitsUsed')}` : ''}
          </div>
          ${r.status === 'rejected' && r.rejection_reason
            ? `<div class="tp-row-warn">${escapeHtml(r.rejection_reason)}</div>` : ''}
        </div>
        <div class="tp-row-right">
          <span class="tp-state tp-state-${cls}">${label}</span>
          ${r.bill ? `<div class="tp-row-amount">${currency(r.bill.amount)}</div>` : ''}
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

/* ================================================================
   SEND A READING
   ================================================================ */
function openSendReadingModal(meterId){
  const meter = tp.meters.find(m => m.id === meterId);
  if (!meter) return;

  const prev = Number(meter.previous_reading);

  openModal(`Meter ${meter.meter_number}`, `
    <div class="tp-sheet" id="tmForm">
      <div class="tp-sheet-note">
        ${t('form.lastWas')} <strong>${prev.toLocaleString('en-IN')}</strong>.
        ${t('form.mustBeHigher')}
      </div>

      <div class="tp-field">
        <label for="tmPhoto"><span class="tp-step">1</span> ${t('form.step1')}</label>
        <input id="tmPhoto" type="file" accept="image/*" capture="environment" class="tp-file">
        <div class="tp-field-hint">${t('form.step1Hint')}</div>
        <div id="tmPreviewWrap" class="tp-preview" style="display:none;">
          <img id="tmPreview" alt="The photo you selected">
        </div>
        <div class="tp-field-error" id="tmPhotoErr" style="display:none;"></div>
      </div>

      <div class="tp-field">
        <label for="tmReading"><span class="tp-step">2</span> ${t('form.step2')}</label>
        <input id="tmReading" type="number" inputmode="decimal" step="0.01" min="0"
               class="tp-big-input" placeholder="${(prev + 250).toLocaleString('en-IN')}">
        <div class="tp-field-error" id="tmReadingErr" style="display:none;"></div>
      </div>

      <div class="tp-field">
        <label for="tmNote">${t('form.note')} <span class="tp-optional">${t('form.optional')}</span></label>
        <input id="tmNote" class="tp-text-input" placeholder="${t('form.notePlaceholder')}">
      </div>
    </div>
  `, `
    <button class="tp-btn tp-btn-ghost" id="tmCancelBtn">${t('common.cancel')}</button>
    <button class="tp-btn tp-btn-primary" id="tmSubmitBtn">${t('common.send')}</button>
  `);

  document.getElementById('tmCancelBtn').addEventListener('click', closeModal);

  document.getElementById('tmPhoto').addEventListener('change', (e) => {
    const file = e.target.files[0];
    const wrap = document.getElementById('tmPreviewWrap');
    if (!file){ wrap.style.display = 'none'; return; }
    document.getElementById('tmPreview').src = URL.createObjectURL(file);
    wrap.style.display = 'block';
  });

  document.getElementById('tmSubmitBtn').addEventListener('click', async () => {
    clearFieldErrors(document.getElementById('tmForm'));
    const file = document.getElementById('tmPhoto').files[0];
    const value = parseFloat(document.getElementById('tmReading').value);
    let ok = true;

    if (!file){ showFieldError('tmPhotoErr', t('form.needPhoto')); ok = false; }
    if (isNaN(value)){ showFieldError('tmReadingErr', t('form.needNumber')); ok = false; }
    else if (value < prev){
      showFieldError('tmReadingErr',
        `${t('form.tooLow')} (${prev.toLocaleString('en-IN')})`);
      ok = false;
    }
    if (!ok) return;

    const body = new FormData();
    body.append('meter_id', meter.id);
    body.append('customer_reading', value);
    const note = document.getElementById('tmNote').value.trim();
    if (note) body.append('customer_note', note);
    body.append('photo', file);

    const btn = document.getElementById('tmSubmitBtn');
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="tp-spinner"></span> ${t('form.sending')}`;

    try {
      // FormData must not go through api() — the browser has to set the
      // multipart boundary itself.
      const res = await fetch(`${API_BASE_URL}/api/tenant/meter-readings`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${state.token}` },
        body,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.detail || `Could not send (${res.status})`);

      closeModal();
      showToast(t('form.sent'), 'success');
      await refreshTenantPortal(false);
    } catch (err) {
      btn.disabled = false;
      btn.innerHTML = original;
      showToast(err.message, 'error');
    }
  });
}

function attachMeterHandlers(){
  document.querySelectorAll('[data-send-reading]').forEach(btn =>
    btn.addEventListener('click', () => openSendReadingModal(Number(btn.dataset.sendReading))));

  document.querySelectorAll('[data-meter-photo]').forEach(btn =>
    btn.addEventListener('click', () => openMeterPhotoModal(Number(btn.dataset.meterPhoto))));

  document.querySelectorAll('.tp-meter-photo-frame').forEach(frame => {
    const readingId = frame.id.replace('tmPhotoFrame-', '');
    loadMeterThumb(Number(readingId), frame);
  });
}

/* ================================================================
   OLD / CURRENT READING PHOTOS
   Thumbnails load as authenticated blobs (same pattern the admin
   portal uses) since the photo endpoint needs the auth header and
   can't be used as a plain <img src>.
   ================================================================ */
const _meterPhotoUrlCache = {};

async function fetchMeterPhotoUrl(readingId){
  if (_meterPhotoUrlCache[readingId]) return _meterPhotoUrlCache[readingId];
  const res = await fetch(`${API_BASE_URL}/api/meter-readings/${readingId}/photo`, {
    headers: { 'Authorization': `Bearer ${state.token}` },
  });
  if (!res.ok) throw new Error('Photo could not be loaded');
  const url = URL.createObjectURL(await res.blob());
  _meterPhotoUrlCache[readingId] = url;
  return url;
}

async function loadMeterThumb(readingId, frameEl){
  try {
    const url = await fetchMeterPhotoUrl(readingId);
    frameEl.innerHTML = `<img src="${url}" alt="${t('meter.photoTitle')}">`;
  } catch (err) {
    frameEl.innerHTML = `<span class="tp-meter-photo-error">!</span>`;
  }
}

async function openMeterPhotoModal(readingId){
  openModal(t('meter.photoTitle'), `<div style="text-align:center; padding:30px 0;"><span class="tp-spinner tp-spinner-dark"></span></div>`,
    `<button class="tp-btn tp-btn-ghost" id="tmpCloseBtn">${t('common.cancel')}</button>`);
  document.getElementById('tmpCloseBtn').addEventListener('click', closeModal);
  try {
    const url = await fetchMeterPhotoUrl(readingId);
    document.getElementById('modalBody').innerHTML = `<div class="tp-preview" style="display:block;"><img src="${url}" alt="${t('meter.photoTitle')}" style="width:100%; border-radius:var(--radius-sm);"></div>`;
  } catch (err) {
    document.getElementById('modalBody').innerHTML = `<div class="tp-field-error" style="display:block;">${escapeHtml(err.message)}</div>`;
  }
}
