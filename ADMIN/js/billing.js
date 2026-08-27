/* ================================================================
   ADMIN/js/billing.js — split from the old ADMIN/script.js, then
   redesigned into a single "Finance" section with three clear
   parts so admin/edit/delete/view work never requires scanning
   this whole file:

     1. ADD    — billingAddSectionHtml()      — create a bill/payment
     2. MANAGE — billingManageSectionHtml()   — flat, filterable,
                 sortable list of every bill/payment, edit + delete
     3. VIEW   — billingBrowseHtml() + co.    — browse tenant-wise or
                 property-wise, drill Year → Month (calendar-style
                 tiles) → date, or switch to the simplified Dues
                 overview. Tenant/property quick-search included.

   The bill/payment edit+delete modals and the Dues overview data
   functions are unchanged in spirit from the original file — only
   their presentation and entry points moved.
   ================================================================ */

const BILL_STATUS_OPTIONS = [
  { value:'pending',   label:'Pending' },
  { value:'partial',   label:'Partial' },
  { value:'paid',      label:'Paid' },
  { value:'overdue',   label:'Overdue' },
  { value:'cancelled', label:'Cancelled' },
];
const MONTH_OPTIONS = Array.from({length:12},(_,i)=>({ value:String(i+1), label:new Date(2000,i).toLocaleString('en-IN',{month:'long'}) }));
const MONTH_NAMES = MONTH_OPTIONS.map(m=>m.label);

/* ================================================================
   LATE FEE

   A late fee is its OWN bill now (bill_type "Penalty", with
   parent_bill_id naming the bill it was raised for), not a column on
   the original. So a Rent bill for 10,000 reads 10,000 however long
   it is overdue, and the fee is a separate row anyone can see, count
   and take payment against.

   What these helpers add is the LINK: a fee row that does not say
   which bill it belongs to is exactly the unexplained charge that
   generated the complaints.

   Defaulted reads throughout: a payload from before the split must
   render, not throw.
   ================================================================ */
function isLateFeeBill(b){
  return !!(b && b.parent_bill_id);
}

/* On a late-fee row: a link back to the bill it is for. On the original: a
   link to the fee. Both resolved from the bill list already in hand, so
   neither costs a request. */
function lateFeeOfBill(bills, bill){
  return bills.find(x => x.parent_bill_id === bill.id) || null;
}

/* The fee always came from a scheduler run that recorded why, so one click
   reaches the full calculation rather than a conversation. */
function lateFeeChipHtml(b){
  if (!isLateFeeBill(b)) return '';
  const days = Number(b.penalty_days || 0);
  return `<a class="late-fee-chip" href="../SCHEDULER/index.html#bill-${b.id}"
             title="Late fee on bill #${b.parent_bill_id}${days ? `, ${days} chargeable day(s)` : ''}. Open the Scheduler screen for the full calculation."
             >late fee · bill #${b.parent_bill_id}</a>`;
}

function billingEnrichedData(){
  const bills = state.cache.bills || [];
  const payments = state.cache.payments || [];
  const shops = state.cache.shops || [];
  const users = state.cache.users || [];
  const complexes = state.cache.complexes || [];
  const shopById = Object.fromEntries(shops.map(s=>[s.id,s]));
  const userById = Object.fromEntries(users.map(u=>[u.id,u]));
  const complexById = Object.fromEntries(complexes.map(c=>[c.id,c]));
  const paymentsByBill = {};
  payments.forEach(p => { if (!paymentsByBill[p.bill_id]) paymentsByBill[p.bill_id] = []; paymentsByBill[p.bill_id].push(p); });
  const now = new Date();
  const list = bills.map(b => {
    const shop = shopById[b.shop_id];
    const user = userById[b.user_id];
    const cid = shop ? (shop.complex_id ?? null) : null;
    const d = b.bill_date ? new Date(b.bill_date) : (b.created_at ? new Date(b.created_at) : null);
    return {
      ...b,
      shop, user,
      complexId: cid,
      complexName: cid != null ? (complexById[cid]?.name || `#${cid}`) : 'Unassigned',
      year: d ? d.getFullYear() : null,
      month: d ? d.getMonth()+1 : null,
      payments: paymentsByBill[b.id] || [],
      isOverdue: b.status !== 'paid' && b.status !== 'cancelled' && b.due_date && new Date(b.due_date) < now,
    };
  });
  return { list, shops, users, complexes };
}

function billingPaymentsEnriched(){
  const payments = state.cache.payments || [];
  const bills = state.cache.bills || [];
  const shops = state.cache.shops || [];
  const users = state.cache.users || [];
  const complexes = state.cache.complexes || [];
  const billById = Object.fromEntries(bills.map(b=>[b.id,b]));
  const shopById = Object.fromEntries(shops.map(s=>[s.id,s]));
  const userById = Object.fromEntries(users.map(u=>[u.id,u]));
  const complexById = Object.fromEntries(complexes.map(c=>[c.id,c]));
  return payments.map(p => {
    const bill = billById[p.bill_id];
    const shop = bill ? shopById[bill.shop_id] : null;
    const user = bill ? userById[bill.user_id] : null;
    const cid = shop ? (shop.complex_id ?? null) : null;
    return {
      ...p, bill, shop, user,
      complexId: cid,
      complexName: cid != null ? (complexById[cid]?.name || `#${cid}`) : 'Unassigned',
    };
  });
}

function billingActiveFiltersCount(){
  const f = state.billing.filters;
  return f.status.length + f.complexIds.length + f.typeSet.length + f.years.length + f.months.length + (f.search.trim() ? 1 : 0);
}

function billMatchesFilters(b, f){
  if (f.status.length && !f.status.some(s => s === 'overdue' ? b.isOverdue : b.status === s)) return false;
  if (f.complexIds.length && !f.complexIds.includes(String(b.complexId))) return false;
  if (f.typeSet.length && !f.typeSet.includes(b.bill_type)) return false;
  if (f.years.length && !f.years.includes(String(b.year))) return false;
  if (f.months.length && !f.months.includes(String(b.month))) return false;
  if (f.search.trim()){
    const q = f.search.trim().toLowerCase();
    const hay = `${b.user?.name||''} ${b.user?.mobile||''} ${b.shop?.shop_number||''} ${b.complexName} ${b.bill_type} ${b.description||''} #${b.id}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function paymentMatchesFilters(p, f){
  if (f.complexId && String(p.complexId) !== String(f.complexId)) return false;
  if (f.method && p.payment_method !== f.method) return false;
  if (f.year && String(p.payment_date ? new Date(p.payment_date).getFullYear() : '') !== String(f.year)) return false;
  if (f.month && String(p.payment_date ? new Date(p.payment_date).getMonth()+1 : '') !== String(f.month)) return false;
  if (f.search && f.search.trim()){
    const q = f.search.trim().toLowerCase();
    const hay = `${p.user?.name||''} ${p.user?.mobile||''} ${p.shop?.shop_number||''} ${p.complexName} ${p.payment_method||''} #${p.id} #${p.bill_id}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function msFieldHtml(id, label, options, selected){
  const sel = new Set((selected||[]).map(String));
  let summary;
  if (sel.size === 0) summary = 'All';
  else if (sel.size === 1) summary = options.find(o=>String(o.value)===[...sel][0])?.label || [...sel][0];
  else summary = `${sel.size} selected`;
  return `
  <div class="field ms-field">
    <label>${escapeHtml(label)}</label>
    <button type="button" class="ms-btn" id="${id}Btn" data-ms="${id}">
      <span>${escapeHtml(summary)}</span>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
    </button>
    <div class="ms-panel" id="${id}Panel">
      ${options.length===0 ? `<div class="ms-empty">No options</div>` :
        `<div class="checkbox-list" style="border:none; padding:2px; max-height:230px;">
          ${options.map(o => `<label class="checkbox-row"><input type="checkbox" class="ms-check" data-ms="${id}" value="${escapeHtml(String(o.value))}" ${sel.has(String(o.value))?'checked':''}> ${escapeHtml(o.label)}</label>`).join('')}
        </div>`}
    </div>
  </div>`;
}

function initMsFields(ids, onChange){
  ids.forEach(id => {
    const btn = document.getElementById(id+'Btn');
    const panel = document.getElementById(id+'Panel');
    if (!btn || !panel) return;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = panel.classList.contains('open');
      document.querySelectorAll('.ms-panel.open').forEach(p => p.classList.remove('open'));
      if (!isOpen) panel.classList.add('open');
    });
    panel.addEventListener('click', (e) => e.stopPropagation());
    panel.querySelectorAll('.ms-check').forEach(cb => {
      cb.addEventListener('change', () => {
        const values = Array.from(panel.querySelectorAll('.ms-check:checked')).map(c=>c.value);
        const optLabelMap = {};
        panel.querySelectorAll('.ms-check').forEach(c => { optLabelMap[c.value] = c.closest('.checkbox-row').textContent.trim(); });
        const summaryEl = btn.querySelector('span');
        if (values.length === 0) summaryEl.textContent = 'All';
        else if (values.length === 1) summaryEl.textContent = optLabelMap[values[0]] || values[0];
        else summaryEl.textContent = `${values.length} selected`;
        onChange(id, values);
      });
    });
  });
  if (!window.__msGlobalClickBound){
    document.addEventListener('click', () => document.querySelectorAll('.ms-panel.open').forEach(p => p.classList.remove('open')));
    window.__msGlobalClickBound = true;
  }
}

/* ================================================================
   TOP-LEVEL: three-tab Finance section (Add / Manage / View)
   ================================================================ */
async function billingView(){
  await Promise.all([
    ensureLoaded('bills','/api/bill'),
    ensureLoaded('payments','/api/payment'),
    ensureLoaded('users','/api/user'),
    ensureLoaded('shops','/api/shop'),
    ensureLoaded('complexes','/api/complex'),
  ]);
  updatePendingBadge(state.cache.bills.filter(b=>b.status!=='paid').length);

  return `
  <div class="billing-section-tabs" id="billingSectionTabs">
    <button type="button" class="billing-section-tab ${state.billing.section==='add'?'active':''}" data-billing-section="add"><span class="bst-num">1</span> Add bill &amp; payment</button>
    <button type="button" class="billing-section-tab ${state.billing.section==='manage'?'active':''}" data-billing-section="manage"><span class="bst-num">2</span> Edit &amp; delete</button>
    <button type="button" class="billing-section-tab ${state.billing.section==='view'?'active':''}" data-billing-section="view"><span class="bst-num">3</span> View bills &amp; payments</button>
  </div>
  <div id="billingSectionBody"></div>
  `;
}

function attachBillingHandlers(){
  if (pendingBillsViewFilter) {
    const g = pendingBillsViewFilter;
    const f = state.billing.filters;
    const now = new Date();
    state.billing.section = 'manage';
    state.billing.manageTab = 'bills';
    if (g === 'overdue') f.status = ['overdue'];
    else if (g === 'partial') f.status = ['partial'];
    else if (g === 'paid') f.status = ['paid'];
    else if (g === 'outstanding') f.status = ['pending','partial'];
    else if (g === 'due-this-month') { f.status = ['pending','partial']; f.years = [String(now.getFullYear())]; f.months = [String(now.getMonth()+1)]; }
    pendingBillsViewFilter = null;
  }

  document.querySelectorAll('[data-billing-section]').forEach(btn => btn.addEventListener('click', () => {
    if (btn.dataset.billingSection === state.billing.section) return;
    state.billing.section = btn.dataset.billingSection;
    renderBillingSectionBody();
  }));

  renderBillingSectionBody();
}

function renderBillingSectionBody(){
  document.querySelectorAll('[data-billing-section]').forEach(b => b.classList.toggle('active', b.dataset.billingSection === state.billing.section));
  const container = document.getElementById('billingSectionBody');
  if (!container) return;
  if (state.billing.section === 'add'){
    container.innerHTML = billingAddSectionHtml();
    attachBillingAddHandlers();
  } else if (state.billing.section === 'manage'){
    container.innerHTML = billingManageSectionHtml();
    attachBillingManageHandlers();
  } else {
    container.innerHTML = `<div id="billingResults"></div>`;
    renderBillingResults();
  }
}

/* ================================================================
   1. ADD
   ================================================================ */
function billingAddSectionHtml(){
  return `
  <div class="billing-add-intro">Create a new bill or log a payment you've received — it shows up immediately in <strong>View bills &amp; payments</strong> and can be edited any time from <strong>Edit &amp; delete</strong>.</div>
  <div class="billing-add-grid">
    <button type="button" class="card billing-add-card" data-add-action="bill">
      <div class="billing-add-icon">${rupeeIcon()}</div>
      <div class="billing-add-title">Add bill</div>
      <div class="billing-add-sub">Rent, electricity, maintenance, or any other charge — for one shop or several at once.</div>
    </button>
    <button type="button" class="card billing-add-card" data-add-action="payment">
      <div class="billing-add-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 12V8H6a2 2 0 010-4h12v4"/><path d="M4 6v12a2 2 0 002 2h14v-4"/><path d="M18 12a2 2 0 000 4h4v-4z"/></svg></div>
      <div class="billing-add-title">Record payment</div>
      <div class="billing-add-sub">Log money received — auto-allocate across the tenant's oldest dues, or apply to one bill.</div>
    </button>
    <button type="button" class="card billing-add-card" data-add-action="rent-bills">
      <div class="billing-add-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg></div>
      <div class="billing-add-title">Generate rent bills</div>
      <div class="billing-add-sub">Run the monthly rent generator for every tenant with auto-billing turned on.</div>
    </button>
  </div>`;
}

function attachBillingAddHandlers(){
  document.querySelectorAll('[data-add-action]').forEach(btn => btn.addEventListener('click', () => {
    const action = btn.dataset.addAction;
    if (action === 'bill') openBillModal();
    else if (action === 'payment') openPaymentModal();
    else if (action === 'rent-bills') openGenerateRentBillsModal();
  }));
}

/* ================================================================
   2. MANAGE — flat, filterable, sortable — edit/delete lives here
   ================================================================ */
function billingManageSectionHtml(){
  const tab = state.billing.manageTab || 'bills';
  return `
  <div class="billing-tab-bar" style="margin-bottom:16px;">
    <button type="button" class="billing-tab-btn ${tab==='bills'?'active':''}" data-manage-tab="bills">Bills</button>
    <button type="button" class="billing-tab-btn ${tab==='payments'?'active':''}" data-manage-tab="payments">Payments</button>
  </div>
  <div id="billingManageResults"></div>`;
}

function attachBillingManageHandlers(){
  document.querySelectorAll('[data-manage-tab]').forEach(btn => btn.addEventListener('click', () => {
    if (btn.dataset.manageTab === state.billing.manageTab) return;
    state.billing.manageTab = btn.dataset.manageTab;
    renderBillingSectionBody();
  }));
  renderBillingManageResults();
}

function renderBillingManageResults(){
  const container = document.getElementById('billingManageResults');
  if (!container) return;
  container.innerHTML = state.billing.manageTab === 'payments' ? billingManagePaymentsHtml() : billingManageBillsHtml();
  attachBillingManageResultHandlers();
}

function billingManageBillsHtml(){
  const { list: allBills, complexes } = billingEnrichedData();
  const billTypes = [...new Set(allBills.map(b=>b.bill_type).filter(Boolean))].sort();
  const years = [...new Set(allBills.map(b=>b.year).filter(Boolean))].sort((a,b)=>b-a);
  const complexOptions = [
    ...complexes.map(c=>({ value:String(c.id), label:c.name })),
    ...(allBills.some(b=>b.complexId==null) ? [{ value:'null', label:'Unassigned' }] : []),
  ];
  const f = state.billing.filters;
  const matched = allBills.filter(b => billMatchesFilters(b, f));

  return `
  <div class="filter-bar" id="billingFilterBar">
    <div class="field search-full">
      <label>Search</label>
      <input class="search-input" id="bfSearch" placeholder="Tenant name, shop #, complex, bill #…" value="${escapeHtml(f.search)}" style="max-width:100%; min-width:0; width:100%;">
    </div>
    ${msFieldHtml('bfStatus','Status', BILL_STATUS_OPTIONS, f.status)}
    ${msFieldHtml('bfComplex','Complex', complexOptions, f.complexIds)}
    ${msFieldHtml('bfType','Type', billTypes.map(t=>({value:t,label:t})), f.typeSet)}
    ${msFieldHtml('bfYear','Year', years.map(y=>({value:String(y),label:String(y)})), f.years)}
    ${msFieldHtml('bfMonth','Month', MONTH_OPTIONS, f.months)}
    <div class="field">
      <label>Sort</label>
      <select id="bfSort" class="sort-select">
        <option value="newest">Newest first</option>
        <option value="oldest">Oldest first</option>
        <option value="amount-high">Highest amount</option>
        <option value="amount-low">Lowest amount</option>
        <option value="pending-first">Pending first</option>
        <option value="tenant">Tenant A-Z</option>
      </select>
    </div>
    <button class="btn btn-ghost filter-clear-btn" id="bfClear">Clear filters</button>
    <span class="filter-count" id="bfCount">${matched.length} record${matched.length!==1?'s':''}</span>
  </div>
  ${billingFilteredListHtml(matched)}`;
}

function billingManagePaymentsHtml(){
  const allPayments = billingPaymentsEnriched();
  const complexes = state.cache.complexes || [];
  const years = [...new Set(allPayments.map(p=>p.payment_date ? new Date(p.payment_date).getFullYear() : null).filter(Boolean))].sort((a,b)=>b-a);
  const methods = [...new Set(allPayments.map(p=>p.payment_method).filter(Boolean))].sort();
  const pf = state.billing.paymentFilters;
  const matched = allPayments.filter(p => paymentMatchesFilters(p, pf));

  return `
  <div class="filter-bar" id="paymentFilterBar">
    <div class="field search-full">
      <label>Search</label>
      <input class="search-input" id="pfSearch" placeholder="Tenant, shop #, complex, bill #…" value="${escapeHtml(pf.search)}" style="max-width:100%; min-width:0; width:100%;">
    </div>
    <div class="field">
      <label>Complex</label>
      <select id="pfComplex">
        <option value="">All complexes</option>
        ${complexes.map(c=>`<option value="${c.id}" ${String(pf.complexId)===String(c.id)?'selected':''}>${escapeHtml(c.name)}</option>`).join('')}
      </select>
    </div>
    <div class="field">
      <label>Method</label>
      <select id="pfMethod">
        <option value="">All methods</option>
        ${methods.map(m=>`<option value="${escapeHtml(m)}" ${pf.method===m?'selected':''}>${escapeHtml(m)}</option>`).join('')}
      </select>
    </div>
    <div class="field">
      <label>Year</label>
      <select id="pfYear">
        <option value="">All years</option>
        ${years.map(y=>`<option value="${y}" ${String(pf.year)===String(y)?'selected':''}>${y}</option>`).join('')}
      </select>
    </div>
    <div class="field">
      <label>Month</label>
      <select id="pfMonth">
        <option value="">All months</option>
        ${MONTH_OPTIONS.map(m=>`<option value="${m.value}" ${String(pf.month)===String(m.value)?'selected':''}>${m.label}</option>`).join('')}
      </select>
    </div>
    <div class="field">
      <label>Sort</label>
      <select id="pfSort" class="sort-select">
        <option value="newest">Newest first</option>
        <option value="oldest">Oldest first</option>
        <option value="amount-high">Highest amount</option>
        <option value="amount-low">Lowest amount</option>
        <option value="tenant">Tenant A-Z</option>
      </select>
    </div>
    <button class="btn btn-ghost filter-clear-btn" id="pfClear">Clear filters</button>
    <span class="filter-count">${matched.length} record${matched.length!==1?'s':''}</span>
  </div>
  ${billingPaymentsListHtml(matched)}`;
}

function attachBillingManageResultHandlers(){
  if (state.billing.manageTab === 'payments'){
    const pf = state.billing.paymentFilters;
    const sortSel = document.getElementById('pfSort');
    if (sortSel) sortSel.value = state.billing.paymentSort;
    document.getElementById('pfComplex')?.addEventListener('change', (e) => { pf.complexId = e.target.value; renderBillingManageResults(); });
    document.getElementById('pfMethod')?.addEventListener('change', (e) => { pf.method = e.target.value; renderBillingManageResults(); });
    document.getElementById('pfYear')?.addEventListener('change', (e) => { pf.year = e.target.value; renderBillingManageResults(); });
    document.getElementById('pfMonth')?.addEventListener('change', (e) => { pf.month = e.target.value; renderBillingManageResults(); });
    let searchTimer;
    document.getElementById('pfSearch')?.addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      const val = e.target.value;
      searchTimer = setTimeout(() => { pf.search = val; renderBillingManageResults(); }, 250);
    });
    document.getElementById('pfSort')?.addEventListener('change', (e) => {
      state.billing.paymentSort = e.target.value;
      renderBillingManageResults();
    });
    document.getElementById('pfClear')?.addEventListener('click', () => {
      state.billing.paymentFilters = { complexId:'', method:'', year:'', month:'', search:'' };
      renderBillingManageResults();
    });
    document.querySelectorAll('[data-edit-payment]').forEach(btn => btn.addEventListener('click', () => openEditPaymentModal(Number(btn.dataset.editPayment))));
    document.querySelectorAll('[data-delete-payment]').forEach(btn => btn.addEventListener('click', () => {
      const pay = state.cache.payments.find(x => x.id === Number(btn.dataset.deletePayment));
      if (pay) confirmDeletePayment(pay);
    }));
    return;
  }

  const sortSel = document.getElementById('bfSort');
  if (sortSel) sortSel.value = state.billing.sort;
  initMsFields(['bfStatus','bfComplex','bfType','bfYear','bfMonth'], (id, values) => {
    const key = { bfStatus:'status', bfComplex:'complexIds', bfType:'typeSet', bfYear:'years', bfMonth:'months' }[id];
    state.billing.filters[key] = values;
    renderBillingManageResults();
  });
  let searchTimer;
  document.getElementById('bfSearch')?.addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    const val = e.target.value;
    searchTimer = setTimeout(() => { state.billing.filters.search = val; renderBillingManageResults(); }, 250);
  });
  document.getElementById('bfSort')?.addEventListener('change', (e) => {
    state.billing.sort = e.target.value;
    renderBillingManageResults();
  });
  document.getElementById('bfClear')?.addEventListener('click', () => {
    state.billing.filters = { status:[], complexIds:[], typeSet:[], years:[], months:[], search:'' };
    renderBillingManageResults();
  });
  document.querySelectorAll('[data-record-payment]').forEach(btn => btn.addEventListener('click', () => openRecordPaymentModal(Number(btn.dataset.recordPayment))));
  document.querySelectorAll('[data-edit-bill]').forEach(btn => btn.addEventListener('click', () => openEditBillModal(Number(btn.dataset.editBill))));
  document.querySelectorAll('[data-delete-bill]').forEach(btn => btn.addEventListener('click', () => {
    const bill = state.cache.bills.find(x => x.id === Number(btn.dataset.deleteBill));
    if (bill) confirmDeleteBill(bill);
  }));
}

function billingFilteredListHtml(bills){
  if (bills.length === 0){
    return emptyStateHtml('No bills match your filters', 'Try adjusting or clearing filters.', emptyIcon());
  }
  const sort = state.billing.sort;
  const sorted = [...bills].sort((a,b) => {
    if (sort==='newest') return new Date(b.bill_date||b.created_at) - new Date(a.bill_date||a.created_at);
    if (sort==='oldest') return new Date(a.bill_date||a.created_at) - new Date(b.bill_date||b.created_at);
    if (sort==='amount-high') return Number(b.amount) - Number(a.amount);
    if (sort==='amount-low') return Number(a.amount) - Number(b.amount);
    if (sort==='pending-first') return Number(b.pending_amount) - Number(a.pending_amount);
    if (sort==='tenant') return (a.user?.name||'').localeCompare(b.user?.name||'');
    return 0;
  });
  return `
  <div class="table-wrap">
    <table>
      <thead><tr><th>Bill</th><th>Tenant</th><th>Shop</th><th>Complex</th><th>Type</th><th class="num">Amount</th><th>Late fee</th><th class="num">Pending</th><th>Status</th><th>Bill Date</th><th>Due</th><th></th></tr></thead>
      <tbody>
        ${sorted.map(b => `
        <tr>
          <td class="mono">#${b.id}</td>
          <td>${b.user ? tenantLinkHtml(b.user_id, b.user.name) : `#${b.user_id}`}</td>
          <td class="mono">${escapeHtml(b.shop?.shop_number || `#${b.shop_id}`)}</td>
          <td>${escapeHtml(b.complexName)}</td>
          <td>${escapeHtml(b.bill_type)}</td>
          <td class="num">${currency(b.amount)}</td>
          <td>${isLateFeeBill(b) ? lateFeeChipHtml(b) : '<span class="muted">—</span>'}</td>
          <td class="num">${currency(b.pending_amount)}</td>
          <td>${stampHtml(b.status)}${b.isOverdue ? ' <span class="stamp pending">overdue</span>' : ''}</td>
          <td>${dateFmt(b.bill_date)}</td>
          <td>${dateFmt(b.due_date)}</td>
          <td><div class="row-actions">
            ${b.status !== 'paid' ? `<button class="btn-icon" data-record-payment="${b.id}" aria-label="Record payment">${rupeeIcon()}</button>` : ''}
            <button class="btn-icon" data-edit-bill="${b.id}" aria-label="Edit bill">${editIcon()}</button>
            <button class="btn-icon" data-delete-bill="${b.id}" aria-label="Delete bill">${trashIcon()}</button>
          </div></td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

function billingPaymentsListHtml(payments){
  if (payments.length === 0){
    return emptyStateHtml('No payments match your filters', 'Try adjusting or clearing filters.', emptyIcon());
  }
  const sort = state.billing.paymentSort;
  const sorted = [...payments].sort((a,b) => {
    if (sort==='newest') return new Date(b.payment_date) - new Date(a.payment_date);
    if (sort==='oldest') return new Date(a.payment_date) - new Date(b.payment_date);
    if (sort==='amount-high') return Number(b.amount) - Number(a.amount);
    if (sort==='amount-low') return Number(a.amount) - Number(b.amount);
    if (sort==='tenant') return (a.user?.name||'').localeCompare(b.user?.name||'');
    return 0;
  });
  return `
  <div class="table-wrap">
    <table>
      <thead><tr><th>Date</th><th>Tenant</th><th>Shop</th><th>Complex</th><th>Bill</th><th class="num">Amount</th><th>Method</th><th>Remarks</th><th></th></tr></thead>
      <tbody>
        ${sorted.map(p => `
        <tr>
          <td>${dateFmt(p.payment_date)}</td>
          <td>${p.user ? tenantLinkHtml(p.bill?.user_id ?? p.user_id, p.user.name) : (p.bill ? `#${p.bill.user_id}` : '—')}</td>
          <td class="mono">${escapeHtml(p.shop?.shop_number || '—')}</td>
          <td>${escapeHtml(p.complexName)}</td>
          <td class="mono">#${p.bill_id}${p.bill ? ' · '+escapeHtml(p.bill.bill_type) : ''}</td>
          <td class="num">${currency(p.amount)}</td>
          <td>${escapeHtml(p.payment_method)}</td>
          <td>${escapeHtml(p.remarks || '—')}</td>
          <td><div class="row-actions">
            <button class="btn-icon" data-edit-payment="${p.id}" aria-label="Edit payment">${editIcon()}</button>
            <button class="btn-icon" data-delete-payment="${p.id}" aria-label="Delete payment">${trashIcon()}</button>
          </div></td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

/* ================================================================
   3. VIEW — browse tenant-wise / property-wise / dues overview
   ================================================================ */
function renderBillingResults(){
  const container = document.getElementById('billingResults');
  if (!container) return;
  const { list: allBills } = billingEnrichedData();
  container.innerHTML = billingBrowseHtml(allBills);
  attachBillingResultHandlers();
}

function billingModeSwitcherHtml(){
  const nav = state.billing.nav;
  const mode = nav.mode || 'tenant';
  return `
  <div class="billing-mode-switch">
    <button type="button" class="billing-mode-btn ${mode==='tenant'?'active':''}" data-billing-mode="tenant">Tenant wise</button>
    <button type="button" class="billing-mode-btn ${mode==='property'?'active':''}" data-billing-mode="property">Property wise</button>
    <button type="button" class="billing-mode-btn ${mode==='dues'?'active':''}" data-billing-mode="dues">Dues overview</button>
  </div>`;
}

function billingViewSearchHtml(){
  const nav = state.billing.nav;
  const mode = nav.mode || 'tenant';
  if (mode === 'dues') return '';
  const atPicker = (mode === 'tenant' && !nav.userId) || (mode === 'property' && !nav.complexId) || (mode === 'property' && !!nav.complexId && !nav.userId);
  if (!atPicker) return '';
  const placeholder = (mode === 'property' && !nav.complexId) ? 'Search property…' : 'Search tenant by name or mobile…';
  return `<div style="margin-bottom:14px; max-width:340px;"><input type="text" id="bvSearch" class="search-input" placeholder="${escapeHtml(placeholder)}" style="width:100%;"></div>`;
}

function billingBreadcrumbHtml(){
  const nav = state.billing.nav;
  const complexes = state.cache.complexes;
  const users = state.cache.users;
  const mode = nav.mode || 'tenant';
  const parts = [];

  if (mode === 'tenant'){
    parts.push(`<button type="button" class="billing-crumb-seg" data-crumb="root">All tenants</button>`);
    if (nav.userId){
      const u = users.find(x=>x.id===Number(nav.userId));
      parts.push(`<button type="button" class="billing-crumb-seg" data-crumb="property">${escapeHtml(u?.name || ('#'+nav.userId))}</button>`);
    }
    if (nav.complexId){
      const cName = nav.complexId === 'null' ? 'Unassigned' : (complexes.find(c=>String(c.id)===String(nav.complexId))?.name || nav.complexId);
      parts.push(`<button type="button" class="billing-crumb-seg" data-crumb="year">${escapeHtml(cName)}</button>`);
    }
  } else {
    parts.push(`<button type="button" class="billing-crumb-seg" data-crumb="root">All properties</button>`);
    if (nav.complexId){
      const cName = nav.complexId === 'null' ? 'Unassigned' : (complexes.find(c=>String(c.id)===String(nav.complexId))?.name || nav.complexId);
      parts.push(`<button type="button" class="billing-crumb-seg" data-crumb="property">${escapeHtml(cName)}</button>`);
    }
    if (nav.userId){
      const u = users.find(x=>x.id===Number(nav.userId));
      parts.push(`<button type="button" class="billing-crumb-seg" data-crumb="year">${escapeHtml(u?.name || ('#'+nav.userId))}</button>`);
    }
  }
  if (nav.year){
    parts.push(`<button type="button" class="billing-crumb-seg" data-crumb="month">${nav.year}</button>`);
  }
  if (nav.month){
    parts.push(`<span class="billing-crumb-seg current">${MONTH_NAMES[nav.month-1]}</span>`);
  }
  return `<div class="billing-breadcrumb">${parts.join('<span class="billing-crumb-sep">›</span>')}</div>`;
}

function billingComplexPickHtml(allBills){
  const complexes = state.cache.complexes;
  const shops = state.cache.shops;
  const groups = complexes.map(c => {
    const cBills = allBills.filter(b => b.complexId === c.id);
    const tenantIds = new Set(shops.filter(s=>s.complex_id===c.id && s.assigned_to).map(s=>s.assigned_to.id));
    const pending = cBills.filter(b=>b.status!=='paid').reduce((s,b)=>s+Number(b.pending_amount||0),0);
    const collected = cBills.reduce((s,b)=>s+Number(b.paid_amount||0),0);
    return { id:c.id, name:c.name, tenantCount:tenantIds.size, pending, collected, billCount:cBills.length };
  });
  const unassignedBills = allBills.filter(b => b.complexId == null);
  if (unassignedBills.length){
    const tenantIds = new Set(unassignedBills.map(b=>b.user_id));
    groups.push({
      id:'null', name:'Unassigned', tenantCount:tenantIds.size,
      pending: unassignedBills.filter(b=>b.status!=='paid').reduce((s,b)=>s+Number(b.pending_amount||0),0),
      collected: unassignedBills.reduce((s,b)=>s+Number(b.paid_amount||0),0),
      billCount: unassignedBills.length,
    });
  }
  if (groups.length === 0){
    return emptyStateHtml('No complexes yet', 'Add a complex and assign shops to start billing.', emptyIcon());
  }
  return `
  <div class="billing-card-grid">
    ${groups.map(g => `
    <button type="button" class="card complex-stat-card billing-pick-card" data-drill-complex="${g.id}" data-search="${escapeHtml(g.name)}">
      <div class="c-name">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M5 21V7l7-4 7 4v14"/></svg>
        ${escapeHtml(g.name)}
      </div>
      <div class="complex-stat-grid">
        <div class="complex-stat-item"><div class="csi-val">${g.tenantCount}</div><div class="csi-label">Tenants</div></div>
        <div class="complex-stat-item"><div class="csi-val">${g.billCount}</div><div class="csi-label">Bills</div></div>
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:10px; padding-top:10px; border-top:1px dashed var(--line);">
        <div><div style="font-size:10.5px; color:var(--muted); text-transform:uppercase; letter-spacing:.04em; font-weight:600;">Collected</div><div style="font-family:var(--font-mono); font-weight:700; color:var(--green-deep); font-size:14px;">${currency(g.collected)}</div></div>
        <div><div style="font-size:10.5px; color:var(--muted); text-transform:uppercase; letter-spacing:.04em; font-weight:600;">Pending</div><div style="font-family:var(--font-mono); font-weight:700; color:${g.pending>0?'var(--rust)':'var(--success)'}; font-size:14px;">${currency(g.pending)}</div></div>
      </div>
    </button>`).join('')}
  </div>`;
}

function billingTenantPickForComplexHtml(allBills, complexIdVal){
  const shops = state.cache.shops;
  const users = state.cache.users;
  const complexBills = allBills.filter(b => b.complexId === complexIdVal);
  const tenantIds = new Set(complexBills.map(b=>b.user_id));
  if (complexIdVal != null){
    shops.filter(s=>s.complex_id===complexIdVal && s.assigned_to).forEach(s=>tenantIds.add(s.assigned_to.id));
  }
  const rows = [...tenantIds].map(uid => {
    const u = users.find(x=>x.id===uid);
    const uBills = complexBills.filter(b=>b.user_id===uid);
    const pending = uBills.filter(b=>b.status==='pending').reduce((s,b)=>s+Number(b.pending_amount||0),0);
    const partial = uBills.filter(b=>b.status==='partial').reduce((s,b)=>s+Number(b.pending_amount||0),0);
    const paid = uBills.reduce((s,b)=>s+Number(b.paid_amount||0),0);
    return { id:uid, name: u?.name || `#${uid}`, mobile: u?.mobile || '', billCount: uBills.length, pending, partial, paid };
  }).sort((a,b)=>a.name.localeCompare(b.name));

  if (rows.length === 0){
    return emptyStateHtml('No tenants here yet', 'Assign shops in this complex to a tenant to start billing them.', emptyIcon());
  }
  return `
  <div class="table-wrap">
    <table>
      <thead><tr><th>Tenant</th><th class="num">Bills</th><th class="num">Pending</th><th class="num">Partial</th><th class="num">Paid</th><th></th></tr></thead>
      <tbody>
        ${rows.map(r => `
        <tr class="billing-pick-row" data-drill-user="${r.id}" data-search="${escapeHtml(r.name+' '+r.mobile)}">
          <td><strong>${escapeHtml(r.name)}</strong><div class="mono" style="font-size:12px; color:var(--muted);">${escapeHtml(r.mobile)}</div></td>
          <td class="num">${r.billCount}</td>
          <td class="num" style="color:${r.pending>0?'var(--rust)':'inherit'};">${currency(r.pending)}</td>
          <td class="num" style="color:${r.partial>0?'var(--partial)':'inherit'};">${currency(r.partial)}</td>
          <td class="num" style="color:var(--green-deep);">${currency(r.paid)}</td>
          <td class="billing-open-link">Open →</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

function billingTenantPickHtml(allBills){
  const shops = state.cache.shops;
  const users = state.cache.users;
  const tenantIds = new Set(allBills.map(b=>b.user_id));
  shops.filter(s=>s.assigned_to).forEach(s=>tenantIds.add(s.assigned_to.id));
  const rows = [...tenantIds].map(uid => {
    const u = users.find(x=>x.id===uid);
    const uBills = allBills.filter(b=>b.user_id===uid);
    const billed = uBills.reduce((s,b)=>s+Number(b.amount||0),0);
    const received = uBills.reduce((s,b)=>s+Number(b.paid_amount||0),0);
    const pending = billed - received;
    const propertyIds = new Set(uBills.map(b=>b.complexId));
    shops.filter(s=>s.assigned_to && s.assigned_to.id===uid).forEach(s=>propertyIds.add(s.complex_id ?? null));
    return { id:uid, name: u?.name || `#${uid}`, mobile: u?.mobile || '', billCount: uBills.length, propertyCount: propertyIds.size, billed, received, pending };
  }).sort((a,b)=>a.name.localeCompare(b.name));

  if (rows.length === 0){
    return emptyStateHtml('No tenants yet', 'Assign shops to a tenant to start billing them.', emptyIcon());
  }
  return `
  <div class="table-wrap">
    <table>
      <thead><tr><th>Tenant</th><th class="num">Properties</th><th class="num">Bills</th><th class="num">Billed</th><th class="num">Received</th><th class="num">Pending</th><th></th></tr></thead>
      <tbody>
        ${rows.map(r => `
        <tr class="billing-pick-row" data-drill-user="${r.id}" data-search="${escapeHtml(r.name+' '+r.mobile)}">
          <td><strong>${escapeHtml(r.name)}</strong><div class="mono" style="font-size:12px; color:var(--muted);">${escapeHtml(r.mobile)}</div></td>
          <td class="num">${r.propertyCount}</td>
          <td class="num">${r.billCount}</td>
          <td class="num">${currency(r.billed)}</td>
          <td class="num" style="color:var(--green-deep);">${currency(r.received)}</td>
          <td class="num" style="color:${r.pending>0?'var(--rust)':'inherit'};">${currency(r.pending)}</td>
          <td class="billing-open-link">Open →</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

function billingPropertyPickHtml(allBills, userIdVal){
  const complexes = state.cache.complexes;
  const shops = state.cache.shops;
  const userBills = allBills.filter(b=>b.user_id===userIdVal);
  const propertyIds = new Set(userBills.map(b=>b.complexId));
  shops.filter(s=>s.assigned_to && s.assigned_to.id===userIdVal).forEach(s=>propertyIds.add(s.complex_id ?? null));

  const groups = [...propertyIds].map(cid => {
    const cBills = userBills.filter(b=>b.complexId===cid);
    const billed = cBills.reduce((s,b)=>s+Number(b.amount||0),0);
    const received = cBills.reduce((s,b)=>s+Number(b.paid_amount||0),0);
    const pending = billed - received;
    const name = cid==null ? 'Unassigned' : (complexes.find(c=>c.id===cid)?.name || `#${cid}`);
    return { id: cid==null?'null':cid, name, billed, received, pending, billCount: cBills.length };
  }).sort((a,b)=>a.name.localeCompare(b.name));

  if (groups.length === 0){
    return emptyStateHtml('No properties for this tenant yet', 'Assign a shop to this tenant to start billing them.', emptyIcon());
  }
  return `
  <div class="billing-card-grid">
    ${groups.map(g => `
    <button type="button" class="card complex-stat-card billing-pick-card" data-drill-property="${g.id}">
      <div class="c-name">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M5 21V7l7-4 7 4v14"/></svg>
        ${escapeHtml(g.name)}
      </div>
      <div style="font-size:12px; color:var(--muted); margin-bottom:8px;">${g.billCount} bill${g.billCount!==1?'s':''}</div>
      <div class="billing-stat-line"><span>Billed</span><strong>${currency(g.billed)}</strong></div>
      <div class="billing-stat-line"><span>Received</span><strong style="color:var(--green-deep);">${currency(g.received)}</strong></div>
      <div class="billing-stat-line"><span>Pending</span><strong style="color:${g.pending>0?'var(--rust)':'var(--success)'};">${currency(g.pending)}</strong></div>
    </button>`).join('')}
  </div>`;
}

function billingBrowseHtml(allBills){
  const nav = state.billing.nav;
  const users = state.cache.users;
  const mode = nav.mode || 'tenant';
  const modeSwitcher = billingModeSwitcherHtml();
  const searchBox = billingViewSearchHtml();

  if (mode === 'dues'){
    return modeSwitcher + billingDuesOverviewHtml(allBills);
  }

  const crumb = billingBreadcrumbHtml();

  if (mode === 'tenant'){
    if (!nav.userId){
      return modeSwitcher + searchBox + crumb + billingTenantPickHtml(allBills);
    }
    if (!nav.complexId){
      const tenant = users.find(u=>u.id===Number(nav.userId));
      const statementBtn = `<div class="billing-inline-actions"><button type="button" class="btn btn-ghost btn-sm" data-full-statement="${nav.userId}" data-full-statement-name="${escapeHtml(tenant?.name||'Tenant')}">View full tenant statement</button></div>`;
      return modeSwitcher + crumb + statementBtn + billingPropertyPickHtml(allBills, Number(nav.userId));
    }
  } else {
    if (!nav.complexId){
      return modeSwitcher + searchBox + crumb + billingComplexPickHtml(allBills);
    }
    if (!nav.userId){
      const complexIdVal = nav.complexId === 'null' ? null : Number(nav.complexId);
      return modeSwitcher + searchBox + crumb + billingTenantPickForComplexHtml(allBills, complexIdVal);
    }
  }

  const complexIdVal = nav.complexId === 'null' ? null : Number(nav.complexId);
  const userIdVal = Number(nav.userId);
  const tenantBills = allBills.filter(b => b.complexId === complexIdVal && b.user_id === userIdVal);
  const tenant = users.find(u=>u.id===userIdVal);

  if (!nav.year){
    const yrs = [...new Set(tenantBills.map(b=>b.year).filter(Boolean))].sort((a,b)=>b-a);
    if (yrs.length === 0){
      return modeSwitcher + crumb + `
      <div class="billing-inline-actions">
        <button class="btn btn-primary btn-sm" data-add-bill-for="${userIdVal}">+ Add bill for ${escapeHtml(tenant?.name||'tenant')}</button>
      </div>
      ` + emptyStateHtml('No bills yet for this tenant here', 'Create the first bill to get started.', emptyIcon());
    }
    return modeSwitcher + crumb + `
    <div class="billing-card-grid billing-year-grid">
      ${yrs.map(y => {
        const yBills = tenantBills.filter(b=>b.year===y);
        const billed = yBills.reduce((s,b)=>s+Number(b.amount||0),0);
        const received = yBills.reduce((s,b)=>s+Number(b.paid_amount||0),0);
        const remaining = billed - received;
        return `
        <button type="button" class="card billing-pick-card billing-year-card" data-drill-year="${y}">
          <div class="billing-year-num">${y}</div>
          <div style="font-size:12px; color:var(--muted); margin-bottom:8px;">${yBills.length} bill${yBills.length!==1?'s':''}</div>
          <div class="billing-stat-line"><span>Billed</span><strong>${currency(billed)}</strong></div>
          <div class="billing-stat-line"><span>Received</span><strong style="color:var(--green-deep);">${currency(received)}</strong></div>
          <div class="billing-stat-line"><span>Remaining</span><strong style="color:${remaining>0?'var(--rust)':'var(--success)'};">${currency(remaining)}</strong></div>
        </button>`;
      }).join('')}
    </div>`;
  }

  const yearVal = Number(nav.year);
  const yearBills = tenantBills.filter(b => b.year === yearVal);

  const monthCards = MONTH_NAMES.map((name, i) => {
    const m = i+1;
    const mBills = yearBills.filter(b=>b.month===m);
    const billed = mBills.reduce((s,b)=>s+Number(b.amount||0),0);
    const received = mBills.reduce((s,b)=>s+Number(b.paid_amount||0),0);
    const remaining = billed - received;
    const selected = nav.month === m;
    return `
    <button type="button" class="card billing-pick-card billing-month-card calendar-tile ${selected?'selected':''} ${mBills.length===0?'empty':''}" data-drill-month="${m}">
      <div class="billing-month-name">${calendarIcon()} ${name}</div>
      ${mBills.length ? `
      <div style="font-size:11px; color:var(--muted); margin-bottom:4px;">${mBills.length} bill${mBills.length!==1?'s':''}</div>
      <div class="billing-stat-line small"><span>Billed</span><strong>${currency(billed)}</strong></div>
      <div class="billing-stat-line small"><span>Recv</span><strong style="color:var(--green-deep);">${currency(received)}</strong></div>
      <div class="billing-stat-line small"><span>Rem</span><strong style="color:${remaining>0?'var(--rust)':'var(--success)'};">${currency(remaining)}</strong></div>
      ` : `<div style="font-size:12px; color:var(--muted);">No activity</div>`}
    </button>`;
  }).join('');

  let detail = '';
  if (nav.month){
    const mBills = yearBills.filter(b=>b.month===nav.month).sort((a,b)=>new Date(b.bill_date)-new Date(a.bill_date));
    const mPayments = mBills.flatMap(b => b.payments.map(p => ({ ...p, bill: b })));
    const billed = mBills.reduce((s,b)=>s+Number(b.amount||0),0);
    const received = mBills.reduce((s,b)=>s+Number(b.paid_amount||0),0);
    const remaining = billed - received;
    const tab = nav.tab === 'payments' ? 'payments' : 'bills';

    detail = `
    <div class="billing-month-detail calendar-detail">
      <div class="billing-inline-actions">
        <button class="btn btn-primary btn-sm" data-add-bill-for="${userIdVal}">+ Add bill</button>
        <button class="btn btn-ghost btn-sm" data-record-payment-for="${userIdVal}">Record payment</button>
      </div>
      <div class="billing-month-summary">
        <div class="billing-stat-line"><span>Billed</span><strong>${currency(billed)}</strong></div>
        <div class="billing-stat-line"><span>Received</span><strong style="color:var(--green-deep);">${currency(received)}</strong></div>
        <div class="billing-stat-line"><span>Remaining</span><strong style="color:${remaining>0?'var(--rust)':'var(--success)'};">${currency(remaining)}</strong></div>
      </div>
      <div class="billing-tab-bar">
        <button type="button" class="billing-tab-btn ${tab==='bills'?'active':''}" data-billing-tab="bills">Bill <span class="billing-tab-count">${mBills.length}</span></button>
        <button type="button" class="billing-tab-btn ${tab==='payments'?'active':''}" data-billing-tab="payments">Payment <span class="billing-tab-count">${mPayments.length}</span></button>
      </div>
      ${tab === 'bills' ? billingBillsByTypeHtml(mBills) : billingPaymentsByDateHtml(mPayments)}
    </div>`;
  }

  const ledgerBtn = (mode === 'tenant' && tenant) ? `<button class="btn btn-ghost btn-sm" data-download-ledger="${yearVal}" data-ledger-user="${userIdVal}" data-ledger-name="${escapeHtml(tenant.name)}" data-ledger-mobile="${escapeHtml(tenant.mobile||'')}">Download ledger PDF</button>` : '';
  const yearActions = ledgerBtn ? `<div style="margin-bottom:10px; display:flex; justify-content:flex-end;">${ledgerBtn}</div>` : '';

  return modeSwitcher + crumb + yearActions + `<div class="billing-card-grid billing-month-grid calendar-grid">${monthCards}</div>` + detail;
}

function billingBillsByTypeHtml(mBills){
  if (mBills.length === 0) return emptyStateHtml('No bills this month', 'Use "+ Add bill" to create one.', emptyIcon());
  const types = [...new Set(mBills.map(b=>b.bill_type))].sort();
  return types.map(type => {
    const bills = mBills.filter(b=>b.bill_type===type);
    const billed = bills.reduce((s,b)=>s+Number(b.amount||0),0);
    const received = bills.reduce((s,b)=>s+Number(b.paid_amount||0),0);
    const remaining = billed - received;
    return `
    <div class="collapsible-section billing-group-section">
      <div class="collapsible-header" onclick="toggleCollapse(this)">
        <h3>${escapeHtml(type)} <span class="billing-group-count">(${bills.length})</span></h3>
        <div class="billing-group-header-right">
          <span class="billing-group-totals">
            <span>Billed <strong class="mono">${currency(billed)}</strong></span>
            <span>Recv <strong class="mono" style="color:var(--green-deep);">${currency(received)}</strong></span>
            <span>Rem <strong class="mono" style="color:${remaining>0?'var(--rust)':'var(--success)'};">${currency(remaining)}</strong></span>
          </span>
          <svg class="collapsible-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
      </div>
      <div class="collapsible-body">
      ${bills.map(b => `
      <div class="billing-bill-card">
        <div class="billing-bill-head">
          <div>
            <strong>${escapeHtml(b.bill_type)}</strong> <span class="mono" style="color:var(--muted);">#${b.id}</span>
            ${b.description ? `<div style="font-size:12px; color:var(--muted); margin-top:2px;">${escapeHtml(b.description)}</div>` : ''}
          </div>
          <div style="text-align:right;">
            ${stampHtml(b.status)}${b.isOverdue ? ' <span class="stamp pending">overdue</span>' : ''}
            <div style="font-family:var(--font-mono); font-weight:700; margin-top:4px;">${currency(b.amount)}</div>
          </div>
        </div>
        <div class="billing-bill-meta">
          <span>Bill date: ${dateFmt(b.bill_date)}</span>
          <span>Due: ${dateFmt(b.due_date)}</span>
          ${isLateFeeBill(b) ? `<span>${lateFeeChipHtml(b)}</span>` : ''}
          <span>Paid: ${currency(b.paid_amount)}</span>
          <span>Pending: ${currency(b.pending_amount)}</span>
        </div>
        <div class="row-actions" style="margin-top:8px;">
          ${b.status !== 'paid' ? `<button class="btn btn-ghost btn-sm" data-record-payment="${b.id}">Record payment</button>` : ''}
          <button class="btn-icon" data-edit-bill="${b.id}" aria-label="Edit bill">${editIcon()}</button>
          <button class="btn-icon" data-delete-bill="${b.id}" aria-label="Delete bill">${trashIcon()}</button>
        </div>
      </div>`).join('')}
      </div>
    </div>`;
  }).join('');
}

function billingPaymentsByDateHtml(mPayments){
  if (mPayments.length === 0) return emptyStateHtml('No payments recorded for this month\'s bills', 'Use "Record payment" to add one.', emptyIcon());
  const dateKeys = [...new Set(mPayments.map(p=>p.payment_date))].sort((a,b)=>new Date(b)-new Date(a));
  return dateKeys.map(dateKey => {
    const pays = mPayments.filter(p=>p.payment_date===dateKey).sort((a,b)=>b.id-a.id);
    const total = pays.reduce((s,p)=>s+Number(p.amount||0),0);
    return `
    <div class="collapsible-section billing-group-section">
      <div class="collapsible-header" onclick="toggleCollapse(this)">
        <h3>${calendarIcon()} ${dateFmt(dateKey)} <span class="billing-group-count">(${pays.length})</span></h3>
        <div class="billing-group-header-right">
          <span class="billing-group-totals"><strong class="mono" style="color:var(--green-deep);">${currency(total)}</strong></span>
          <svg class="collapsible-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
      </div>
      <div class="collapsible-body">
      <div class="billing-payments-list">
        ${pays.map(p => `
        <div class="billing-payment-row">
          <span>${escapeHtml(p.payment_method)} · <span class="mono" style="color:var(--muted);">Bill #${p.bill.id} (${escapeHtml(p.bill.bill_type)})</span></span>
          <span class="mono">${currency(p.amount)}</span>
          <span class="row-actions">
            <button class="btn-icon" data-edit-payment="${p.id}" aria-label="Edit payment">${editIcon()}</button>
            <button class="btn-icon" data-delete-payment="${p.id}" aria-label="Delete payment">${trashIcon()}</button>
          </span>
        </div>`).join('')}
      </div>
      </div>
    </div>`;
  }).join('');
}

/* ----------------------------------------------------------------
   DUES OVERVIEW — a third View mode: a portfolio-wide (all tenants
   combined) arrears ledger, simplified to lead with ONE number
   (Total outstanding), then a clear before/this-period breakdown,
   then a billed-vs-received progress bar for the period.
   ---------------------------------------------------------------- */
// Tenants matching the Tenant Status filter ('all' | 'active' | 'inactive'),
// same Active = currently has an assigned shop definition used in Deposits.
function billingDuesTenantOptions(status){
  const shops = state.cache.shops || [];
  const users = (state.cache.users || []).filter(u => u.role === 'tenant');
  const withStatus = users.map(u => ({
    id: u.id, name: u.name, mobile: u.mobile || '',
    isActive: shops.filter(s => s.assigned_to?.id === u.id).length > 0,
  }));
  const filtered = status === 'active' ? withStatus.filter(u=>u.isActive)
    : status === 'inactive' ? withStatus.filter(u=>!u.isActive)
    : withStatus;
  return filtered.sort((a,b)=>a.name.localeCompare(b.name));
}

function billingDuesFilterBarHtml(){
  const nav = state.billing.nav;
  const status = nav.duesStatus || 'all';
  const tenants = billingDuesTenantOptions(status);
  return `
  <div class="billing-dues-filter-bar">
    <div class="billing-dues-filter-group">
      <span class="billing-dues-filter-label">Tenant status</span>
      <div class="filter-chips">
        <button type="button" class="chip ${status==='all'?'active':''}" data-dues-status="all">All</button>
        <button type="button" class="chip ${status==='active'?'active':''}" data-dues-status="active">Active</button>
        <button type="button" class="chip ${status==='inactive'?'active':''}" data-dues-status="inactive">Inactive</button>
      </div>
    </div>
    <div class="billing-dues-filter-group">
      <span class="billing-dues-filter-label">Select tenant</span>
      <select id="duesTenantSelect" class="sort-select">
        <option value="">All tenants</option>
        ${tenants.map(t => `<option value="${t.id}" ${String(nav.userId)===String(t.id)?'selected':''}>${escapeHtml(t.name)}${t.mobile?' · '+escapeHtml(t.mobile):''}</option>`).join('')}
      </select>
    </div>
  </div>`;
}

function billingDuesBreadcrumbHtml(){
  const nav = state.billing.nav;
  const users = state.cache.users || [];
  const parts = [`<button type="button" class="billing-crumb-seg" data-dues-crumb="root">Dues overview</button>`];
  if (nav.userId){
    const u = users.find(x=>String(x.id)===String(nav.userId));
    parts.push(`<button type="button" class="billing-crumb-seg" data-dues-crumb="tenant">${escapeHtml(u?.name || ('#'+nav.userId))}</button>`);
  }
  if (nav.year) parts.push(`<button type="button" class="billing-crumb-seg" data-dues-crumb="year">${escapeHtml(String(nav.year))}</button>`);
  if (nav.month) parts.push(`<span class="billing-crumb-seg current">${MONTH_NAMES[Number(nav.month)-1]}</span>`);
  return `<div class="billing-breadcrumb">${parts.join('<span class="billing-crumb-sep">›</span>')}</div>`;
}

function billingDuesYearStats(allBills, allPayments, year){
  const prevPending = allBills.filter(b => b.year != null && b.year < year && b.status !== 'paid')
    .reduce((s,b)=>s+Number(b.pending_amount||0),0);
  const thisPending = allBills.filter(b => b.year === year && b.status !== 'paid')
    .reduce((s,b)=>s+Number(b.pending_amount||0),0);
  const totalBilled = allBills.filter(b => b.year === year)
    .reduce((s,b)=>s+Number(b.amount||0),0);
  const received = allPayments.filter(p => p.payment_date && new Date(p.payment_date).getFullYear() === year)
    .reduce((s,p)=>s+Number(p.amount||0),0);
  return { prevPending, thisPending, totalBilled, received, totalPending: prevPending + thisPending };
}

function billingDuesMonthStats(allBills, allPayments, year, month){
  const isBefore = b => b.year < year || (b.year === year && b.month < month);
  const prevPending = allBills.filter(b => b.year != null && isBefore(b) && b.status !== 'paid')
    .reduce((s,b)=>s+Number(b.pending_amount||0),0);
  const thisPending = allBills.filter(b => b.year === year && b.month === month && b.status !== 'paid')
    .reduce((s,b)=>s+Number(b.pending_amount||0),0);
  const totalBilled = allBills.filter(b => b.year === year && b.month === month)
    .reduce((s,b)=>s+Number(b.amount||0),0);
  const received = allPayments.filter(p => {
    if (!p.payment_date) return false;
    const d = new Date(p.payment_date);
    return d.getFullYear() === year && d.getMonth()+1 === month;
  }).reduce((s,p)=>s+Number(p.amount||0),0);
  return { prevPending, thisPending, totalBilled, received, totalPending: prevPending + thisPending };
}

function billingDuesSummaryCardHtml(s, opts){
  const { size='normal' } = opts || {};
  const collectPct = s.totalBilled > 0 ? Math.min(100, Math.round((s.received / s.totalBilled) * 100)) : (s.received > 0 ? 100 : 0);
  if (size === 'small'){
    return `
      <div class="billing-dues-outstanding small">${currency(s.totalPending)}</div>
      <div class="billing-dues-bar-wrap"><div class="billing-dues-bar" style="width:${collectPct}%;"></div></div>
      <div class="billing-stat-line small" style="margin-top:4px;"><span>Billed</span><strong>${currency(s.totalBilled)}</strong></div>
      <div class="billing-stat-line small"><span>Received</span><strong style="color:var(--green-deep);">${currency(s.received)}</strong></div>
    `;
  }
  return `
    <div class="billing-dues-outstanding-row">
      <div>
        <div class="billing-dues-label">Total outstanding</div>
        <div class="billing-dues-outstanding">${currency(s.totalPending)}</div>
      </div>
      <div class="billing-dues-breakdown">
        <div class="billing-stat-line"><span>Carried from before</span><strong style="color:${s.prevPending>0?'var(--rust)':'inherit'};">${currency(s.prevPending)}</strong></div>
        <div class="billing-stat-line"><span>Pending from this period</span><strong style="color:${s.thisPending>0?'var(--rust)':'inherit'};">${currency(s.thisPending)}</strong></div>
      </div>
    </div>
    <div class="billing-dues-collection">
      <div style="display:flex; justify-content:space-between; font-size:12px; color:var(--muted); margin-bottom:4px;">
        <span>Billed this period: ${currency(s.totalBilled)}</span><span>${collectPct}% collected</span>
      </div>
      <div class="billing-dues-bar-wrap"><div class="billing-dues-bar" style="width:${collectPct}%;"></div></div>
      <div style="font-size:12px; color:var(--muted); margin-top:4px;">${currency(s.received)} received this period</div>
    </div>
  `;
}

function billingDuesYearCardsHtml(allBills, allPayments){
  const billYears = allBills.map(b=>b.year).filter(Boolean);
  const paymentYears = allPayments.map(p=>p.payment_date ? new Date(p.payment_date).getFullYear() : null).filter(Boolean);
  const years = [...new Set([...billYears, ...paymentYears])].sort((a,b)=>b-a);
  if (years.length === 0){
    return emptyStateHtml('No billing history yet', 'Bills and payments will appear here once created.', emptyIcon());
  }
  return `
  <div class="billing-card-grid billing-year-grid billing-dues-year-grid">
    ${years.map(y => `
    <button type="button" class="card billing-pick-card billing-year-card billing-dues-card" data-dues-drill-year="${y}">
      <div class="billing-year-num">${y}</div>
      ${billingDuesSummaryCardHtml(billingDuesYearStats(allBills, allPayments, y))}
    </button>`).join('')}
  </div>`;
}

function billingDuesMonthCardsHtml(allBills, allPayments, year){
  const nav = state.billing.nav;
  const cards = MONTH_NAMES.map((name, i) => {
    const m = i+1;
    const selected = Number(nav.month) === m;
    return `
    <button type="button" class="card billing-pick-card billing-month-card billing-dues-card calendar-tile ${selected?'selected':''}" data-dues-drill-month="${m}">
      <div class="billing-month-name">${calendarIcon()} ${name}</div>
      ${billingDuesSummaryCardHtml(billingDuesMonthStats(allBills, allPayments, year, m), { size:'small' })}
    </button>`;
  }).join('');
  return `<div class="billing-card-grid billing-month-grid billing-dues-month-grid calendar-grid">${cards}</div>`;
}

function billingDuesDateGroupsHtml(allBills, allPayments, year, month){
  const mBills = allBills.filter(b => b.year === year && b.month === month);
  const mPayments = allPayments.filter(p => {
    if (!p.payment_date) return false;
    const d = new Date(p.payment_date);
    return d.getFullYear() === year && d.getMonth()+1 === month;
  });
  const dateKeys = new Set();
  mBills.forEach(b => { if (b.bill_date) dateKeys.add(String(b.bill_date).slice(0,10)); });
  mPayments.forEach(p => { if (p.payment_date) dateKeys.add(String(p.payment_date).slice(0,10)); });
  if (dateKeys.size === 0){
    return emptyStateHtml('No activity this month', 'No bills were raised and no payments were recorded yet.', emptyIcon());
  }
  const sortedDates = [...dateKeys].sort((a,b)=> new Date(b) - new Date(a));
  return sortedDates.map(dateKey => {
    const dBills = mBills.filter(b => String(b.bill_date||'').slice(0,10) === dateKey);
    const dPayments = mPayments.filter(p => String(p.payment_date||'').slice(0,10) === dateKey);
    const billedAmt = dBills.reduce((s,b)=>s+Number(b.amount||0),0);
    const receivedAmt = dPayments.reduce((s,p)=>s+Number(p.amount||0),0);
    const count = dBills.length + dPayments.length;
    return `
    <div class="collapsible-section billing-group-section">
      <div class="collapsible-header" onclick="toggleCollapse(this)">
        <h3>${calendarIcon()} ${dateFmt(dateKey)} <span class="billing-group-count">(${count} ${count===1?'entry':'entries'})</span></h3>
        <div class="billing-group-header-right">
          <span class="billing-group-totals">
            ${dBills.length ? `<span>Billed <strong class="mono">${currency(billedAmt)}</strong></span>` : ''}
            ${dPayments.length ? `<span>Received <strong class="mono" style="color:var(--green-deep);">${currency(receivedAmt)}</strong></span>` : ''}
          </span>
          <svg class="collapsible-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
      </div>
      <div class="collapsible-body">
        ${dBills.length ? `
        <div style="font-size:12px; font-weight:600; color:var(--muted); margin-bottom:6px; text-transform:uppercase; letter-spacing:.04em;">Bills raised</div>
        ${dBills.map(b => `
        <div class="billing-payment-row" style="padding:6px 0; border-bottom:1px dashed var(--line);">
          <span><strong>${escapeHtml(b.user?.name || ('#'+b.user_id))}</strong> <span class="mono" style="color:var(--muted);">${escapeHtml(b.shop?.shop_number||'')} · ${escapeHtml(b.bill_type)} · #${b.id}</span></span>
          <span style="display:flex; gap:8px; align-items:center;">${stampHtml(b.status)}<span class="mono">${currency(b.amount)}</span></span>
        </div>`).join('')}` : ''}
        ${dPayments.length ? `
        <div style="font-size:12px; font-weight:600; color:var(--muted); margin:${dBills.length?'12px':'0'} 0 6px; text-transform:uppercase; letter-spacing:.04em;">Payments received</div>
        ${dPayments.map(p => `
        <div class="billing-payment-row" style="padding:6px 0; border-bottom:1px dashed var(--line);">
          <span><strong>${escapeHtml(p.bill.user?.name || ('#'+p.bill.user_id))}</strong> <span class="mono" style="color:var(--muted);">${escapeHtml(p.bill.shop?.shop_number||'')} · ${escapeHtml(p.payment_method)} · Bill #${p.bill.id}</span></span>
          <span class="mono" style="color:var(--green-deep); font-weight:700;">${currency(p.amount)}</span>
        </div>`).join('')}` : ''}
      </div>
    </div>`;
  }).join('');
}

function billingDuesOverviewHtml(allBillsIn){
  const nav = state.billing.nav;
  const filterBar = billingDuesFilterBarHtml();
  // Scope to the selected tenant (if any) — every stat/list below this point
  // is computed purely from scopedBills, so year/month math is unchanged
  // whether it's fed the full portfolio or just one tenant.
  const scopedBills = nav.userId ? allBillsIn.filter(b => String(b.user_id) === String(nav.userId)) : allBillsIn;
  const allPayments = scopedBills.flatMap(b => (b.payments||[]).map(p => ({ ...p, bill: b })));
  const crumb = billingDuesBreadcrumbHtml();

  if (!nav.year){
    return filterBar + crumb + billingDuesYearCardsHtml(scopedBills, allPayments);
  }
  const year = Number(nav.year);
  const monthCards = billingDuesMonthCardsHtml(scopedBills, allPayments, year);

  if (!nav.month){
    return filterBar + crumb + monthCards;
  }
  const month = Number(nav.month);
  const stats = billingDuesMonthStats(scopedBills, allPayments, year, month);
  const mBills = scopedBills.filter(b => b.year === year && b.month === month);
  const mPayments = allPayments.filter(p => {
    if (!p.payment_date) return false;
    const d = new Date(p.payment_date);
    return d.getFullYear() === year && d.getMonth()+1 === month;
  });
  const tab = nav.tab === 'payments' ? 'payments' : 'bills';
  const detail = `
  <div class="billing-month-detail">
    <div class="card card-pad billing-dues-detail-summary">${billingDuesSummaryCardHtml(stats)}</div>
    <div class="billing-tab-bar">
      <button type="button" class="billing-tab-btn ${tab==='bills'?'active':''}" data-billing-tab="bills">Bills <span class="billing-tab-count">${mBills.length}</span></button>
      <button type="button" class="billing-tab-btn ${tab==='payments'?'active':''}" data-billing-tab="payments">Payments <span class="billing-tab-count">${mPayments.length}</span></button>
    </div>
    ${tab === 'bills' ? billingDuesBillsByTypeHtml(mBills) : billingDuesPaymentsByDateHtml(mPayments)}
  </div>`;
  return filterBar + crumb + monthCards + detail;
}

// Read-only variants of billingBillsByTypeHtml/billingPaymentsByDateHtml for
// Dues overview — no edit/delete/record-payment actions (this is a reporting
// view, editing happens in Manage), and always show the tenant name since
// Dues overview can span every tenant at once, not just one.
function billingDuesBillsByTypeHtml(mBills){
  if (mBills.length === 0) return emptyStateHtml('No bills this month', 'Switch to Manage to add one.', emptyIcon());
  const types = [...new Set(mBills.map(b=>b.bill_type))].sort();
  return types.map(type => {
    const bills = mBills.filter(b=>b.bill_type===type);
    const billed = bills.reduce((s,b)=>s+Number(b.amount||0),0);
    const received = bills.reduce((s,b)=>s+Number(b.paid_amount||0),0);
    const remaining = billed - received;
    return `
    <div class="collapsible-section billing-group-section">
      <div class="collapsible-header" onclick="toggleCollapse(this)">
        <h3>${escapeHtml(type)} <span class="billing-group-count">(${bills.length})</span></h3>
        <div class="billing-group-header-right">
          <span class="billing-group-totals">
            <span>Billed <strong class="mono">${currency(billed)}</strong></span>
            <span>Recv <strong class="mono" style="color:var(--green-deep);">${currency(received)}</strong></span>
            <span>Rem <strong class="mono" style="color:${remaining>0?'var(--rust)':'var(--success)'};">${currency(remaining)}</strong></span>
          </span>
          <svg class="collapsible-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
      </div>
      <div class="collapsible-body">
      ${bills.map(b => `
      <div class="billing-bill-card">
        <div class="billing-bill-head">
          <div>
            <strong>${escapeHtml(b.user?.name || ('#'+b.user_id))}</strong> <span class="mono" style="color:var(--muted);">${escapeHtml(b.shop?.shop_number||'')} · #${b.id}</span>
            ${b.description ? `<div style="font-size:12px; color:var(--muted); margin-top:2px;">${escapeHtml(b.description)}</div>` : ''}
          </div>
          <div style="text-align:right;">
            ${stampHtml(b.status)}${b.isOverdue ? ' <span class="stamp pending">overdue</span>' : ''}
            <div style="font-family:var(--font-mono); font-weight:700; margin-top:4px;">${currency(b.amount)}</div>
          </div>
        </div>
        <div class="billing-bill-meta">
          <span>Bill date: ${dateFmt(b.bill_date)}</span>
          <span>Due: ${dateFmt(b.due_date)}</span>
          ${isLateFeeBill(b) ? `<span>${lateFeeChipHtml(b)}</span>` : ''}
          <span>Paid: ${currency(b.paid_amount)}</span>
          <span>Pending: ${currency(b.pending_amount)}</span>
        </div>
      </div>`).join('')}
      </div>
    </div>`;
  }).join('');
}

function billingDuesPaymentsByDateHtml(mPayments){
  if (mPayments.length === 0) return emptyStateHtml('No payments recorded for this month', 'Switch to Manage to record one.', emptyIcon());
  const dateKeys = [...new Set(mPayments.map(p=>p.payment_date))].sort((a,b)=>new Date(b)-new Date(a));
  return dateKeys.map(dateKey => {
    const pays = mPayments.filter(p=>p.payment_date===dateKey).sort((a,b)=>b.id-a.id);
    const total = pays.reduce((s,p)=>s+Number(p.amount||0),0);
    return `
    <div class="collapsible-section billing-group-section">
      <div class="collapsible-header" onclick="toggleCollapse(this)">
        <h3>${calendarIcon()} ${dateFmt(dateKey)} <span class="billing-group-count">(${pays.length})</span></h3>
        <div class="billing-group-header-right">
          <span class="billing-group-totals"><strong class="mono" style="color:var(--green-deep);">${currency(total)}</strong></span>
          <svg class="collapsible-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
      </div>
      <div class="collapsible-body">
      <div class="billing-payments-list">
        ${pays.map(p => `
        <div class="billing-payment-row">
          <span><strong>${escapeHtml(p.bill.user?.name || ('#'+p.bill.user_id))}</strong> <span class="mono" style="color:var(--muted);">${escapeHtml(p.payment_method)} · Bill #${p.bill.id} (${escapeHtml(p.bill.bill_type)})</span></span>
          <span class="mono" style="color:var(--green-deep); font-weight:700;">${currency(p.amount)}</span>
        </div>`).join('')}
      </div>
      </div>
    </div>`;
  }).join('');
}

/* ---- Reuse: full tenant statement (modal) + year ledger PDF ---- */
async function openTenantFullStatementModal(userId, userName){
  openModal(`Full statement — ${userName}`, `<div style="text-align:center; padding:24px 0;"><div class="spinner dark" style="margin:0 auto;"></div></div>`, `<button class="btn btn-ghost" id="cancelBtn">Close</button>`);
  document.getElementById('modalEl')?.classList.add('modal-wide');
  document.getElementById('cancelBtn').addEventListener('click', closeModal);
  try {
    const user = state.cache.users.find(u=>u.id===userId);
    const data = await api(`/api/user/${userId}/financial-summary`);
    const body = document.getElementById('modalBody');
    body.innerHTML = renderAdminTenantDashboard(data, user, null);
    attachAdminTenantBillFilters(body);
    body.querySelectorAll('.collapsible-header').forEach(h => h.addEventListener('click', function(){ this.classList.toggle('open'); const b=this.nextElementSibling; if (b) b.classList.toggle('open'); }));
    body.querySelectorAll('.month-row-head').forEach(h => h.addEventListener('click', function(){ const b=this.nextElementSibling; if (b) b.classList.toggle('open'); }));
  } catch(err){
    document.getElementById('modalBody').innerHTML = errorBannerHtml(err.message);
  }
}

async function downloadTenantYearLedgerPdf(userId, userName, userMobile, year){
  try {
    const data = await api(`/api/ledger/monthly?user_id=${userId}&year=${year}`);
    const complexName = [...new Set((data.shops||[]).map(s=>s.complex_name).filter(Boolean))].join(', ');
    const doc = buildMonthlyLedgerDoc(userName, userMobile, year, data.monthly, data.summary, complexName);
    doc.save(`ledger-${userName.replace(/\s+/g,'_')}-${year}.pdf`);
  } catch(err){
    showToast(err.message || 'Could not build ledger PDF', 'error');
  }
}

function attachBillingResultHandlers(){
  const bvSearch = document.getElementById('bvSearch');
  if (bvSearch){
    bvSearch.addEventListener('input', () => {
      const q = bvSearch.value.trim().toLowerCase();
      document.querySelectorAll('#billingResults tr[data-search], #billingResults .billing-pick-card[data-search]').forEach(el => {
        const hay = (el.dataset.search||'').toLowerCase();
        el.style.display = hay.includes(q) ? '' : 'none';
      });
    });
  }

  document.querySelectorAll('[data-billing-mode]').forEach(el => el.addEventListener('click', () => {
    const mode = el.dataset.billingMode;
    if (mode === (state.billing.nav.mode || 'tenant')) return;
    state.billing.nav = { mode, complexId:null, userId:null, year:null, month:null, tab:'bills', duesStatus:'all' };
    renderBillingResults();
  }));
  document.querySelectorAll('[data-drill-complex]').forEach(el => el.addEventListener('click', () => {
    state.billing.nav = { mode: state.billing.nav.mode, complexId: el.dataset.drillComplex, userId:null, year:null, month:null, tab:'bills' };
    renderBillingResults();
  }));
  document.querySelectorAll('[data-drill-property]').forEach(el => el.addEventListener('click', () => {
    state.billing.nav.complexId = el.dataset.drillProperty;
    state.billing.nav.year = null;
    state.billing.nav.month = null;
    state.billing.nav.tab = 'bills';
    renderBillingResults();
  }));
  document.querySelectorAll('[data-drill-user]').forEach(el => el.addEventListener('click', () => {
    state.billing.nav.userId = el.dataset.drillUser;
    state.billing.nav.year = null;
    state.billing.nav.month = null;
    state.billing.nav.tab = 'bills';
    renderBillingResults();
  }));
  document.querySelectorAll('[data-drill-year]').forEach(el => el.addEventListener('click', () => {
    state.billing.nav.year = el.dataset.drillYear;
    state.billing.nav.month = null;
    state.billing.nav.tab = 'bills';
    renderBillingResults();
  }));
  document.querySelectorAll('[data-drill-month]').forEach(el => el.addEventListener('click', () => {
    const m = Number(el.dataset.drillMonth);
    state.billing.nav.month = state.billing.nav.month === m ? null : m;
    state.billing.nav.tab = 'bills';
    renderBillingResults();
  }));
  document.querySelectorAll('[data-billing-tab]').forEach(el => el.addEventListener('click', () => {
    state.billing.nav.tab = el.dataset.billingTab;
    renderBillingResults();
  }));

  // Dues overview mode: year -> month -> date-grouped bills/payments.
  document.querySelectorAll('[data-dues-drill-year]').forEach(el => el.addEventListener('click', () => {
    state.billing.nav.year = el.dataset.duesDrillYear;
    state.billing.nav.month = null;
    renderBillingResults();
  }));
  document.querySelectorAll('[data-dues-drill-month]').forEach(el => el.addEventListener('click', () => {
    const m = Number(el.dataset.duesDrillMonth);
    state.billing.nav.month = state.billing.nav.month === m ? null : m;
    renderBillingResults();
  }));
  document.querySelectorAll('[data-dues-crumb]').forEach(el => el.addEventListener('click', () => {
    const level = el.dataset.duesCrumb;
    if (level === 'root'){ state.billing.nav.userId = null; state.billing.nav.year = null; state.billing.nav.month = null; }
    else if (level === 'tenant'){ state.billing.nav.year = null; state.billing.nav.month = null; }
    else if (level === 'year'){ state.billing.nav.month = null; }
    renderBillingResults();
  }));
  document.querySelectorAll('[data-dues-status]').forEach(el => el.addEventListener('click', () => {
    const status = el.dataset.duesStatus;
    if (status === (state.billing.nav.duesStatus || 'all')) return;
    state.billing.nav.duesStatus = status;
    state.billing.nav.userId = null;
    state.billing.nav.year = null;
    state.billing.nav.month = null;
    renderBillingResults();
  }));
  document.getElementById('duesTenantSelect')?.addEventListener('change', (e) => {
    state.billing.nav.userId = e.target.value || null;
    state.billing.nav.year = null;
    state.billing.nav.month = null;
    renderBillingResults();
  });

  document.querySelectorAll('[data-crumb]').forEach(el => el.addEventListener('click', () => {
    const level = el.dataset.crumb;
    const mode = state.billing.nav.mode || 'tenant';
    if (level === 'root') state.billing.nav = { mode, complexId:null, userId:null, year:null, month:null, tab:'bills' };
    else if (level === 'property'){
      if (mode === 'tenant') state.billing.nav = { ...state.billing.nav, complexId:null, year:null, month:null, tab:'bills' };
      else state.billing.nav = { ...state.billing.nav, userId:null, year:null, month:null, tab:'bills' };
    }
    else if (level === 'year') state.billing.nav = { ...state.billing.nav, year:null, month:null, tab:'bills' };
    else if (level === 'month') state.billing.nav = { ...state.billing.nav, month:null, tab:'bills' };
    renderBillingResults();
  }));

  document.querySelectorAll('[data-add-bill-for]').forEach(el => el.addEventListener('click', () => openBillModal(Number(el.dataset.addBillFor))));
  document.querySelectorAll('[data-record-payment-for]').forEach(el => el.addEventListener('click', () => {
    renderPaymentForm({ preselectedComplexId: state.billing.nav.complexId==='null'?null:Number(state.billing.nav.complexId), preselectedUserId: Number(el.dataset.recordPaymentFor) });
  }));
  document.querySelectorAll('[data-full-statement]').forEach(el => el.addEventListener('click', () => {
    openTenantFullStatementModal(Number(el.dataset.fullStatement), el.dataset.fullStatementName || 'Tenant');
  }));
  document.querySelectorAll('[data-download-ledger]').forEach(el => el.addEventListener('click', () => {
    downloadTenantYearLedgerPdf(Number(el.dataset.ledgerUser), el.dataset.ledgerName||'Tenant', el.dataset.ledgerMobile||'', Number(el.dataset.downloadLedger));
  }));

  document.querySelectorAll('[data-record-payment]').forEach(btn => btn.addEventListener('click', () => openRecordPaymentModal(Number(btn.dataset.recordPayment))));
  document.querySelectorAll('[data-edit-bill]').forEach(btn => btn.addEventListener('click', () => openEditBillModal(Number(btn.dataset.editBill))));
  document.querySelectorAll('[data-delete-bill]').forEach(btn => btn.addEventListener('click', () => {
    const bill = state.cache.bills.find(x => x.id === Number(btn.dataset.deleteBill));
    if (bill) confirmDeleteBill(bill);
  }));
  document.querySelectorAll('[data-edit-payment]').forEach(btn => btn.addEventListener('click', () => openEditPaymentModal(Number(btn.dataset.editPayment))));
  document.querySelectorAll('[data-delete-payment]').forEach(btn => btn.addEventListener('click', () => {
    const pay = state.cache.payments.find(x => x.id === Number(btn.dataset.deletePayment));
    if (pay) confirmDeletePayment(pay);
  }));
}

/* ---- Manual rent-bill generation trigger ---- */
function openGenerateRentBillsModal(){
  const todayStr = new Date().toISOString().slice(0,10);
  openModal('Generate rent bills', `
    <div style="font-size:12.5px; color:var(--muted); margin-bottom:14px;">
      Auto-generates this month's Rent bill — one per assigned shop — for every active tenant with auto-billing enabled whose rent bill date matches the day picked below. This is the same job that runs automatically every night at 02:00 (Asia/Kolkata); it's safe to re-run since already-generated bills for a matching month are skipped, never duplicated.
    </div>
    <div class="field">
      <label for="grbDate">Date to generate for</label>
      <input type="date" id="grbDate" value="${todayStr}">
    </div>
    <div id="grbResult"></div>
  `, `
    <button class="btn btn-ghost" id="cancelBtn">Close</button>
    <button class="btn btn-primary" id="runBtn">Generate</button>
  `);
  document.getElementById('cancelBtn').addEventListener('click', closeModal);
  document.getElementById('runBtn').addEventListener('click', async () => {
    const date = document.getElementById('grbDate').value;
    const btn = document.getElementById('runBtn');
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> Generating…`;
    try {
      const res = await api(`/api/bills/generate-rent${date ? `?date=${date}` : ''}`, { method:'POST' });
      const createdCount = res.created?.length || 0;
      document.getElementById('grbResult').innerHTML = `
        <div class="info-card" style="margin-top:14px;">
          <div class="info-row"><span class="info-label">Users matched</span><span class="info-val">${res.users_matched}</span></div>
          <div class="info-row"><span class="info-label">Bills created</span><span class="info-val good">${createdCount}</span></div>
          <div class="info-row"><span class="info-label">Skipped — already generated</span><span class="info-val">${res.skipped_existing}</span></div>
          <div class="info-row"><span class="info-label">Skipped — zero rent</span><span class="info-val">${res.skipped_zero_rent}</span></div>
          <div class="info-row"><span class="info-label">Skipped — no shops assigned</span><span class="info-val">${res.skipped_no_shops}</span></div>
        </div>
      `;
      state.loaded.bills = false;
      showToast(`${createdCount} rent bill${createdCount !== 1 ? 's' : ''} generated`, 'success');
      if (state.view === 'billing') await renderView('billing');
    } catch(err) {
      showToast(err.message || 'Something went wrong', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = original;
    }
  });
}

/* ---- Edit / delete a single bill ---- */
function openEditBillModal(billId){
  const bill = state.cache.bills.find(b => b.id === billId);
  if (!bill){ showToast('Bill not found', 'error'); return; }
  const dueVal = bill.due_date ? new Date(bill.due_date).toISOString().slice(0,10) : '';
  const billDateVal = bill.bill_date ? new Date(bill.bill_date).toISOString().slice(0,10) : '';

  openModal('Edit bill', `
    <form id="billEditForm">
      <div class="field">
        <label for="ebType">Bill type</label>
        <input id="ebType" value="${escapeHtml(bill.bill_type)}">
        ${fieldErrorHtml('ebTypeErr')}
      </div>
      <div class="field full">
        <label for="ebDesc">Description</label>
        <input id="ebDesc" value="${escapeHtml(bill.description || '')}" placeholder="Optional">
      </div>
      <div class="form-grid">
        <div class="field">
          <label for="ebAmount">Amount (₹)</label>
          <input id="ebAmount" type="number" step="0.01" min="0.01" value="${Number(bill.amount).toFixed(2)}">
          ${fieldErrorHtml('ebAmountErr')}
        </div>
        <div class="field">
          <label for="ebBillDate">Bill date</label>
          <input id="ebBillDate" type="date" value="${billDateVal}">
          <div class="hint">Which month this bill belongs to — changing it moves the bill in the tenant's monthly view and in reports.</div>
        </div>
        <div class="field">
          <label for="ebDue">Due date</label>
          <input id="ebDue" type="date" value="${dueVal}">
        </div>
        <div class="field">
          <label for="ebStatus">Status</label>
          <select id="ebStatus">
            <option value="pending" ${bill.status === 'pending' ? 'selected' : ''}>Pending</option>
            <option value="partial" ${bill.status === 'partial' ? 'selected' : ''}>Partial</option>
            <option value="paid" ${bill.status === 'paid' ? 'selected' : ''}>Paid</option>
            <option value="cancelled" ${bill.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
          </select>
        </div>
      </div>
      <div style="font-size:12px; color:var(--muted); margin-top:4px;">Already paid: ${currency(bill.paid_amount)}. Amount can't be reduced below this without first deleting payments.</div>
    </form>
  `, `
    <button class="btn btn-ghost" id="cancelBtn">Cancel</button>
    <button class="btn btn-danger-ghost" id="deleteBillBtn" style="margin-right:auto;">Delete bill</button>
    <button class="btn btn-primary" id="saveBtn">Save changes</button>
  `);
  document.getElementById('cancelBtn').addEventListener('click', closeModal);
  document.getElementById('deleteBillBtn').addEventListener('click', () => confirmDeleteBill(bill));

  document.getElementById('saveBtn').addEventListener('click', async () => {
    const form = document.getElementById('billEditForm');
    clearFieldErrors(form);
    const bill_type = document.getElementById('ebType').value.trim();
    const description = document.getElementById('ebDesc').value.trim();
    const amount = parseFloat(document.getElementById('ebAmount').value);
    const due = document.getElementById('ebDue').value;
    const billDate = document.getElementById('ebBillDate').value;
    const status = document.getElementById('ebStatus').value;
    let ok = true;
    if (!bill_type){ showFieldError('ebTypeErr','Bill type is required'); document.getElementById('ebType').classList.add('invalid'); ok=false; }
    if (isNaN(amount) || amount <= 0){ showFieldError('ebAmountErr','Enter a valid amount'); document.getElementById('ebAmount').classList.add('invalid'); ok=false; }
    if (!ok) return;

    await withSavingState('saveBtn', async () => {
      await api(`/api/bill/${bill.id}`, { method:'PUT', body:{
        bill_type, description, amount,
        bill_date: billDate ? new Date(billDate).toISOString() : undefined,
        due_date: due ? new Date(due).toISOString() : null,
        status,
      }});
      state.loaded.bills = false;
      closeModal();
      showToast('Bill updated', 'success');
      await renderView('billing');
    });
  });
}

function confirmDeleteBill(bill){
  openModal('Delete bill', `
    <div class="confirm-body">Are you sure you want to delete bill <strong>#${bill.id} · ${escapeHtml(bill.bill_type)}</strong>? All of its payments will be deleted too. This can't be undone.</div>
  `, `
    <button class="btn btn-ghost" id="cancelBtn">Cancel</button>
    <button class="btn btn-danger-ghost" id="confirmDeleteBtn">Delete</button>
  `);
  document.getElementById('cancelBtn').addEventListener('click', closeModal);
  document.getElementById('confirmDeleteBtn').addEventListener('click', async () => {
    await withSavingState('confirmDeleteBtn', async () => {
      await api(`/api/bill/${bill.id}`, { method:'DELETE' });
      state.loaded.bills = false;
      state.loaded.payments = false;
      closeModal();
      showToast(`Bill #${bill.id} deleted`, 'success');
      await renderView('billing');
    }, 'Deleting…');
  });
}

/* ---- Edit / delete a single payment ---- */
function openEditPaymentModal(paymentId){
  const pay = state.cache.payments.find(p => p.id === paymentId);
  if (!pay){ showToast('Payment not found', 'error'); return; }
  const dateVal = pay.payment_date ? new Date(pay.payment_date).toISOString().slice(0,10) : '';

  openModal(`Edit payment #${pay.id}`, `
    <form id="paymentEditForm">
      <div class="form-grid">
        <div class="field">
          <label for="epAmount">Amount (₹)</label>
          <input id="epAmount" type="number" step="0.01" min="0.01" value="${Number(pay.amount).toFixed(2)}">
          ${fieldErrorHtml('epAmountErr')}
        </div>
        <div class="field">
          <label for="epMethod">Payment method</label>
          <input id="epMethod" value="${escapeHtml(pay.payment_method)}">
          ${fieldErrorHtml('epMethodErr')}
        </div>
        <div class="field">
          <label for="epDate">Payment date</label>
          <input id="epDate" type="date" value="${dateVal}">
        </div>
        <div class="field full">
          <label for="epRemarks">Remarks</label>
          <input id="epRemarks" value="${escapeHtml(pay.remarks || '')}" placeholder="Optional">
        </div>
      </div>
      <div style="font-size:12px; color:var(--muted); margin-top:4px;">Saving will automatically re-reconcile the parent bill's paid/pending amount and status.</div>
    </form>
  `, `
    <button class="btn btn-ghost" id="cancelBtn">Cancel</button>
    <button class="btn btn-danger-ghost" id="deletePaymentBtn" style="margin-right:auto;">Delete payment</button>
    <button class="btn btn-primary" id="saveBtn">Save changes</button>
  `);
  document.getElementById('cancelBtn').addEventListener('click', closeModal);
  document.getElementById('deletePaymentBtn').addEventListener('click', () => confirmDeletePayment(pay));

  document.getElementById('saveBtn').addEventListener('click', async () => {
    const form = document.getElementById('paymentEditForm');
    clearFieldErrors(form);
    const amount = parseFloat(document.getElementById('epAmount').value);
    const payment_method = document.getElementById('epMethod').value.trim();
    const dateStr = document.getElementById('epDate').value;
    const remarks = document.getElementById('epRemarks').value.trim();
    let ok = true;
    if (isNaN(amount) || amount <= 0){ showFieldError('epAmountErr','Enter a valid amount'); document.getElementById('epAmount').classList.add('invalid'); ok=false; }
    if (!payment_method){ showFieldError('epMethodErr','Payment method is required'); document.getElementById('epMethod').classList.add('invalid'); ok=false; }
    if (!ok) return;

    await withSavingState('saveBtn', async () => {
      await api(`/api/payment/${pay.id}`, { method:'PUT', body:{
        amount, payment_method, remarks,
        payment_date: dateStr ? new Date(dateStr).toISOString() : undefined,
      }});
      state.loaded.payments = false;
      state.loaded.bills = false;
      closeModal();
      showToast('Payment updated', 'success');
      await renderView('billing');
    });
  });
}

function confirmDeletePayment(pay){
  openModal('Delete payment', `
    <div class="confirm-body">Are you sure you want to delete payment <strong>#${pay.id}</strong> (${currency(pay.amount)})? The parent bill will be re-reconciled. This can't be undone.</div>
  `, `
    <button class="btn btn-ghost" id="cancelBtn">Cancel</button>
    <button class="btn btn-danger-ghost" id="confirmDeleteBtn">Delete</button>
  `);
  document.getElementById('cancelBtn').addEventListener('click', closeModal);
  document.getElementById('confirmDeleteBtn').addEventListener('click', async () => {
    await withSavingState('confirmDeleteBtn', async () => {
      await api(`/api/payment/${pay.id}`, { method:'DELETE' });
      state.loaded.payments = false;
      state.loaded.bills = false;
      closeModal();
      showToast(`Payment #${pay.id} deleted`, 'success');
      await renderView('billing');
    }, 'Deleting…');
  });
}
