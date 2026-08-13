/* ================================================================
   USER/js/ui-helpers.js — modal sheet + small form helpers.

   On a phone the modal slides up from the bottom like a native
   sheet (see .modal in style.css), which is what people expect and
   keeps the close button within thumb reach.
   ================================================================ */

function openModal(title, bodyHtml, footHtml){
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  document.getElementById('modalFoot').innerHTML = footHtml || '';
  document.getElementById('modalOverlay').classList.add('show');
  document.body.style.overflow = 'hidden';   // stop the page scrolling behind
}

function closeModal(){
  document.getElementById('modalOverlay').classList.remove('show');
  document.body.style.overflow = '';
}

function showFieldError(id, msg){
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
}

function clearFieldErrors(scope){
  if (!scope) return;
  scope.querySelectorAll('.tp-field-error').forEach(e => {
    e.style.display = 'none';
    e.textContent = '';
  });
}

document.getElementById('modalCloseBtn')?.addEventListener('click', closeModal);
document.getElementById('modalOverlay')?.addEventListener('click', (e) => {
  if (e.target.id === 'modalOverlay') closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.getElementById('modalOverlay')?.classList.contains('show')) closeModal();
});
