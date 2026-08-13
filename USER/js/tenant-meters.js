/* ================================================================
   USER/js/tenant-meters.js — "Send my meter reading"

   Written for someone standing in their shop holding a phone. One
   card per meter, one big button, a photo, a number, done. No jargon,
   no multi-step upload, no talk of approvals or tariffs.
   ================================================================ */

let _tenantMeters = [];
let _tenantReadings = [];

async function loadTenantMeterSection(){
  const host = document.getElementById('tenantMeterSection');
  if (!host) return;
  try {
    const [meters, readings] = await Promise.all([
      api('/api/tenant/meters'),
      api('/api/tenant/meter-readings'),
    ]);
    _tenantMeters = meters;
    _tenantReadings = readings;

    // Nothing to show if this tenant has no submeters - keep their page clean.
    if (!meters.length && !readings.length){ host.innerHTML = ''; return; }

    host.innerHTML = tenantMeterHtml(meters, readings);
    attachTenantMeterHandlers();
  } catch (err) {
    host.innerHTML = `<div class="error-banner"><span>Could not load your meters: ${escapeHtml(err.message)}</span></div>`;
  }
}

function tenantMeterHtml(meters, readings){
  const recent = readings.slice(0, 6);
  const rejected = readings.filter(r => r.status === 'rejected');
  const needsAction = rejected.length > 0 ? rejected[0] : null;

  return `
  <div class="collapsible-section">
    <div class="collapsible-header open" onclick="toggleCollapse(this)">
      <h3>Electricity meter</h3>
      <svg class="collapsible-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
    </div>
    <div class="collapsible-body open">

      ${needsAction ? `
      <div class="tm-alert">
        <strong>Your last reading was not accepted.</strong>
        <div style="margin-top:4px;">${escapeHtml(needsAction.rejection_reason || '')}</div>
        <div style="margin-top:6px; font-size:12.5px;">Please take a clearer photo and send it again.</div>
      </div>` : ''}

      ${meters.length === 0 ? `
        <div class="empty-compact">No meter is set up for your shop yet.</div>
      ` : meters.map(m => `
        <div class="tm-card">
          <div class="tm-card-head">
            <div>
              <div class="tm-meter-no">Meter ${escapeHtml(m.meter_number)}</div>
              <div class="tm-shop">${escapeHtml(m.shop_number || '')}</div>
            </div>
            ${m.has_pending
              ? '<span class="stamp pending">sent</span>'
              : ''}
          </div>

          <div class="tm-prev">
            <span>Last confirmed reading</span>
            <strong class="mono">${Number(m.previous_reading).toLocaleString('en-IN')}</strong>
          </div>

          ${m.has_pending ? `
            <div class="tm-waiting">
              You've sent a reading. It's with the office for checking — you'll see your
              bill here once it's confirmed.
            </div>
          ` : `
            <button class="btn btn-primary btn-lg btn-block tm-send-btn" data-send-reading="${m.id}">
              Send this month's reading
            </button>
          `}
        </div>
      `).join('')}

      ${recent.length ? `
      <div class="tm-history-title">Your recent readings</div>
      <div class="tm-history">
        ${recent.map(r => `
        <div class="tm-history-row">
          <div>
            <div class="tm-history-date">${dateFmt(r.reading_date)}</div>
            <div class="tm-history-meta">
              You sent ${Number(r.customer_reading).toLocaleString('en-IN')}
              ${r.status === 'approved' && r.calculated_units != null
                ? ` · ${Number(r.calculated_units).toLocaleString('en-IN')} units used` : ''}
            </div>
            ${r.status === 'rejected' && r.rejection_reason
              ? `<div class="tm-history-reason">${escapeHtml(r.rejection_reason)}</div>` : ''}
          </div>
          <div class="tm-history-right">
            ${tenantReadingStatusHtml(r)}
            ${r.bill ? `<div class="tm-history-amt mono">${currency(r.bill.amount)}</div>` : ''}
          </div>
        </div>`).join('')}
      </div>` : ''}

    </div>
  </div>`;
}

function tenantReadingStatusHtml(r){
  if (r.status === 'approved') return '<span class="stamp paid">confirmed</span>';
  if (r.status === 'rejected') return '<span class="stamp pending" style="color:var(--danger);">not accepted</span>';
  return '<span class="stamp pending">being checked</span>';
}

/* ================================================================
   SEND A READING
   Photo first (that's the bit people forget), then the number.
   ================================================================ */
function openSendReadingModal(meterId){
  const meter = _tenantMeters.find(m => m.id === meterId);
  if (!meter) return;

  openModal(`Meter ${meter.meter_number}`, `
    <div class="tm-form">
      <div class="tm-form-prev">
        Your last confirmed reading was
        <strong class="mono">${Number(meter.previous_reading).toLocaleString('en-IN')}</strong>.
        Today's number should be higher than this.
      </div>

      <div class="field">
        <label for="tmPhoto">1. Take a photo of the meter</label>
        <input id="tmPhoto" type="file" accept="image/*" capture="environment" class="tm-file">
        <div class="hint">Hold steady and get the numbers in focus. The office checks this photo.</div>
        <div id="tmPreviewWrap" class="tm-preview" style="display:none;">
          <img id="tmPreview" alt="The photo you selected">
        </div>
        ${fieldErrorHtml('tmPhotoErr')}
      </div>

      <div class="field">
        <label for="tmReading">2. Type the number shown on the meter</label>
        <input id="tmReading" type="number" inputmode="decimal" step="0.01" min="0"
               class="tm-big-input mono" placeholder="e.g. ${Number(meter.previous_reading) + 250}">
        ${fieldErrorHtml('tmReadingErr')}
      </div>

      <div class="field">
        <label for="tmNote">Anything to tell the office? (optional)</label>
        <input id="tmNote" placeholder="e.g. the last digit is hard to see">
      </div>
    </div>
  `, `
    <button class="btn btn-ghost" id="cancelBtn">Cancel</button>
    <button class="btn btn-primary" id="tmSubmitBtn">Send to office</button>
  `);

  document.getElementById('cancelBtn').addEventListener('click', closeModal);

  // Show the chosen photo so they can see it's not blurry before sending.
  document.getElementById('tmPhoto').addEventListener('change', (e) => {
    const file = e.target.files[0];
    const wrap = document.getElementById('tmPreviewWrap');
    if (!file){ wrap.style.display = 'none'; return; }
    document.getElementById('tmPreview').src = URL.createObjectURL(file);
    wrap.style.display = 'block';
  });

  document.getElementById('tmSubmitBtn').addEventListener('click', async () => {
    const form = document.querySelector('.tm-form');
    clearFieldErrors(form);

    const file = document.getElementById('tmPhoto').files[0];
    const value = parseFloat(document.getElementById('tmReading').value);
    let ok = true;

    if (!file){ showFieldError('tmPhotoErr','Please take a photo of the meter'); ok = false; }
    if (isNaN(value)){ showFieldError('tmReadingErr','Please type the number on the meter'); ok = false; }
    else if (value < Number(meter.previous_reading)){
      showFieldError('tmReadingErr',
        `That's lower than your last confirmed reading (${Number(meter.previous_reading).toLocaleString('en-IN')}). Please check the meter again.`);
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
    btn.innerHTML = '<span class="spinner"></span> Sending…';

    try {
      // FormData must NOT go through api(), which sets a JSON content type -
      // the browser has to set the multipart boundary itself.
      const res = await fetch(`${API_BASE_URL}/api/tenant/meter-readings`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${state.token}` },
        body,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.detail || `Could not send (${res.status})`);

      closeModal();
      showToast('Sent. The office will check your photo.', 'success');
      loadTenantMeterSection();
    } catch (err) {
      btn.disabled = false;
      btn.innerHTML = original;
      showToast(err.message, 'error');
    }
  });
}

function attachTenantMeterHandlers(){
  document.querySelectorAll('[data-send-reading]').forEach(btn =>
    btn.addEventListener('click', () => openSendReadingModal(Number(btn.dataset.sendReading))));
}
