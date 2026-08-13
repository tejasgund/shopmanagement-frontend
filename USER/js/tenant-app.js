/* ================================================================
   USER/js/tenant-app.js — the shell: loads the data once, then
   switches between the four tabs.

   Loads LAST. Everything the screens need lives on `tp` so a tab
   switch is instant (no spinner, no refetch) — important on a shop
   phone with a weak connection.
   ================================================================ */

const tp = {
  tab: 'home',
  loaded: false,
  profile: null,
  shops: [],
  bills: [],
  payments: [],
  meters: [],
  readings: [],
  deposits: [],
};

/* ================================================================
   DATA
   One load, everything the portal needs. Each call is allowed to
   fail on its own — a tenant with no meter shouldn't see an error
   page because the meter endpoint 404'd.
   ================================================================ */
async function loadTenantData(){
  const soft = (p, fallback) => p.catch(() => fallback);

  const [profile, shops, bills, payments, meters, readings, deposits, settings] = await Promise.all([
    api('/api/tenant/profile'),
    soft(api('/api/tenant/shops'), []),
    soft(api('/api/tenant/bills'), []),
    soft(api('/api/tenant/payments'), []),
    soft(api('/api/tenant/meters'), []),
    soft(api('/api/tenant/meter-readings'), []),
    soft(api('/api/tenant/deposit-payments'), []),
    // Optional: if the backend exposes it, the payment-methods line and app
    // name come from there instead of the constants in core.js.
    soft(api('/api/settings/public', { auth: false }), null),
  ]);

  tp.profile  = profile;
  tp.shops    = shops || [];
  tp.bills    = bills || [];
  tp.payments = payments || [];
  tp.meters   = meters || [];
  tp.readings = readings || [];
  tp.deposits = deposits || [];
  tp.publicSettings = settings || null;
  tp.loaded   = true;

  if (settings?.app_name) document.title = settings.app_name;
}

/* ================================================================
   DERIVED NUMBERS
   Worked out once here so every screen agrees on them.
   ================================================================ */
function tpUnpaidBills(){
  return tp.bills.filter(b => Number(b.pending_amount || 0) > 0.004);
}

function tpTotalDue(){
  return tpUnpaidBills().reduce((s, b) => s + Number(b.pending_amount || 0), 0);
}

function tpOverdueBills(){
  const today = startOfToday();
  return tpUnpaidBills().filter(b => b.due_date && new Date(b.due_date) < today);
}

function tpNextDueBill(){
  return tpUnpaidBills()
    .filter(b => b.due_date)
    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))[0] || null;
}

function tpMeterNeedingReading(){
  // A meter is "waiting on the tenant" when it's assigned to them and has
  // nothing currently under review.
  return tp.meters.find(m => !m.has_pending);
}

/* ================================================================
   ROUTER
   ================================================================ */
const TAB_RENDERERS = {
  home:     renderHomeScreen,
  bills:    renderBillsScreen,
  payments: renderPaymentsScreen,
  meter:    renderMeterScreen,
};

function switchTab(tab){
  if (!TAB_RENDERERS[tab]) tab = 'home';
  tp.tab = tab;

  document.querySelectorAll('.tp-tab').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.tab === tab));

  const main = document.getElementById('tenantContent');
  main.innerHTML = TAB_RENDERERS[tab]();
  main.scrollTop = 0;
  window.scrollTo(0, 0);

  // Each screen wires up its own buttons after it renders.
  ({
    home:     attachHomeHandlers,
    bills:    attachBillsHandlers,
    payments: attachPaymentsHandlers,
    meter:    attachMeterHandlers,
  })[tab]();

  updateTabBadges();
}

/* Let a screen jump to another tab (e.g. "See my bills" on Home). */
function tpGoTo(tab){ switchTab(tab); }

/* Text that lives in index.html rather than in a render function - re-applied
   whenever the language changes. */
function applyStaticLabels(){
  document.documentElement.lang = getLang();
  const labels = { home: t('tab.home'), bills: t('tab.bills'),
                   payments: t('tab.payments'), meter: t('tab.meter') };
  document.querySelectorAll('.tp-tab').forEach(btn => {
    const span = btn.querySelector('span:not(.tp-tab-badge)');
    if (span) span.textContent = labels[btn.dataset.tab] || span.textContent;
  });
  document.getElementById('tenantRefreshBtn')?.setAttribute('title', t('action.refresh'));
  document.getElementById('tenantMoreBtn')?.setAttribute('title', t('action.more'));
  const hello = document.getElementById('tenantHello');
  if (hello) hello.textContent = greetingWord();
}

function updateTabBadges(){
  const unpaid = tpUnpaidBills().length;
  const billsBadge = document.getElementById('billsBadge');
  if (unpaid > 0){ billsBadge.style.display = 'flex'; billsBadge.textContent = unpaid; }
  else billsBadge.style.display = 'none';

  // Green dot on the meter tab when a reading is expected from them.
  const meterBadge = document.getElementById('meterBadge');
  const meterTab = document.getElementById('meterTabBtn');
  if (!tp.meters.length){
    meterTab.style.display = 'none';           // no meter, no tab
  } else {
    meterTab.style.display = '';
    if (tpMeterNeedingReading()){ meterBadge.style.display = 'flex'; meterBadge.textContent = '!'; }
    else meterBadge.style.display = 'none';
  }
}

/* ================================================================
   REFRESH
   ================================================================ */
async function refreshTenantPortal(showToastOnDone){
  const btn = document.getElementById('tenantRefreshBtn');
  btn?.classList.add('spinning');
  try {
    await loadTenantData();
    switchTab(tp.tab);
    if (showToastOnDone) showToast('Updated', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn?.classList.remove('spinning');
  }
}

/* ================================================================
   BOOT
   ================================================================ */
(async function boot(){
  const main = document.getElementById('tenantContent');
  main.innerHTML = tpLoadingHtml();

  try {
    await loadTenantData();
  } catch (err) {
    main.innerHTML = `
      <div class="tp-error">
        <div class="tp-error-title">${t('common.loadFail')}</div>
        <div class="tp-error-msg">${escapeHtml(err.message)}</div>
        <button class="tp-btn tp-btn-primary" id="tpRetryBtn">${t('common.tryAgain')}</button>
      </div>`;
    document.getElementById('tpRetryBtn').addEventListener('click', () => location.reload());
    return;
  }

  const name = tp.profile?.name || '';
  document.getElementById('tenantName').textContent = name;
  document.getElementById('tenantInitial').textContent = (name.trim()[0] || '?').toUpperCase();
  applyStaticLabels();

  switchTab('home');

  document.querySelectorAll('.tp-tab').forEach(btn =>
    btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
  document.getElementById('tenantRefreshBtn').addEventListener('click', () => refreshTenantPortal(true));
  document.getElementById('tenantMoreBtn').addEventListener('click', openMoreSheet);
})();
