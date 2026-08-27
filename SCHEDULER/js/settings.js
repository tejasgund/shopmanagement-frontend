/* ================================================================
   SCHEDULER/js/settings.js — the switches the two cron scripts obey.

   These live in the database, not in the scripts, so the penalty rate
   can be changed here rather than by editing Python on the server.
   The scripts read them fresh on every run: a change takes effect on
   the next one, with nothing to restart and no crontab to edit.

   The form is built from the schema the API returns, so a setting
   added in the backend appears here with no change to this file.
   ================================================================ */

async function renderSettings(){
  const body = document.getElementById('schBody');
  const data = await api('/api/scheduler/settings');

  body.innerHTML = `
    <div class="sch-note">
      Read by <code>auto_rent_generation.py</code> and
      <code>due_bill_penalty.py</code> at the start of every run. A change
      here applies to the next run — there is nothing to restart.
    </div>

    <form id="schSettingsForm" class="sch-settings">
      ${data.settings.map(settingField).join('')}
      <div class="sch-settings-actions">
        <button type="submit" class="btn btn-primary">Save settings</button>
        <button type="button" class="btn btn-ghost" id="schSettingsReset">Discard changes</button>
      </div>
    </form>`;

  document.getElementById('schSettingsForm')
    .addEventListener('submit', (e) => saveSettings(e, data.settings));
  document.getElementById('schSettingsReset')
    .addEventListener('click', () => renderTab('settings'));

  // Turning the penalty on is the one setting here that starts charging
  // people money, so it says so at the moment it is switched.
  const penaltyToggle = document.querySelector('[data-key="scheduler.penalty_enabled"]');
  if (penaltyToggle) {
    penaltyToggle.addEventListener('change', () => {
      if (penaltyToggle.checked) {
        showToast('Penalties will start accruing on overdue bills from the next run.',
                  'default');
      }
    });
  }
}

function settingField(item){
  const id = `set_${item.key.replace(/\./g, '_')}`;
  const common = `id="${id}" data-key="${escapeHtml(item.key)}" data-type="${escapeHtml(item.type)}"`;

  const control = item.type === 'bool'
    ? `<label class="sch-switch">
         <input type="checkbox" ${common} ${item.value ? 'checked' : ''}>
         <span>${item.value ? 'On' : 'Off'}</span>
       </label>`
    : `<input type="number" step="${item.type === 'float' ? '0.01' : '1'}"
              ${common} value="${escapeHtml(item.value)}">`;

  return `
    <div class="sch-setting">
      <div class="sch-setting-label">
        <label for="${id}">${escapeHtml(item.label)}</label>
        <div class="sch-setting-help">${escapeHtml(item.help)}</div>
        <div class="sch-setting-default">Default: ${escapeHtml(String(item.default))}</div>
      </div>
      <div class="sch-setting-control">${control}</div>
    </div>`;
}

async function saveSettings(event, schema){
  event.preventDefault();
  const button = event.target.querySelector('button[type="submit"]');
  button.disabled = true;
  const original = button.textContent;
  button.textContent = 'Saving…';

  try {
    const values = {};
    schema.forEach(item => {
      const el = document.querySelector(`[data-key="${item.key}"]`);
      if (!el) return;
      if (item.type === 'bool')       values[item.key] = el.checked;
      else if (item.type === 'int')   values[item.key] = parseInt(el.value, 10);
      else                            values[item.key] = parseFloat(el.value);
    });

    // A blank or non-numeric box would be sent as NaN and rejected by the
    // server with a less helpful message than this one.
    const bad = Object.entries(values).find(([, v]) => typeof v === 'number' && isNaN(v));
    if (bad) {
      showToast('Every number needs a value before saving.', 'error');
      return;
    }

    await api('/api/scheduler/settings', { method: 'PUT', body: { values } });
    showToast('Saved. The next scheduler run will use these.', 'success');
    await renderTab('settings');
    await loadSummary();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}
