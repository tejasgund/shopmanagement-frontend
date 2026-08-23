/* ================================================================
   SCHEDULER/js/settings.js — the Scheduler Settings tab.

   Reads and writes the ordinary settings API, so these values live in
   the database with every other setting rather than in a config file
   or in this page. The fields are declared here (unlike the task
   lists, which are discovered from the server) because each one needs
   its own wording and units — but the VALUES are always the server's.
   ================================================================ */

const SCHEDULER_SETTING_KEYS = [
  'scheduler.enabled',
  'scheduler.rent_generation_enabled',
  'scheduler.penalty_enabled',
  'scheduler.penalty_percent_per_day',
  'scheduler.penalty_grace_days',
  'scheduler.penalty_max_amount',
  'scheduler.backfill_days',
  'scheduler.lookahead_days',
];

async function renderSettingsTab(body){
  const data = await api('/api/settings');
  const rows = (data.settings || []).filter(s => SCHEDULER_SETTING_KEYS.includes(s.key));

  const field = (s) => {
    const id = `set_${s.key.replace(/\./g, '_')}`;
    if (s.type === 'bool'){
      return `
      <div class="sch-task" style="display:block;">
        <label class="checkbox-row" style="display:flex; align-items:center; gap:10px; cursor:pointer;">
          <input type="checkbox" id="${id}" data-key="${s.key}" data-type="bool" ${s.value ? 'checked' : ''}>
          <span class="sch-task-name">${escapeHtml(s.label)}</span>
        </label>
        <div class="sch-task-meta" style="margin-top:6px;">${escapeHtml(s.help)}</div>
      </div>`;
    }
    const step = s.type === 'float' ? '0.1' : '1';
    return `
      <div class="sch-task" style="display:block;">
        <label for="${id}" class="sch-task-name" style="display:block; margin-bottom:6px;">${escapeHtml(s.label)}</label>
        <input id="${id}" type="number" step="${step}" data-key="${s.key}" data-type="${s.type}"
               value="${escapeHtml(String(s.value ?? ''))}" style="max-width:220px;">
        <div class="sch-task-meta" style="margin-top:6px;">${escapeHtml(s.help)}</div>
      </div>`;
  };

  const group = (title, keys) => `
    <div class="sch-section-title">${escapeHtml(title)}</div>
    ${rows.filter(r => keys.includes(r.key)).map(field).join('')}`;

  body.innerHTML = `
    ${group('Switches', ['scheduler.enabled', 'scheduler.rent_generation_enabled', 'scheduler.penalty_enabled'])}
    ${group('Penalty rules', ['scheduler.penalty_percent_per_day', 'scheduler.penalty_grace_days', 'scheduler.penalty_max_amount'])}
    ${group('Recovery windows', ['scheduler.backfill_days', 'scheduler.lookahead_days'])}
    <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:18px;">
      <button class="btn btn-primary" id="schSaveSettings">Save settings</button>
    </div>`;

  document.getElementById('schSaveSettings').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const values = {};
    document.querySelectorAll('[data-key]').forEach(el => {
      const key = el.dataset.key;
      if (el.dataset.type === 'bool') values[key] = el.checked;
      else if (el.dataset.type === 'int') values[key] = parseInt(el.value, 10);
      else if (el.dataset.type === 'float') values[key] = parseFloat(el.value);
      else values[key] = el.value;
    });

    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = 'Saving…';
    try {
      const res = await api('/api/settings', { method: 'PUT', body: { values } });
      showToast(res.message, 'success');
      // The status strip shows the master switch, so it has to follow a save
      // immediately rather than waiting for the next poll.
      await loadStatus();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  });
}
