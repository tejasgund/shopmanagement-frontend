/* ================================================================
   ADMIN/js/init.js — split from the old ADMIN/script.js
   Contains: INIT — must load last, after every other ADMIN/js file,
   since it's the one top-level statement that actually runs the app.
   (the guard script in <head> already confirmed a valid admin session)
   ================================================================ */
(async function boot(){
  await initAdminUser();
  navigateTo('dashboard');
})();
