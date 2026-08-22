/* ================================================================
   ADMIN/js/settings.js — Application settings

   Every value here is stored in the database, not in code, so the
   business owner can change how the app looks and behaves without a
   developer. The form is generated from the schema the API returns,
   which means new settings added on the backend appear here on their
   own with no frontend change.
   ================================================================ */

let _settingsCache = null;

/* {key: value} for every setting, cached so screens that need one value
   don't refetch the whole payload each time they open. Read from
   /api/settings rather than /api/settings/public - the public endpoint is a
   deliberately small allow-list for callers who aren't signed in, and these
   are admin business config. null = not fetched yet; cleared by
   invalidateSettingsCaches() whenever settings are saved or reset, so a
   change takes effect without a page reload.

   Note "secret"-typed values always arrive blank (the API never echoes them
   back), so this map is only good for non-secret settings. */
let _settingValuesCache = null;

async function getSettingsMap(){
  if (_settingValuesCache) return _settingValuesCache;
  const data = await api('/api/settings');
  const map = {};
  (data.settings || []).forEach(s => { map[s.key] = s.value; });
  _settingValuesCache = map;
  return map;
}

/* One setting's value, or `fallback` if it isn't in the payload. */
async function getSetting(key, fallback = undefined){
  const map = await getSettingsMap();
  return (key in map) ? map[key] : fallback;
}

/* Booleans default to TRUE when absent so a settings payload that predates a
   newly added switch keeps the app behaving as it did before that switch
   existed - the same "missing key means allowed" rule the API applies. */
async function getSettingBool(key){
  const value = await getSetting(key, true);
  return value === undefined || value === null ? true : Boolean(value);
}

/* Throws if the value can't be read. Callers should treat that as "leave the
   due date blank and let the server apply the setting" rather than
   substituting a number of their own - a hardcoded default on this side is
   exactly what made this setting look broken before. */
async function getBillDueDays(){
  const days = Number(await getSetting('bill.due_days'));
  if (!Number.isFinite(days)) throw new Error('bill.due_days missing from /api/settings');
  return days;
}

function invalidateSettingsCaches(){
  _settingsCache      = null;
  _settingValuesCache = null;
}

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
  } else if (s.type === 'secret'){
    // Never pre-filled with the real value (the API never sends it). Blank
    // on save = "leave unchanged" (see settings_service.set_many).
    const placeholder = s.is_set
      ? 'Already set — leave blank to keep it, or type a new value to replace it'
      : 'Not set';
    control = `<label for="${id}">${escapeHtml(s.label)}</label>
      <input id="${id}" type="password" autocomplete="new-password"
             data-setting-key="${s.key}" data-setting-type="secret"
             placeholder="${escapeHtml(placeholder)}" value="">
      <div class="hint" style="margin-top:2px;">${s.is_set ? '✓ Currently set' : '— Not set —'}</div>`;
  } else {
    control = `<label for="${id}">${escapeHtml(s.label)}</label>
      <input id="${id}" type="text" data-setting-key="${s.key}" data-setting-type="str"
             value="${escapeHtml(String(s.value ?? ''))}">`;
  }

  // "secret" values always arrive blank from the API (never echoed back —
  // see app.py's get_settings()), so a "reset to default" link here would
  // be comparing against a blank that means nothing to the admin - suppress
  // it for that type rather than showing a confusing “reset to “”” link.
  const showResetLink = s.type !== 'secret' && !isDefault;

  return `
  <div class="field settings-field">
    ${control}
    <div class="hint">${escapeHtml(s.help)}
      ${showResetLink ? `<button type="button" class="settings-reset-one" data-reset-key="${s.key}" data-default="${escapeHtml(String(s.default))}">reset to “${escapeHtml(String(s.default))}”</button>` : ''}
    </div>
  </div>`;
}

/* ================================================================
   "This window is currently doing nothing" warning.

   "Allow every day" overrides the From/To days entirely. An admin who
   narrows the window while that switch is on gets a setting that silently
   has no effect - which is exactly how a configured 1-10 window went
   unenforced. The switch now defaults off, but it can still be turned on,
   so say plainly when the days below it are inert instead of leaving the
   admin to work it out from behaviour.
   ================================================================ */
function refreshUploadWindowWarning(){
  const anyDay = document.querySelector('[data-setting-key="meter.tenant_upload_any_day"]');
  const from   = document.querySelector('[data-setting-key="meter.tenant_upload_from_day"]');
  const to     = document.querySelector('[data-setting-key="meter.tenant_upload_to_day"]');
  if (!anyDay || !from || !to) return;

  let box = document.getElementById('uploadWindowWarn');
  if (!box){
    box = document.createElement('div');
    box.id = 'uploadWindowWarn';
    box.className = 'warn-box';
    box.style.cssText = 'margin-top:8px; grid-column:1/-1;';
    to.closest('.settings-field').after(box);
  }

  // Only worth saying when the days actually describe something narrower
  // than "the whole month" - otherwise the two agree anyway.
  const narrowed = Number(from.value) > 1 || Number(to.value) < 31;
  const inert = anyDay.checked && narrowed;
  box.style.display = inert ? '' : 'none';
  if (inert){
    box.innerHTML = `${warnIcon()}<span><strong>The day range below is being ignored.</strong>
      “Allow tenant reading upload every day” is on, so tenants can submit on any day —
      days ${escapeHtml(from.value)}–${escapeHtml(to.value)} will have no effect until you turn it off.</span>`;
  }
}

function attachSettingsHandlers(){
  refreshUploadWindowWarning();
  ['meter.tenant_upload_any_day', 'meter.tenant_upload_from_day', 'meter.tenant_upload_to_day']
    .forEach(key => document
      .querySelector(`[data-setting-key="${key}"]`)
      ?.addEventListener('change', refreshUploadWindowWarning));

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
      invalidateSettingsCaches();  // a new due period must apply to the very next bill
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
        invalidateSettingsCaches();
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
    if (cfg.labels) window.__labels = cfg.labels;
    applyNavLabels();
  } catch (err) {
    /* Branding is cosmetic — never block the app if it can't be fetched. */
  }
}
