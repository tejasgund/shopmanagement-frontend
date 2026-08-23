/* ================================================================
   SCHEDULER/js/init.js — boot. Loads last, runs the app.
   ================================================================ */

(async function boot(){
  document.querySelectorAll('[data-tab]').forEach(btn =>
    btn.addEventListener('click', async () => {
      document.querySelectorAll('[data-tab]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      sch.tab = btn.dataset.tab;
      try { await renderTab(sch.tab); }
      catch (err) { showToast(err.message, 'error'); }
    }));

  document.getElementById('schRefreshBtn').addEventListener('click', refreshAll);

  document.getElementById('schRunBtn').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = 'Running…';
    try {
      const res = await api('/api/scheduler/run', { method: 'POST' });
      if (!res.scheduler_enabled){
        showToast('Scheduler is disabled — due tasks were recorded as skipped.', 'default');
      } else {
        showToast(
          `${res.tasks_run} run, ${res.tasks_failed} failed, ${res.tasks_skipped} skipped`,
          res.tasks_failed ? 'error' : 'success',
        );
      }
      await refreshAll();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  });

  await refreshAll();

  /* Poll so a running task's elapsed time and a newly failed run appear
     without anyone reaching for refresh. Paused while the Settings tab is
     open - re-rendering underneath a half-filled form would throw away
     whatever the admin was typing. */
  sch.timer = setInterval(() => {
    if (sch.tab === 'settings') return;
    if (document.hidden) return;
    refreshAll();
  }, 15000);
})();
