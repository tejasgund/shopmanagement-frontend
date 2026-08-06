/* ================================================================
   USER/js/init.js — split from the old USER/script.js
   Must load LAST — kicks off the initial page load.
   ================================================================ */
/* ================================================================
   INIT
   (the guard script in <head> already confirmed a valid tenant session)
   ================================================================ */
(async function boot(){
  await loadTenantPortal();
})();
