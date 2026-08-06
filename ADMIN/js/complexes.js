/* ================================================================
   ADMIN/js/complexes.js — split from the old ADMIN/script.js
   Contains: COMPLEXES VIEW, plus editIcon/trashIcon (shared icons
   that first appear here in the original file).
   ================================================================ */
/* ================================================================
   COMPLEXES VIEW
   ================================================================ */
async function complexesView(){
  const complexes = await ensureLoaded('complexes','/api/complex');
  return `
  <div class="toolbar"><input class="search-input" id="tableSearch" placeholder="Search complexes…"></div>
  ${complexes.length === 0 ? emptyStateHtml('No complexes yet', 'Add your first complex to start assigning shops to it.', emptyIcon()) : `
  <div class="table-wrap">
    <table>
      <thead><tr><th>Name</th><th>Address</th><th>Description</th><th>Created</th><th></th></tr></thead>
      <tbody>
        ${complexes.map(c => `
          <tr data-search="${escapeHtml(c.name+' '+c.address)}">
            <td><strong>${escapeHtml(c.name)}</strong></td>
            <td>${escapeHtml(c.address)}</td>
            <td>${escapeHtml(c.description || '—')}</td>
            <td>${dateFmt(c.created_at)}</td>
            <td><div class="row-actions">
              <button class="btn-icon" data-edit-complex="${c.id}" aria-label="Edit">${editIcon()}</button>
              <button class="btn-icon" data-delete-complex="${c.id}" data-name="${escapeHtml(c.name)}" aria-label="Delete">${trashIcon()}</button>
            </div></td>
          </tr>`).join('')}
      </tbody>
    </table>
  </div>`}`;
}

function editIcon(){ return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`; }
function trashIcon(){ return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1.5 14.5a2 2 0 01-2 1.5H8.5a2 2 0 01-2-1.5L5 6m5 0V4a1 1 0 011-1h2a1 1 0 011 1v2"/></svg>`; }

function attachComplexHandlers(){
  document.querySelectorAll('[data-edit-complex]').forEach(btn => btn.addEventListener('click', () => openEditComplexModal(Number(btn.dataset.editComplex))));
  document.querySelectorAll('[data-delete-complex]').forEach(btn => btn.addEventListener('click', () => confirmDelete('complex', Number(btn.dataset.deleteComplex), btn.dataset.name)));
}
