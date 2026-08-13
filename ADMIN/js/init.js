/* ================================================================
   ADMIN/js/init.js — split from the old ADMIN/script.js
   Contains: INIT — must load last, after every other ADMIN/js file,
   since it's the one top-level statement that actually runs the app.
   (the guard script in <head> already confirmed a valid admin session)
   ================================================================ */
(async function boot(){
  await initAdminUser();
  applyBranding();          // configured app name/tagline - cosmetic, don't await
  refreshMeterBadge();      // "N readings waiting for you" count in the sidebar
  navigateTo('dashboard');
})();

/* Sidebar count of readings waiting for review. Refreshed on boot and after
   any approve/reject so the number never goes stale. */
async function refreshMeterBadge(){
  const badge = document.getElementById('meterBadge');
  if (!badge) return;
  try {
    const pending = await api('/api/meter-readings?status=pending');
    if (pending.length > 0){ badge.style.display = 'inline-block'; badge.textContent = pending.length; }
    else badge.style.display = 'none';
  } catch (err) { /* non-fatal */ }
}
