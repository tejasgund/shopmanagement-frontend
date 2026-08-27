/* ================================================================
   SCHEDULER/js/init.js — boot. Loads last, runs the app.
   ================================================================ */

(async function boot(){
  document.querySelectorAll('[data-tab]').forEach(btn =>
    btn.addEventListener('click', () => {
      // Leaving the Runs tab closes any open run detail, so coming back to
      // it shows the list rather than whatever was last drilled into.
      if (btn.dataset.tab !== 'runs') sch.openRunId = null;
      // Picking a tab leaves the deep-linked bill view.
      sch.billId = null;
      if (location.hash) history.replaceState(null, '', location.pathname);
      switchTab(btn.dataset.tab);
    }));

  document.getElementById('schRefreshBtn').addEventListener('click', refreshAll);

  /* Deep link: SCHEDULER/index.html#bill-123 opens that bill's history. This
     is the target of the "late fee" link on every bill in the admin list, so
     "where did this figure come from" is one click from where it is noticed.
     Handled on load AND on hashchange, since arriving at the page and
     following a second link from it are the same request. */
  sch.billId = billIdFromHash();
  window.addEventListener('hashchange', () => {
    sch.billId = billIdFromHash();
    renderTab(sch.tab).catch(err => showToast(err.message, 'error'));
  });

  await refreshAll();

  /* Poll so a run that finished (or failed) since the page opened appears
     without anyone reaching for refresh. Slower than the old ledger's 15s:
     these scripts run once a night, so there is nothing to watch second by
     second.

     Paused on the Settings tab - re-rendering underneath a half-filled form
     would throw away whatever the admin was typing - and while the tab is
     hidden, so a forgotten browser tab is not polling all day. */
  sch.timer = setInterval(() => {
    if (sch.tab === 'settings') return;
    if (document.hidden) return;
    refreshAll();
  }, 30000);
})();
