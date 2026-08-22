/* ================================================================
   USER/js/tenant-meters.js — "Meter"

   Written for someone standing at their meter holding a phone:
   one card, one big button, photo, number, send.

   A tenant can have more than one submeter (e.g. separate light/power
   meters on the same shop). Only ONE meter's reading history is ever
   fetched/shown at a time - switching meters never mixes one meter's
   readings into another's, and opening one meter never has to load
   every other meter's full history. See tmMeterState below.
   ================================================================ */

/* Which meter's detail panel (summary + history) is currently showing.
   Persists across re-renders within the tab so switching back to a
   meter you already opened doesn't re-fetch it (see tmMeterState). */
let tmSelectedMeterId = null;

/* Per-meter cache: { rows, page, total, limit, loading, error, loaded }.
   Keyed by meter id so opening one meter never touches another's data.
   Cleared for a meter only when that meter's data actually changes
   (a new reading is submitted for it - see openSendReadingModal). */
const tmMeterState = {};

/* Bumped on every fetch so a slow, superseded request can never
   overwrite what a newer one already rendered (e.g. rapid meter
   switching, or double-clicking "Load more"). */
let tmRequestSeq = 0;

function renderMeterScreen(){
  if (!tp.meters.length){
    return `
    <div class="tp-empty">
      <div class="tp-empty-title">${t('meter.noMeterTitle')}</div>
      <div class="tp-empty-sub">${t('meter.noMeterSub')}</div>
    </div>`;
  }

  // Keep whatever meter was already selected if it still exists; otherwise
  // (first visit, or that meter was deactivated/reassigned since) default
  // to the first one.
  if (!tp.meters.some(m => m.id === tmSelectedMeterId)){
    tmSelectedMeterId = tp.meters[0].id;
  }
  const selected = tp.meters.find(m => m.id === tmSelectedMeterId);

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

    ${meterSwitcherHtml()}
    ${meterHeaderHtml(selected)}

    <div class="tp-meter-prev">
      <span>${t('meter.lastConfirmed')}</span>
      <strong>${Number(selected.previous_reading).toLocaleString('en-IN')}</strong>
    </div>

    ${meterActionHtml(selected)}

    <div id="meterDetailPanel">${meterDetailPanelHtml(selected.id)}</div>
  `;
}

/* ================================================================
   MULTIPLE SUBMETERS: switcher + prominent header
   Chips only appear once there's something to switch between - a
   tenant with a single meter sees exactly what they saw before.
   ================================================================ */
function meterSwitcherHtml(){
  if (tp.meters.length <= 1) return '';
  return `
  <div class="tp-meter-switcher">
    ${tp.meters.map(m => `
      <button type="button" class="tp-chip ${m.id === tmSelectedMeterId ? 'active' : ''}"
              data-switch-meter="${m.id}">
        ${escapeHtml(m.meter_number)}${m.has_pending ? ' •' : ''}
      </button>`).join('')}
  </div>`;
}

/* Meter number + shop number, highlighted at the top - per-meter, never
   ambiguous about which meter's data is on screen below it. */
function meterHeaderHtml(m){
  return `
  <div class="tp-meter-header">
    <div>
      <div class="tp-meter-header-no">${t('meter.number')} ${escapeHtml(m.meter_number)}</div>
      <div class="tp-meter-header-shop">${t('meter.shopLabel')} ${escapeHtml(m.shop_number || '—')}</div>
    </div>
  </div>`;
}

function meterActionHtml(m){
  return m.has_pending ? `
    <div class="tp-meter-waiting">
      <strong>${t('meter.sentTitle')}</strong>
      ${t('meter.sentBody')}
    </div>
  ` : `
    <button class="tp-btn tp-btn-primary tp-btn-block tp-btn-lg" data-send-reading="${m.id}">
      ${t('meter.sendThisMonth')}
    </button>
  `;
}

/* ================================================================
   SUMMARY SIDEBAR + PAGINATED HISTORY (one meter at a time)

   Rendered from tmMeterState[meterId], which is populated by
   loadMeterDetail() below via GET /api/tenant/meters/{id}/readings -
   a new, paginated, single-meter endpoint. Nothing here touches
   tp.readings (the shared, cross-meter, capped-at-24 list the Home
   tab uses) so this can never mix one meter's history into another's,
   and never depends on whether this particular meter's readings
   happened to survive that shared cap.
   ================================================================ */
function meterDetailPanelHtml(meterId){
  const st = tmMeterState[meterId];

  // First visit to this meter this session, or a request is already in
  // flight for it and nothing has ever loaded yet.
  if (!st || (!st.loaded && st.loading)){
    return `
    <div class="tp-block">
      <div class="tp-block-head"><h2>${t('meter.lastReading')}</h2></div>
      <div style="padding:26px 16px; text-align:center;"><span class="tp-spinner tp-spinner-dark"></span></div>
    </div>`;
  }

  if (st.error && !st.loaded){
    return `
    <div class="tp-block">
      <div class="tp-inline-note tp-inline-warn">
        ${escapeHtml(st.error)}
        <div style="margin-top:8px;">
          <button type="button" class="tp-link" data-retry-meter="${meterId}">${t('common.tryAgain')}</button>
        </div>
      </div>
    </div>`;
  }

  const rows = st.rows;
  const last = rows[0] || null;
  const hasMore = st.total > rows.length;

  return `
    ${meterSummaryHtml(last)}
    <div class="tp-block">
      <div class="tp-block-head"><h2>${t('meter.history')}</h2></div>
      ${rows.length === 0
        ? `<div class="tp-inline-note">${t('meter.noReadingsYet')}</div>`
        : rows.map(r => historyRowHtml(r, rows)).join('')}
      ${hasMore ? `
      <div style="padding:14px 16px;">
        <button type="button" class="tp-btn tp-btn-ghost tp-btn-block"
                data-load-more-meter="${meterId}" ${st.loading ? 'disabled' : ''}>
          ${st.loading ? `<span class="tp-spinner"></span> ${t('meter.loading')}` : t('meter.loadMore')}
        </button>
      </div>` : ''}
    </div>
  `;
}

/* Last reading image, value, captured date, and days-since - all for
   the SELECTED meter only. `last` is the newest row from that meter's
   own paginated history (any status - pending/rejected included, since
   "what did I last send" is the question this answers), or null when
   the meter has never had a reading submitted at all. */
function meterSummaryHtml(last){
  if (!last){
    return `
    <div class="tp-meter-summary">
      <div class="tp-meter-summary-photo"><div class="tp-meter-summary-photo-empty">${t('meter.noImage')}</div></div>
      <div class="tp-meter-summary-body">
        <div class="tp-meter-summary-label">${t('meter.lastReading')}</div>
        <div class="tp-meter-summary-value">—</div>
        <div class="tp-meter-summary-meta">${t('meter.noReadingsYet')}</div>
      </div>
    </div>`;
  }

  const value = last.status === 'approved' && last.approved_reading != null
    ? last.approved_reading : last.customer_reading;

  return `
  <div class="tp-meter-summary">
    ${last.has_photo ? `
    <button type="button" class="tp-meter-summary-photo" data-meter-photo="${last.id}"
            id="tmSummaryPhotoFrame-${last.id}">
      <span class="tp-spinner tp-spinner-dark"></span>
    </button>` : `
    <div class="tp-meter-summary-photo"><div class="tp-meter-summary-photo-empty">${t('meter.noImage')}</div></div>`}
    <div class="tp-meter-summary-body">
      <div class="tp-meter-summary-label">${t('meter.lastReading')}</div>
      <div class="tp-meter-summary-value">${Number(value).toLocaleString('en-IN')}</div>
      <div class="tp-meter-summary-meta">
        ${t('meter.capturedOn')} ${dateFmt(last.reading_date)}<br>
        <span class="tp-meter-summary-days">${daysSinceLabel(last.reading_date)}</span>
      </div>
    </div>
  </div>`;
}

/* Days completed since the last reading - dynamically computed against
   "now", safely, using the same date-only daysBetween() every other
   "days late" figure in the portal already uses (core.js), so this can
   never disagree with the rest of the app about how a day is counted.
   Handles missing dates, unparseable dates, and future/clock-skewed
   dates by falling back to '—' rather than showing a wrong or negative
   number - the same safe-fallback convention used everywhere else in
   this file (see historyRowHtml's Days column). */
function daysSinceLabel(iso){
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  const days = daysBetween(d, new Date());
  if (days < 0) return '—';                 // future-dated / clock skew - never show negative
  if (days === 0) return t('meter.today');
  return `${days} ${days === 1 ? t('meter.daySince') : t('meter.daysSinceMany')}`;
}

/* One row of the reading history table: Reading | Date | Days | See Image |
   See Bill. `allRows` is every row of THIS meter loaded so far (across
   however many pages have been fetched) - used only to find the previous
   approved reading for the Days column below. */
function historyRowHtml(r, allRows){
  const value = r.status === 'approved' && r.approved_reading != null
    ? r.approved_reading : r.customer_reading;

  const daysLabel = billingPeriodDaysLabel(r, allRows);

  const statusNote = r.status === 'rejected'
    ? `<span class="tp-state tp-state-unpaid" style="margin-top:4px; display:inline-block;">${t('meter.rejected')}</span>`
    : r.status === 'pending'
      ? `<span class="tp-state tp-state-part" style="margin-top:4px; display:inline-block;">${t('meter.checking')}</span>`
      : '';

  return `
  <div class="tp-history-row">
    <div class="tp-history-kv">
      <span>${t('meter.readingCol')}</span>
      <strong>${Number(value).toLocaleString('en-IN')}</strong>
      ${statusNote}
    </div>
    <div class="tp-history-kv"><span>${t('meter.date')}</span><strong>${dateFmt(r.reading_date)}</strong></div>
    <div class="tp-history-kv"><span>${t('meter.daysCol')}</span><strong>${daysLabel}</strong></div>
    <div>${r.has_photo
      ? `<button type="button" class="tp-history-action" data-meter-photo="${r.id}">${t('meter.viewPhoto')}</button>`
      : `<span class="tp-history-action" style="color:var(--muted); text-decoration:none;">${t('meter.noImage')}</span>`}</div>
    <div>${r.bill
      ? `<button type="button" class="tp-history-action" data-view-bill="${r.bill.id}">${t('meter.viewBill')}</button>`
      : `<span class="tp-history-action" style="color:var(--muted); text-decoration:none;">${t('meter.noBill')}</span>`}</div>
    ${r.status === 'rejected' && r.rejection_reason ? `
    <div class="tp-row-warn" style="grid-column:1/-1;">${escapeHtml(r.rejection_reason)}</div>` : ''}
  </div>`;
}

/* Existing "billing period" idea, unchanged: days between an approved
   reading and the previous APPROVED reading of the same meter - the
   figure this app has always shown for "Days", just relocated into the
   history table's Days column instead of a "Billing period" line.
   Only searches rows already loaded for this meter, so the very oldest
   row on a not-yet-fully-loaded page can show '—' until "Load more" is
   used - a safe, self-correcting gap, never a wrong number. */
function billingPeriodDaysLabel(r, allRows){
  if (r.status !== 'approved') return '—';
  const approved = allRows
    .filter(x => x.status === 'approved')
    .sort((a, b) => new Date(b.reading_date) - new Date(a.reading_date));
  const idx = approved.findIndex(x => x.id === r.id);
  const prev = approved[idx + 1];
  if (!prev) return '—';
  const days = Math.round((new Date(r.reading_date) - new Date(prev.reading_date)) / 86400000);
  if (days <= 0) return '—';
  return `${days} ${days === 1 ? t('meter.day') : t('meter.days')}`;
}

/* ================================================================
   DATA LOADING (chunked, per meter, cached, stale-response-safe)
   ================================================================ */
async function loadMeterDetail(meterId, page = 1){
  const seq = ++tmRequestSeq;
  const st = tmMeterState[meterId] || (tmMeterState[meterId] = {
    rows: [], page: 0, total: 0, limit: 10, loading: false, error: null, loaded: false,
  });
  st.loading = true;
  st.error = null;
  renderMeterDetailInPlace(meterId);

  try {
    const res = await api(`/api/tenant/meters/${meterId}/readings?page=${page}&limit=${st.limit}`);
    if (seq !== tmRequestSeq) return;   // a newer request has since started - drop this stale response
    st.rows = page === 1 ? (res.data || []) : st.rows.concat(res.data || []);
    st.page = res.page;
    st.total = res.total;
    st.loaded = true;
  } catch (err) {
    if (seq !== tmRequestSeq) return;
    st.error = (err && err.message) || t('meter.historyLoadFailed');
  } finally {
    if (seq === tmRequestSeq) st.loading = false;
  }
  renderMeterDetailInPlace(meterId);
}

/* Replaces just the detail panel's DOM (not the whole tab) so paging
   through one meter's history never disturbs the meter switcher, the
   header above it, or scroll position. */
function renderMeterDetailInPlace(meterId){
  if (meterId !== tmSelectedMeterId) return;   // user switched meters meanwhile
  const panel = document.getElementById('meterDetailPanel');
  if (!panel) return;                          // user navigated to a different tab entirely
  panel.innerHTML = meterDetailPanelHtml(meterId);
  wireMeterDetailPanel(meterId);
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
      // This meter's history just changed - drop its cache so the next
      // time its panel renders it fetches fresh instead of showing the
      // reading list from before this submission. Other meters' caches
      // are untouched.
      delete tmMeterState[meter.id];
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

  document.querySelectorAll('[data-switch-meter]').forEach(btn =>
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.switchMeter);
      if (id === tmSelectedMeterId) return;
      tmSelectedMeterId = id;
      switchTab('meter');
    }));

  wireMeterDetailPanel(tmSelectedMeterId);

  const st = tmMeterState[tmSelectedMeterId];
  if (!st || (!st.loaded && !st.loading)){
    loadMeterDetail(tmSelectedMeterId, 1);
  }
}

/* Wires the buttons that live INSIDE #meterDetailPanel. Called both after
   the full tab renders and after an async refresh replaces just the panel
   (renderMeterDetailInPlace), since innerHTML replacement drops listeners. */
function wireMeterDetailPanel(meterId){
  document.querySelectorAll('[data-meter-photo]').forEach(btn =>
    btn.addEventListener('click', () => openMeterPhotoModal(Number(btn.dataset.meterPhoto))));

  document.querySelectorAll('[data-view-bill]').forEach(btn =>
    btn.addEventListener('click', () => openBillSheet(Number(btn.dataset.viewBill))));

  document.querySelectorAll('[id^="tmSummaryPhotoFrame-"]').forEach(frame => {
    const readingId = frame.id.replace('tmSummaryPhotoFrame-', '');
    loadMeterThumb(Number(readingId), frame);
  });

  document.querySelectorAll('[data-load-more-meter]').forEach(btn =>
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.loadMoreMeter);
      const st = tmMeterState[id];
      if (!st || st.loading) return;   // guards against double-click / duplicate requests
      loadMeterDetail(id, st.page + 1);
    }));

  document.querySelectorAll('[data-retry-meter]').forEach(btn =>
    btn.addEventListener('click', () => loadMeterDetail(Number(btn.dataset.retryMeter), 1)));
}

/* ================================================================
   READING PHOTOS
   Thumbnails load as authenticated blobs (same pattern the admin
   portal uses) since the photo endpoint needs the auth header and
   can't be used as a plain <img src>. Loaded lazily - only the
   summary sidebar's single thumbnail loads eagerly on render; every
   history-row photo loads only once "View photo" is tapped.
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
