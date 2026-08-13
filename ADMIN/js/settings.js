/* ================================================================
   ADMIN/js/settings.js — Application settings

   Every value here is stored in the database, not in code, so the
   business owner can change how the app looks and behaves without a
   developer. The form is generated from the schema the API returns,
   which means new settings added on the backend appear here on their
   own with no frontend change.
   ================================================================ */

let _settingsCache = null;

async function settingsView(){
  const data = await api('/api/settings');
  _settingsCache = data;

  const byCategory = {};
  data.settings.forEach(s => {
    (byCategory[s.category] = byCategory[s.category] || []).push(s);
  });

  return `
  <div class="card card-pad" style="margin-bottom:18px;">
    <h3 style="font-size:15px; margin:0 0 6px;">Everything here takes effect immediately</h3>
    <p style="font-size:13px; color:var(--muted); margin:0;">
      Change what the app is called, the words it uses for tenants and shops, photo limits
      and how meter bills are raised. Nothing here needs a redeploy — save and it's live.
    </p>
  </div>

  <form id="settingsForm">
    ${Object.entries(byCategory).map(([category, items]) => `
    <div class="card" style="margin-bottom:16px;">
      <div class="card-pad" style="padding-bottom:6px;">
        <h3 style="font-size:15.5px;">${escapeHtml(category)}</h3>
      </div>
      <div class="card-pad" style="padding-top:8px;">
        <div class="settings-grid">
          ${items.map(s => settingFieldHtml(s)).join('')}
        </div>
      </div>
    </div>`).join('')}
  </form>

  <div class="settings-actions">
    <button class="btn btn-ghost" id="resetSettingsBtn">Reset all to defaults</button>
    <button class="btn btn-primary" id="saveSettingsBtn">Save changes</button>
  </div>`;
}

function settingFieldHtml(s){
  const id = `set_${s.key.replace(/\./g,'_')}`;
  const isDefault = String(s.value) === String(s.default);

  let control;
  if (s.type === 'bool'){
    control = `<label class="checkbox-row" style="padding:6px 0;">
      <input type="checkbox" id="${id}" data-setting-key="${s.key}" data-setting-type="bool" ${s.value?'checked':''}>
      <span>${escapeHtml(s.label)}</span>
    </label>`;
  } else if (s.type === 'int' || s.type === 'float'){
    control = `<label for="${id}">${escapeHtml(s.label)}</label>
      <input id="${id}" type="number" ${s.type==='float'?'step="0.1"':'step="1"'}
             data-setting-key="${s.key}" data-setting-type="${s.type}" value="${escapeHtml(String(s.value))}">`;
  } else {
    control = `<label for="${id}">${escapeHtml(s.label)}</label>
      <input id="${id}" type="text" data-setting-key="${s.key}" data-setting-type="str"
             value="${escapeHtml(String(s.value ?? ''))}">`;
  }

  return `
  <div class="field settings-field">
    ${control}
    <div class="hint">${escapeHtml(s.help)}
      ${!isDefault ? `<button type="button" class="settings-reset-one" data-reset-key="${s.key}" data-default="${escapeHtml(String(s.default))}">reset to “${escapeHtml(String(s.default))}”</button>` : ''}
    </div>
  </div>`;
}

function attachSettingsHandlers(){
  document.getElementById('saveSettingsBtn')?.addEventListener('click', async () => {
    const values = {};
    document.querySelectorAll('[data-setting-key]').forEach(el => {
      const key = el.dataset.settingKey;
      const type = el.dataset.settingType;
      if (type === 'bool') values[key] = el.checked;
      else if (type === 'int') values[key] = parseInt(el.value, 10);
      else if (type === 'float') values[key] = parseFloat(el.value);
      else values[key] = el.value;
    });

    await withSavingState('saveSettingsBtn', async () => {
      const res = await api('/api/settings', { method:'PUT', body:{ values } });
      showToast(res.message, 'success');
      await applyBranding();       // reflect a new app name straight away
      await renderView('settings');
    });
  });

  document.querySelectorAll('[data-reset-key]').forEach(btn => btn.addEventListener('click', () => {
    const field = document.querySelector(`[data-setting-key="${btn.dataset.resetKey}"]`);
    if (!field) return;
    if (field.dataset.settingType === 'bool') field.checked = btn.dataset.default === 'True' || btn.dataset.default === 'true';
    else field.value = btn.dataset.default;
    showToast('Reset — remember to save', 'default');
  }));

  document.getElementById('resetSettingsBtn')?.addEventListener('click', () => {
    openModal('Reset all settings', `
      <div class="confirm-body">Put every setting back to its original value? Your data
      (tenants, bills, readings) is not affected — only the configuration on this page.</div>
    `, `
      <button class="btn btn-ghost" id="cancelBtn">Cancel</button>
      <button class="btn btn-danger-ghost" id="confirmResetBtn">Reset all</button>
    `);
    document.getElementById('cancelBtn').addEventListener('click', closeModal);
    document.getElementById('confirmResetBtn').addEventListener('click', async () => {
      await withSavingState('confirmResetBtn', async () => {
        await api('/api/settings/reset', { method:'POST' });
        closeModal();
        showToast('All settings reset to defaults', 'success');
        await applyBranding();
        await renderView('settings');
      }, 'Resetting…');
    });
  });
}

/* ================================================================
   BRANDING — applies the configured app name/tagline to the shell.
   Called once at boot and again whenever settings are saved.
   ================================================================ */
async function applyBranding(){
  try {
    const cfg = await api('/api/settings/public', { auth:false });
    const name = cfg.app_name || 'Ledger';

    document.title = `${name} — Admin`;
    const wordmark = document.querySelector('.sidebar-mark .wordmark');
    if (wordmark){
      // Keep the existing two-tone styling: first word plain, rest accented.
      const parts = name.trim().split(/\s+/);
      wordmark.innerHTML = parts.length > 1
        ? `${escapeHtml(parts[0])} <span>${escapeHtml(parts.slice(1).join(' '))}</span>`
        : escapeHtml(name);
    }
    const stamp = document.querySelector('.sidebar-mark .stamp-mark');
    if (stamp) stamp.textContent = (name.trim()[0] || 'L').toUpperCase();

    if (cfg.currency_symbol) window.__currencySymbol = cfg.currency_symbol;
  } catch (err) {
    /* Branding is cosmetic — never block the app if it can't be fetched. */
  }
}
