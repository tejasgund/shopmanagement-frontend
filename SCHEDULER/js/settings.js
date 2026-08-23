/* ================================================================
   SCHEDULER/js/settings.js — the Scheduler Settings tab.

   These belong to THIS app. They are stored in the same database
   table as every other setting — one settings mechanism, one
   validation path, one audit trail — but they are served by this
   app's own endpoints, and the main admin Settings screen can
   neither see nor change them. The API refuses the crossover in
   both directions, so the separation does not depend on this page
   behaving itself.

   The field list comes from the server's schema, so a scheduler
   setting added in the backend appears here with no change to this
   file — same rule as the task lists.
   ================================================================ */

async function renderSettingsTab(body){
  const data = await api('/api/scheduler/settings');
  const rows = data.settings || [];

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

  /* Switches first, then everything else, so the on/off controls an admin
     came here for are at the top. Anything the server adds later that is
     neither of those still renders - it simply lands in "Other". */
  const switches = rows.filter(r => r.type === 'bool');
  const numbers  = rows.filter(r => r.type !== 'bool');

  const group = (title, items) => items.length ? `
    <div class="sch-section-title">${escapeHtml(title)}</div>
    ${items.map(field).join('')}` : '';

  body.innerHTML = `
    ${group('Switches', switches)}
    ${group('Rules and windows', numbers)}
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
      const res = await api('/api/scheduler/settings', { method: 'PUT', body: { values } });
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
