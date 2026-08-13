/* ================================================================
   USER/js/tenant-meters.js — "Meter"

   Written for someone standing at their meter holding a phone:
   one card, one big button, photo, number, send.
   ================================================================ */

function renderMeterScreen(){
  if (!tp.meters.length){
    return `
    <div class="tp-empty">
      <div class="tp-empty-title">No meter for your shop</div>
      <div class="tp-empty-sub">If you have an electricity submeter, ask the office to add it.</div>
    </div>`;
  }

  const rejected = tp.readings.find(r => r.status === 'rejected');
  const stillRejected = rejected &&
    !tp.readings.some(r => r.meter_id === rejected.meter_id &&
                           new Date(r.reading_date) > new Date(rejected.reading_date));

  return `
    ${stillRejected ? `
    <div class="tp-alert tp-alert-late">
      <strong>Your last photo wasn't accepted.</strong>
      ${escapeHtml(rejected.rejection_reason || '')}<br>
      Please take a clearer photo and send it again.
    </div>` : ''}

    ${tp.meters.map(meterCardHtml).join('')}
    ${meterHistoryHtml()}
  `;
}

function meterCardHtml(m){
  return `
  <div class="tp-meter-card">
    <div class="tp-meter-head">
      <div>
        <div class="tp-meter-no">Meter ${escapeHtml(m.meter_number)}</div>
        <div class="tp-meter-shop">${escapeHtml(m.shop_number || '')}</div>
      </div>
    </div>

    <div class="tp-meter-prev">
      <span>Last confirmed reading</span>
      <strong>${Number(m.previous_reading).toLocaleString('en-IN')}</strong>
    </div>

    ${m.has_pending ? `
      <div class="tp-meter-waiting">
        <strong>Sent ✓</strong>
        The office is checking your photo. Your bill will appear once it's confirmed.
      </div>
    ` : `
      <button class="tp-btn tp-btn-primary tp-btn-block tp-btn-lg" data-send-reading="${m.id}">
        📷 Send this month's reading
      </button>
    `}
  </div>`;
}

function meterHistoryHtml(){
  const rows = tp.readings.slice(0, 12);
  if (!rows.length) return '';

  return `
  <div class="tp-block">
    <div class="tp-block-head"><h2>What you've sent before</h2></div>
    ${rows.map(r => {
      const label = r.status === 'approved' ? 'Confirmed'
                  : r.status === 'rejected' ? 'Not accepted' : 'Being checked';
      const cls = r.status === 'approved' ? 'paid' : r.status === 'rejected' ? 'unpaid' : 'part';
      return `
      <div class="tp-row">
        <div>
          <div class="tp-row-title">${dateFmt(r.reading_date)}</div>
          <div class="tp-row-sub">
            You sent ${Number(r.customer_reading).toLocaleString('en-IN')}${
              r.status === 'approved' && r.calculated_units != null
                ? ` · ${Number(r.calculated_units).toLocaleString('en-IN')} units used` : ''}
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
        Your last confirmed reading was <strong>${prev.toLocaleString('en-IN')}</strong>.
        Today's number should be higher than this.
      </div>

      <div class="tp-field">
        <label for="tmPhoto"><span class="tp-step">1</span> Take a photo of the meter</label>
        <input id="tmPhoto" type="file" accept="image/*" capture="environment" class="tp-file">
        <div class="tp-field-hint">Get the numbers in focus — the office reads this photo.</div>
        <div id="tmPreviewWrap" class="tp-preview" style="display:none;">
          <img id="tmPreview" alt="The photo you selected">
        </div>
        <div class="tp-field-error" id="tmPhotoErr" style="display:none;"></div>
      </div>

      <div class="tp-field">
        <label for="tmReading"><span class="tp-step">2</span> Type the number on the meter</label>
        <input id="tmReading" type="number" inputmode="decimal" step="0.01" min="0"
               class="tp-big-input" placeholder="${(prev + 250).toLocaleString('en-IN')}">
        <div class="tp-field-error" id="tmReadingErr" style="display:none;"></div>
      </div>

      <div class="tp-field">
        <label for="tmNote">Anything to tell the office? <span class="tp-optional">(optional)</span></label>
        <input id="tmNote" class="tp-text-input" placeholder="e.g. the last digit is hard to see">
      </div>
    </div>
  `, `
    <button class="tp-btn tp-btn-ghost" id="tmCancelBtn">Cancel</button>
    <button class="tp-btn tp-btn-primary" id="tmSubmitBtn">Send</button>
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

    if (!file){ showFieldError('tmPhotoErr', 'Please take a photo of the meter'); ok = false; }
    if (isNaN(value)){ showFieldError('tmReadingErr', 'Please type the number on the meter'); ok = false; }
    else if (value < prev){
      showFieldError('tmReadingErr',
        `That's lower than your last confirmed reading (${prev.toLocaleString('en-IN')}). Please check again.`);
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
    btn.innerHTML = '<span class="tp-spinner"></span> Sending…';

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
      showToast('Sent. The office will check your photo.', 'success');
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
}
