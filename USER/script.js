/* ================================================================
   CONFIG — set your backend URL here
   ================================================================ */
const API_BASE_URL = ""; // relative — same origin as this page; Apache proxies /api to the backend

/* ================================================================
   STATE
   ================================================================ */
const state = {
  token: localStorage.getItem('tms_token') || null,
  role: localStorage.getItem('tms_role') || null,
};
let tpBillsData = [], tpShopsData = [], tpBillDrill = { year:null, month:null };
let tpPaysData = [], tpPayDrill = { year:null, month:null };

/* ================================================================
   API LAYER
   ================================================================ */
class ApiError extends Error {
  constructor(message, status){ super(message); this.status = status; }
}

async function api(path, { method = 'GET', body = null, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && state.token) headers['Authorization'] = `Bearer ${state.token}`;

  let res;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new ApiError(`Can't reach the server at ${API_BASE_URL}. Check the API_BASE_URL value and that the backend is running.`, 0);
  }

  let data = null;
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch { data = null; }
  }

  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    if (data) {
      if (typeof data.detail === 'string') msg = data.detail;
      else if (Array.isArray(data.detail)) msg = data.detail.map(d => d.msg).join(', ');
    }
    if (res.status === 401) { handleAuthExpired(); }
    throw new ApiError(msg, res.status);
  }
  return data;
}

function handleAuthExpired(){
  localStorage.removeItem('tms_token');
  localStorage.removeItem('tms_role');
  window.location.href = '../index.html?expired=1';
}

/* ================================================================
   TOASTS
   ================================================================ */
function showToast(message, type = 'default'){
  const stack = document.getElementById('toastStack');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icon = type === 'success'
    ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>'
    : type === 'error'
      ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
      : '';
  el.innerHTML = `${icon}<span>${escapeHtml(message)}</span>`;
  stack.appendChild(el);
  setTimeout(() => {
    el.classList.add('fade-out');
    setTimeout(() => el.remove(), 250);
  }, 3400);
}

function escapeHtml(str){
  const d = document.createElement('div');
  d.textContent = String(str ?? '');
  return d.innerHTML;
}

/* ================================================================
   FORMATTERS
   ================================================================ */
const currency = (n) => '₹' + Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateFmt = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
};
function daysLeftHtml(endIso){
  if (!endIso) return '<span style="color:var(--muted);">—</span>';
  const end = new Date(endIso);
  if (isNaN(end)) return '<span style="color:var(--muted);">—</span>';
  const today = new Date();
  today.setHours(0,0,0,0);
  end.setHours(0,0,0,0);
  const days = Math.round((end - today) / 86400000);
  if (days < 0) return `<span style="color:var(--rust); font-weight:700;">Expired ${Math.abs(days)}d ago</span>`;
  if (days === 0) return `<span style="color:var(--rust); font-weight:700;">Expires today</span>`;
  if (days <= 30) return `<span style="color:var(--rust); font-weight:600;">${days}d left</span>`;
  if (days <= 90) return `<span style="color:#b8860b; font-weight:600;">${days}d left</span>`;
  return `<span style="color:var(--success);">${days}d left</span>`;
}

/* ================================================================
   TENANT GREETING HELPER
   ================================================================ */
function getTimeGreeting(name){
  const hour = new Date().getHours();
  let timePhrase = '';
  if (hour < 12) timePhrase = 'Good morning';
  else if (hour < 17) timePhrase = 'Good afternoon';
  else timePhrase = 'Good evening';

  const creativeMessages = [
    `${timePhrase}, ${name}! ✨`,
    `${timePhrase}, ${name} – your shops are ready!`,
    `${timePhrase}, ${name}! Let's get things done!`,
    `${timePhrase}, ${name} – we're all set for you.`,
    `${timePhrase}, ${name}! How can I help you today?`,
  ];
  return creativeMessages[Math.floor(Math.random() * creativeMessages.length)];
}

/* ================================================================
   AUTH
   (sign-in itself happens on the root index.html; this page assumes the
   guard script in <head> already confirmed a valid tenant session)
   ================================================================ */
function logout(){
  localStorage.removeItem('tms_token');
  localStorage.removeItem('tms_role');
  window.location.href = '../index.html';
}

document.getElementById('tenantLogoutBtn').addEventListener('click', logout);

/* ================================================================
   SHARED UI HELPERS
   ================================================================ */
function skeletonHtml(){
  return `<div class="table-wrap">${Array.from({length:5}).map(()=>'<div class="skeleton-row"></div>').join('')}</div>`;
}
function errorBannerHtml(msg){
  return `<div class="error-banner">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
    <span>${escapeHtml(msg)}</span>
    <button id="retryBtn" class="btn btn-sm btn-ghost" style="margin-left:auto; border-color:var(--danger); color:var(--danger);">Retry</button>
  </div>`;
}
function stampHtml(status){
  const cls = status === 'paid' ? 'paid' : status === 'partial' ? 'partial' : 'pending';
  return `<span class="stamp ${cls}">${escapeHtml(status)}</span>`;
}
function warnIcon(){
  return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
}

/* ---------- Monthly Ledger: PDF build / download / print / share ---------- */
const currencyPdf = (n) => 'Rs. ' + Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function buildMonthlyLedgerDoc(tenantName, tenantMobile, year, monthly, summary, complexName){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const marginX = 40;
  const pageW = doc.internal.pageSize.getWidth();
  let y = 46;
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  doc.setFillColor(58, 54, 46);
  doc.rect(0, 0, pageW, 6, 'F');

  doc.setFontSize(12); doc.setFont(undefined, 'bold'); doc.setTextColor(58, 54, 46);
  doc.text('LEDGER', marginX, y);
  doc.setFontSize(9); doc.setFont(undefined, 'normal'); doc.setTextColor(130);
  doc.text('Shop & Tenant Management' + (complexName ? '  ·  ' + complexName : ''), marginX + 55, y);
  y += 24;

  doc.setDrawColor(220); doc.setLineWidth(0.6);
  doc.line(marginX, y, pageW - marginX, y);
  y += 22;

  doc.setFontSize(17); doc.setFont(undefined, 'bold'); doc.setTextColor(20);
  doc.text('Monthly Ledger', marginX, y); y += 20;
  doc.setFontSize(10.5); doc.setFont(undefined, 'bold'); doc.setTextColor(60);
  doc.text(tenantName, marginX, y);
  if (tenantMobile){
    doc.setFont(undefined, 'normal'); doc.setTextColor(120);
    doc.text(tenantMobile, marginX + doc.getTextWidth(tenantName) + 10, y);
  }
  y += 15;
  doc.setFontSize(9); doc.setFont(undefined, 'normal'); doc.setTextColor(130);
  doc.text(`Year ${year}   ·   Generated ${new Date().toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}`, marginX, y);
  y += 24;

  const kpis = [
    { label: 'OUTSTANDING DUES', value: currencyPdf(summary.outstanding_dues), color: [176, 62, 46] },
    { label: 'TOTAL BILLED', value: currencyPdf(summary.total_billed), color: [20,20,20] },
    { label: 'TOTAL PAID', value: currencyPdf(summary.total_paid), color: [46, 110, 62] },
    { label: 'DEPOSIT ON FILE', value: currencyPdf(summary.deposit_on_file), color: [20,20,20] },
  ];
  const kpiW = (pageW - marginX*2) / 4;
  kpis.forEach((it, i) => {
    const x = marginX + i * kpiW;
    doc.setDrawColor(225); doc.setLineWidth(0.5);
    if (i > 0) doc.line(x, y - 14, x, y + 8);
    doc.setFontSize(7.5); doc.setFont(undefined, 'bold'); doc.setTextColor(140);
    doc.text(it.label, x, y);
    doc.setFontSize(12.5); doc.setFont(undefined, 'bold'); doc.setTextColor(...it.color);
    doc.text(it.value, x, y + 16);
  });
  y += 36;
  doc.setDrawColor(220); doc.line(marginX, y, pageW - marginX, y);
  y += 20;
  doc.setTextColor(0);

  const totalBilled = monthly.reduce((s,m) => s + m.billed, 0);
  const totalPaid = monthly.reduce((s,m) => s + m.paid, 0);
  const totalRemaining = monthly.reduce((s,m) => s + m.remaining, 0);
  const totalBillsCount = monthly.reduce((s,m) => s + m.bills_count, 0);
  const overallStatus = totalRemaining === 0 ? 'Paid' : (totalPaid > 0 ? 'Partial' : 'Pending');

  const statusColorMap = { Paid: [46,110,62], Partial: [176,130,30], Pending: [176,62,46], 'No bills': [150,150,150] };

  doc.autoTable({
    startY: y,
    head: [['Month','Bills','Billed','Paid','Remaining','Status']],
    body: monthly.map((m, idx) => [
      monthNames[idx], String(m.bills_count),
      m.bills_count ? currencyPdf(m.billed) : '—',
      m.bills_count ? currencyPdf(m.paid) : '—',
      m.bills_count ? currencyPdf(m.remaining) : '—',
      m.status,
    ]),
    foot: [['Year total', String(totalBillsCount), currencyPdf(totalBilled), currencyPdf(totalPaid), currencyPdf(totalRemaining), overallStatus]],
    margin: { left: marginX, right: marginX },
    styles: { fontSize: 8.5, cellPadding: { top:6, bottom:6, left:8, right:8 }, lineColor: [230,228,222], lineWidth: 0.5 },
    headStyles: { fillColor: [58, 54, 46], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    footStyles: { fillColor: [240, 237, 230], textColor: [20,20,20], fontStyle: 'bold', fontSize: 8.5 },
    alternateRowStyles: { fillColor: [250, 249, 246] },
    columnStyles: {
      0: { fontStyle: 'bold' },
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'left' },
    },
    didParseCell: (d) => {
      if (d.section === 'body' && d.column.index === 5){
        const c = statusColorMap[d.cell.raw] || [90,90,90];
        d.cell.styles.textColor = c; d.cell.styles.fontStyle = 'bold';
      }
      if (d.section === 'body' && d.column.index === 4 && d.cell.raw !== '—'){
        d.cell.styles.textColor = [176, 62, 46];
      }
    },
  });

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++){
    doc.setPage(i);
    const w = doc.internal.pageSize.getWidth(), h = doc.internal.pageSize.getHeight();
    doc.setDrawColor(230); doc.setLineWidth(0.5);
    doc.line(marginX, h - 34, w - marginX, h - 34);
    doc.setFontSize(8); doc.setFont(undefined, 'normal'); doc.setTextColor(140);
    doc.text('Ledger — Shop & Tenant Management', marginX, h - 20);
    doc.text(`Page ${i} of ${pageCount}`, w - marginX, h - 20, { align: 'right' });
  }
  return doc;
}


function downloadMonthlyLedgerPdf(source){
  const d = source === 'tenant' ? state._lastTpLedgerData : state._lastAdminLedgerData;
  if (!d) return;
  const doc = buildMonthlyLedgerDoc(d.tenantName, d.tenantMobile, d.year, d.monthly, d.summary, d.complexName);
  doc.save(`ledger-${d.tenantName.replace(/\s+/g,'_')}-${d.year}.pdf`);
}

function printMonthlyLedgerPdf(source){
  const d = source === 'tenant' ? state._lastTpLedgerData : state._lastAdminLedgerData;
  if (!d) return;
  const doc = buildMonthlyLedgerDoc(d.tenantName, d.tenantMobile, d.year, d.monthly, d.summary, d.complexName);
  doc.autoPrint();
  window.open(doc.output('bloburl'), '_blank');
}

async function shareMonthlyLedgerPdf(source){
  const d = source === 'tenant' ? state._lastTpLedgerData : state._lastAdminLedgerData;
  if (!d) return;
  const doc = buildMonthlyLedgerDoc(d.tenantName, d.tenantMobile, d.year, d.monthly, d.summary, d.complexName);
  const fileName = `ledger-${d.tenantName.replace(/\s+/g,'_')}-${d.year}.pdf`;
  const blob = doc.output('blob');
  const file = new File([blob], fileName, { type: 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: `Ledger ${d.year} — ${d.tenantName}`, text: `Monthly ledger for ${d.year}` });
    } catch (err) {
      if (err.name !== 'AbortError') showToast('Could not share — downloading instead', 'error');
      doc.save(fileName);
    }
  } else {
    doc.save(fileName);
    showToast('Sharing not supported on this device/browser — file downloaded instead', 'success');
  }
}

/* ================================================================
   TENANT PORTAL
   ================================================================ */
/* ================================================================
   TENANT PORTAL
   ================================================================ */
document.getElementById('tenantRefreshBtn').addEventListener('click', async (e) => {
  e.currentTarget.classList.add('spinning');
  try { await loadTenantPortal(); showToast('Data refreshed', 'success'); }
  finally { e.currentTarget.classList.remove('spinning'); }
});

// Tenant portal filter state
const tpFilters = { complex:'', shop:'', month:'', year:'', status:'', dateFrom:'', dateTo:'' };






async function loadTenantPortal(){
  const content = document.getElementById('tenantContent');
  content.innerHTML = skeletonHtml();
  try {
    const [profile, shops, bills, payments] = await Promise.all([
      api('/api/tenant/profile'),
      api('/api/tenant/shops'),
      api('/api/tenant/bills'),
      api('/api/tenant/payments'),
    ]);
    document.getElementById('tenantName').textContent = profile.name;
    // ── add agreement‑days reminder ──
    let soonestEnd = null;
    shops.forEach(s => {
        if (s.agreement_end_date) {
            const d = new Date(s.agreement_end_date);
            if (!soonestEnd || d < soonestEnd) soonestEnd = d;
        }
    });
    let daysLeft = soonestEnd ? Math.round((soonestEnd - new Date()) / 86400000) : null;
    let agreementMsg = '';
    if (daysLeft !== null) {
        if (daysLeft < 0) agreementMsg = ' ⚠️ Agreement expired!';
        else if (daysLeft <= 30) agreementMsg = ` ⏳ ${daysLeft} days left on agreement`;
        else agreementMsg = ` 📅 ${daysLeft} days left on agreement`;
    }
    const greeting = getTimeGreeting(profile.name) + agreementMsg;
    document.getElementById('tenantGreeting').textContent = greeting;

    // Compute summary
    const totalRent = shops.reduce((s,sh)=>s+Number(sh.shop_rent||0),0);
    const totalDeposit = shops.reduce((s,sh)=>s+Number(sh.shop_deposit||0),0);
    const pendingBills = bills.filter(b=>b.status!=='paid');
    const pendingTotal = pendingBills.reduce((s,b)=>s+Number(b.pending_amount||0),0);
    const paidTotal = payments.reduce((s,p)=>s+Number(p.amount||0),0);
    const nextDue = pendingBills.filter(b=>b.due_date).sort((a,b)=>new Date(a.due_date)-new Date(b.due_date))[0];

    // Complex names come straight from /api/tenant/shops (complex_name per shop) —
    // /api/complex itself is admin-only and would 403 for a tenant.
    const complexNames = {};
    shops.forEach(s => { if (s.complex_id) complexNames[s.complex_id] = s.complex_name; });

    let depositPaid = 0;
    let depositRemaining = totalDeposit;
    let depositSourceFailed = false;
    try {
      const depPays = await api('/api/tenant/deposit-payments');
      depositPaid = (depPays||[]).reduce((s,p)=>s+Number(p.amount||0),0);
    } catch(e){
      depositSourceFailed = true;
      const depositBillIds = new Set(bills.filter(b => /deposit/i.test(b.bill_type||'')).map(b=>b.id));
      if (depositBillIds.size > 0) {
        depositPaid = payments.filter(p => depositBillIds.has(p.bill_id)).reduce((s,p)=>s+Number(p.amount||0),0);
      }
    }
    depositRemaining = Math.max(0, totalDeposit - depositPaid);

    // ── Build the HTML ──
    content.innerHTML = `
    <!-- Summary Cards -->
        <div class="tp-stat-grid">
      <div class="tp-stat"><div class="tp-label">Assigned Shops</div><div class="tp-value">${shops.length}</div></div>
      <div class="tp-stat accent-green"><div class="tp-label">Monthly Rent</div><div class="tp-value" style="font-size:16px;">${currency(totalRent)}</div></div>
      <div class="tp-stat"><div class="tp-label">Deposit Required</div><div class="tp-value" style="font-size:16px;">${currency(totalDeposit)}</div></div>
      <div class="tp-stat accent-green"><div class="tp-label">Deposit Paid</div><div class="tp-value" style="font-size:16px;">${currency(depositPaid)}</div></div>
      <div class="tp-stat ${depositRemaining>0?'accent-rust':'accent-green'}"><div class="tp-label">Deposit Status</div><div class="tp-value" style="font-size:14px;">${depositRemaining<=0 && totalDeposit>0 ? 'Fully paid' : currency(depositRemaining)+' due'}</div></div>
      <div class="tp-stat accent-rust"><div class="tp-label">Pending Rent</div><div class="tp-value" style="font-size:16px;">${currency(pendingTotal)}</div></div>
      <div class="tp-stat accent-green"><div class="tp-label">Total Paid</div><div class="tp-value" style="font-size:16px;">${currency(paidTotal)}</div></div>
      <div class="tp-stat accent-partial"><div class="tp-label">Next Due Date</div><div class="tp-value" style="font-size:14px;">${nextDue ? dateFmt(nextDue.due_date) : '—'}</div></div>
      <!-- NEW: Agreement expiry -->
      <div class="tp-stat ${(daysLeft !== null && daysLeft <= 30) ? 'accent-rust' : 'accent-green'}" style="grid-column: span 1;">
        <div class="tp-label">Agreement Days Left</div>
        <div class="tp-value" style="font-size:14px;">${daysLeft !== null ? (daysLeft < 0 ? '⚠️ Expired' : daysLeft + ' days') : '—'}</div>
      </div>
    </div>

    <!-- Profile Section -->
    <div class="collapsible-section">
      <div class="collapsible-header" onclick="toggleCollapse(this)">
        <h3>My Profile</h3>
        <svg class="collapsible-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="collapsible-body">
        <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:10px;">
          <div><div style="font-size:11px; color:var(--muted); font-weight:700; text-transform:uppercase; letter-spacing:.04em;">Name</div><div style="font-weight:600; margin-top:3px;">${escapeHtml(profile.name)}</div></div>
          <div><div style="font-size:11px; color:var(--muted); font-weight:700; text-transform:uppercase; letter-spacing:.04em;">Mobile</div><div class="mono" style="margin-top:3px;">${escapeHtml(profile.mobile)}</div></div>
          ${profile.email ? `<div><div style="font-size:11px; color:var(--muted); font-weight:700; text-transform:uppercase; letter-spacing:.04em;">Email</div><div style="margin-top:3px;">${escapeHtml(profile.email)}</div></div>` : ''}
          <div><div style="font-size:11px; color:var(--muted); font-weight:700; text-transform:uppercase; letter-spacing:.04em;">Tenant ID</div><div class="mono" style="margin-top:3px;">#${profile.id}</div></div>
          <div><div style="font-size:11px; color:var(--muted); font-weight:700; text-transform:uppercase; letter-spacing:.04em;">Status</div><div style="margin-top:3px;"><span class="pill ${profile.is_active?'active-pill':'inactive-pill'}"><span class="pill-dot"></span>${profile.is_active?'Active':'Inactive'}</span></div></div>
          <div><div style="font-size:11px; color:var(--muted); font-weight:700; text-transform:uppercase; letter-spacing:.04em;">Shops</div><div style="margin-top:3px; font-weight:700;">${shops.length}</div></div>
          <div><div style="font-size:11px; color:var(--muted); font-weight:700; text-transform:uppercase; letter-spacing:.04em;">Rent Bill Date</div><div style="margin-top:3px; font-weight:600;">${profile.rent_bill_date ? `Day ${profile.rent_bill_date} of month` : '—'}</div></div>
          <div><div style="font-size:11px; color:var(--muted); font-weight:700; text-transform:uppercase; letter-spacing:.04em;">Auto-billing</div><div style="margin-top:3px;"><span class="pill ${profile.auto_rent_bill_enabled?'active-pill':'inactive-pill'}"><span class="pill-dot"></span>${profile.auto_rent_bill_enabled?'Auto ON':'Auto OFF'}</span></div></div>
        </div>
      </div>
    </div>

    <!-- My Shops -->
    <div class="collapsible-section">
      <div class="collapsible-header" onclick="toggleCollapse(this)">
        <h3>My Shops <span class="record-count-tag" style="margin-left:8px;">${shops.length}</span></h3>
        <svg class="collapsible-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="collapsible-body">
        ${shops.length === 0 ? '<div class="empty-compact">No shops assigned to your account.</div>' :
          shops.map(s=>`
          <div class="tenant-card">
            <div class="row1">
              <span class="title mono">${escapeHtml(s.shop_number)}</span>
              <span class="pill ${s.status}"><span class="pill-dot"></span>${escapeHtml(s.status)}</span>
            </div>
            <div class="meta">${escapeHtml(complexNames[s.complex_id]||'Complex #'+s.complex_id)} · ${Number(s.area_sqft||0).toLocaleString('en-IN')} sqft</div>
            <div class="amt-row" style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:8px; border:none; padding:0;">
              <div><div style="font-size:11px; color:var(--muted); font-weight:600; text-transform:uppercase;">Rent/mo</div><div class="mono" style="font-weight:700; font-size:14px;">${currency(s.shop_rent||0)}</div></div>
              <div><div style="font-size:11px; color:var(--muted); font-weight:600; text-transform:uppercase;">Deposit</div><div class="mono" style="font-weight:700; font-size:14px;">${currency(s.shop_deposit||0)}</div></div>
            </div>
            <div class="amt-row" style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:8px; border:none; padding:0;">
              <div><div style="font-size:11px; color:var(--muted); font-weight:600; text-transform:uppercase;">Agreement Start</div><div class="mono" style="font-weight:700; font-size:13px;">${s.agreement_start_date ? dateFmt(s.agreement_start_date) : '—'}</div></div>
              <div><div style="font-size:11px; color:var(--muted); font-weight:600; text-transform:uppercase;">Agreement End</div><div class="mono" style="font-weight:700; font-size:13px;">${s.agreement_end_date ? dateFmt(s.agreement_end_date) : '—'}</div></div>
            </div>
            <div class="amt-row" style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:4px; border:none; padding:0;">
              <div><div style="font-size:11px; color:var(--muted); font-weight:600; text-transform:uppercase;">Days Left</div><div style="font-weight:700; font-size:14px;">${s.agreement_end_date ? daysLeftHtml(s.agreement_end_date) : '—'}</div></div>
              <div><div style="font-size:11px; color:var(--muted); font-weight:600; text-transform:uppercase;">Status</div><div style="font-weight:700; font-size:14px;">${s.agreement_end_date ? daysLeftHtml(s.agreement_end_date) : '—'}</div></div>
            </div>
          </div>`).join('')}
      </div>
    </div>

    <!-- Deposit Summary -->
    <div class="collapsible-section">
      <div class="collapsible-header" onclick="toggleCollapse(this)">
        <h3>Deposit Summary</h3>
        <svg class="collapsible-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="collapsible-body">
        <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:14px;">
          <div class="card stat-card"><div class="label">Required</div><div class="value mono" style="font-size:18px;">${currency(totalDeposit)}</div></div>
          <div class="card stat-card accent-green"><div class="label">Paid</div><div class="value mono" style="font-size:18px;">${currency(depositPaid)}</div></div>
          <div class="card stat-card accent-rust"><div class="label">Remaining</div><div class="value mono" style="font-size:18px;">${currency(depositRemaining)}</div></div>
        </div>
        ${totalDeposit > 0 ? `
        <div class="deposit-progress">
          <div style="display:flex; justify-content:space-between; font-size:12px; color:var(--muted); margin-bottom:4px;">
            <span>Progress</span><span>${Math.round(depositPaid/totalDeposit*100)}%</span>
          </div>
          <div class="deposit-bar-wrap"><div class="deposit-bar" style="width:${Math.min(100,Math.round(depositPaid/totalDeposit*100))}%;"></div></div>
        </div>` : ''}
        ${shops.length ? `
        <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:8px; margin-top:14px;">
          ${shops.map(s=>`<div class="info-card"><div class="info-row"><span class="info-label">${escapeHtml(s.shop_number)}</span><span class="info-val">${currency(s.shop_deposit||0)}</span></div></div>`).join('')}
        </div>` : ''}
        ${depositSourceFailed && depositPaid === 0 ? `
        <div class="warn-box" style="margin-top:12px;">
          ${warnIcon()}
          <span>We couldn't load your deposit payment history right now. The "Required" amount above is accurate, but "Paid" may not reflect deposit payments your admin has already recorded — contact your admin if this looks wrong.</span>
        </div>` : ''}
      </div>
    </div>

    <!-- Bills Section -->
    <div class="collapsible-section">
      <div class="collapsible-header" onclick="toggleCollapse(this)">
        <h3>Bills <span class="record-count-tag" style="margin-left:8px;">${bills.length}</span></h3>
        <svg class="collapsible-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="collapsible-body">
        <div id="tpBillCrumb" class="drill-crumb"></div>
        <div id="tpBillDrillArea"></div>
      </div>
    </div>

    <!-- Payments Section -->
<div class="collapsible-section">
  <div class="collapsible-header" onclick="toggleCollapse(this)">
    <h3>Payment History <span class="record-count-tag" style="margin-left:8px;">${payments.length}</span></h3>
    <svg class="collapsible-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
  </div>
  <div class="collapsible-body">
    <div id="tpPayCrumb" class="drill-crumb"></div>
    <div id="tpPayDrillArea"></div>
  </div>
</div>

    <!-- Monthly Ledger (NEW) -->
    <div class="collapsible-section">
      <div class="collapsible-header" onclick="toggleCollapse(this)">
        <h3>Monthly Ledger</h3>
        <svg class="collapsible-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="collapsible-body">
        <div style="display:flex; gap:10px; margin-bottom:12px; align-items:center; flex-wrap:wrap;">
          <label style="font-weight:600; font-size:13px;">Year:</label>
          <select id="tpLedgerYear" class="sort-select" style="padding:6px 10px;">
            ${Array.from({length:6},(_,i) => {
              const y = new Date().getFullYear() - i;
              return `<option value="${y}" ${i===0?'selected':''}>${y}</option>`;
            }).join('')}
          </select>
          <span class="record-count-tag" id="tpLedgerCount">Loading…</span>
          <div style="display:flex; gap:8px; margin-left:auto;">
            <button class="btn btn-ghost btn-sm" onclick="downloadMonthlyLedgerPdf('tenant')">Download PDF</button>
            <button class="btn btn-ghost btn-sm" onclick="printMonthlyLedgerPdf('tenant')">Print</button>
            <button class="btn btn-ghost btn-sm" onclick="shareMonthlyLedgerPdf('tenant')">Share</button>
          </div>
        </div>
        <div id="tpLedgerContainer">
          <div style="text-align:center; padding:20px; color:var(--muted);">Select a year to load ledger.</div>
        </div>
      </div>
    </div>
    `; // ── end content.innerHTML ──

    // ── Bills & Payments year→month drill-down ──
    tpBillsData = bills; tpShopsData = shops;
    tpBillDrill = { year:null, month:null };
    renderTpBillDrill();

    tpPaysData = payments;
    tpPayDrill = { year:null, month:null };
    renderTpPayDrill();



    // ── Monthly Ledger (NEW) ──
    const ledgerYear = document.getElementById('tpLedgerYear');
    const ledgerContainer = document.getElementById('tpLedgerContainer');
    const ledgerCount = document.getElementById('tpLedgerCount');

    async function loadLedger(year){
      try {
        ledgerCount.textContent = 'Loading…';
        const data = await api(`/api/tenant/ledger/monthly?year=${year}`);
        state._lastTpLedgerData = { tenantName: profile.name, tenantMobile: profile.mobile, year, monthly: data.monthly, summary: data.summary, complexName: [...new Set(data.shops.map(s=>s.complex_name).filter(Boolean))].join(', ') };
        ledgerContainer.innerHTML = renderTenantLedger(data);
        const totalBills = data.monthly.reduce((s,m) => s + m.bills_count, 0);
        ledgerCount.textContent = `${totalBills} bills`;
      } catch (err) {
        ledgerContainer.innerHTML = errorBannerHtml(err.message);
        ledgerContainer.querySelector('#retryBtn')?.addEventListener('click', () => loadLedger(year));
        ledgerCount.textContent = 'Error';
      }
    }

    if (ledgerYear) {
      ledgerYear.addEventListener('change', function() {
        loadLedger(this.value);
      });
      // Load initial year
      loadLedger(ledgerYear.value);
    }

    // ── Collapsible toggles (existing) ──
    document.querySelectorAll('.month-row-head').forEach(h => {
      h.addEventListener('click', () => {
        const body = h.nextElementSibling;
        body.classList.toggle('open');
      });
    });

  } catch (err) {
    content.innerHTML = errorBannerHtml(err.message);
    document.getElementById('retryBtn')?.addEventListener('click', loadTenantPortal);
  }
}



function toggleCollapse(header){
  header.classList.toggle('open');
  const body = header.nextElementSibling;
  body.classList.toggle('open');
}

const monthNamesShort = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function groupByYearMonth(items, dateField, amountFn, pendingFn){
  const years = {};
  items.forEach(it => {
    const d = it[dateField];
    if (!d) return;
    const dt = new Date(d);
    const y = dt.getFullYear(), m = dt.getMonth()+1;
    const amt = amountFn(it);
    const pend = pendingFn ? pendingFn(it) : 0;
    if (!years[y]) years[y] = { count:0, total:0, pending:0, months:{} };
    if (!years[y].months[m]) years[y].months[m] = { count:0, total:0, pending:0, items:[] };
    years[y].count++; years[y].total += amt; years[y].pending += pend;
    years[y].months[m].count++; years[y].months[m].total += amt; years[y].months[m].pending += pend;
    years[y].months[m].items.push(it);
  });
  return years;
}

// ── Bills drill-down ──
function renderTpBillDrill(){
  const grouped = groupByYearMonth(tpBillsData, 'bill_date', b=>Number(b.amount||0), b=>Number(b.pending_amount||0));
  const crumb = document.getElementById('tpBillCrumb');
  const area = document.getElementById('tpBillDrillArea');
  if (!area) return;

  if (!tpBillDrill.year) {
    crumb.innerHTML = `<span class="active">All Years</span>`;
    const years = Object.keys(grouped).sort((a,b)=>b-a);
    area.innerHTML = years.length ? `<div class="drill-grid">${years.map(y=>`
      <div class="drill-card" onclick="tpBillGoYear(${y})">
        <div class="dc-title">${y}</div>
        <div class="dc-count">${grouped[y].count} bill${grouped[y].count===1?'':'s'}</div>
        <div class="dc-amt">${currency(grouped[y].total)}</div>
        <div class="dc-pending ${grouped[y].pending>0?'':'clear'}">${grouped[y].pending>0?currency(grouped[y].pending)+' pending':'All settled'}</div>
      </div>`).join('')}</div>` : '<div class="empty-compact">No bills found.</div>';
    return;
  }

  const yearData = grouped[tpBillDrill.year];
  if (!tpBillDrill.month) {
    crumb.innerHTML = `<span onclick="tpBillGoRoot()">All Years</span><span class="sep">\u203a</span><span class="active">${tpBillDrill.year}</span>`;
    const months = yearData ? Object.keys(yearData.months).sort((a,b)=>a-b) : [];
    area.innerHTML = months.length ? `<div class="drill-grid">${months.map(m=>`
      <div class="drill-card" onclick="tpBillGoMonth(${m})">
        <div class="dc-title">${monthNamesShort[m-1]}</div>
        <div class="dc-count">${yearData.months[m].count} bill${yearData.months[m].count===1?'':'s'}</div>
        <div class="dc-amt">${currency(yearData.months[m].total)}</div>
        <div class="dc-pending ${yearData.months[m].pending>0?'':'clear'}">${yearData.months[m].pending>0?currency(yearData.months[m].pending)+' pending':'All settled'}</div>
      </div>`).join('')}</div>` : '<div class="empty-compact">No bills found.</div>';
    return;
  }

  crumb.innerHTML = `<span onclick="tpBillGoRoot()">All Years</span><span class="sep">\u203a</span><span onclick="tpBillGoYear(${tpBillDrill.year})">${tpBillDrill.year}</span><span class="sep">\u203a</span><span class="active">${monthNamesShort[tpBillDrill.month-1]}</span>`;
  const monthBills = yearData.months[tpBillDrill.month].items;
  area.innerHTML = `
    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px;">
      <select id="tpBillStatus" class="sort-select" style="font-size:12.5px; padding:7px 10px;">
        <option value="">All statuses</option>
        <option value="pending">Pending</option>
        <option value="partial">Partial</option>
        <option value="paid">Paid</option>
      </select>
      <select id="tpBillShop" class="sort-select" style="font-size:12.5px; padding:7px 10px;">
        <option value="">All shops</option>
        ${tpShopsData.map(s=>`<option value="${s.id}">${escapeHtml(s.shop_number)}</option>`).join('')}
      </select>
      <button class="btn btn-ghost btn-sm" onclick="clearTpBillFilters()">Clear</button>
    </div>
    <div id="tpBillList">
      ${monthBills.map(b=>`
      <div class="tenant-card tp-bill-row" data-status="${b.status}" data-shop-id="${b.shop_id}">
        <div class="row1"><span class="title">${escapeHtml(b.bill_type)}</span>${stampHtml(b.status)}</div>
        <div class="meta">Bill #${b.id} · ${escapeHtml(tpShopsData.find(s=>s.id===b.shop_id)?.shop_number||'Shop #'+b.shop_id)} · due ${dateFmt(b.due_date)}</div>
        ${b.description ? `<div class="meta" style="margin-top:2px;">${escapeHtml(b.description)}</div>` : ''}
        <div class="amt-row"><span>Total ${currency(b.amount)} · Paid ${currency(b.paid_amount||0)}</span><span class="big" style="color:${b.pending_amount>0?'var(--rust)':'var(--success)'};">${currency(b.pending_amount)} due</span></div>
      </div>`).join('')}
    </div>
    <div id="tpBillEmpty" class="empty-compact" style="display:none;">No bills match your filters.</div>
  `;
  ['tpBillStatus','tpBillShop'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', applyTpBillFilters);
  });
  applyTpBillFilters();
}
function tpBillGoRoot(){ tpBillDrill = { year:null, month:null }; renderTpBillDrill(); }
function tpBillGoYear(y){ tpBillDrill = { year:y, month:null }; renderTpBillDrill(); }
function tpBillGoMonth(m){ tpBillDrill.month = m; renderTpBillDrill(); }

function applyTpBillFilters(){
  const status = document.getElementById('tpBillStatus')?.value||'';
  const shopId = document.getElementById('tpBillShop')?.value||'';
  const rows = document.querySelectorAll('.tp-bill-row');
  let count = 0;
  rows.forEach(r => {
    let show = true;
    if (status && r.dataset.status !== status) show = false;
    if (shopId && String(r.dataset.shopId) !== shopId) show = false;
    r.style.display = show ? '' : 'none';
    if (show) count++;
  });
  const emp = document.getElementById('tpBillEmpty');
  const lst = document.getElementById('tpBillList');
  if (emp) emp.style.display = count===0 ? 'block' : 'none';
  if (lst) lst.style.display = count===0 ? 'none' : '';
}
function clearTpBillFilters(){
  ['tpBillStatus','tpBillShop'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  applyTpBillFilters();
}

// ── Payments drill-down ──
function renderTpPayDrill(){
  const grouped = groupByYearMonth(tpPaysData, 'payment_date', p=>Number(p.amount||0), null);
  const crumb = document.getElementById('tpPayCrumb');
  const area = document.getElementById('tpPayDrillArea');
  if (!area) return;

  if (!tpPayDrill.year) {
    crumb.innerHTML = `<span class="active">All Years</span>`;
    const years = Object.keys(grouped).sort((a,b)=>b-a);
    area.innerHTML = years.length ? `<div class="drill-grid">${years.map(y=>`
      <div class="drill-card" onclick="tpPayGoYear(${y})">
        <div class="dc-title">${y}</div>
        <div class="dc-count">${grouped[y].count} payment${grouped[y].count===1?'':'s'}</div>
        <div class="dc-amt">${currency(grouped[y].total)}</div>
      </div>`).join('')}</div>` : '<div class="empty-compact">No payments found.</div>';
    return;
  }

  const yearData = grouped[tpPayDrill.year];
  if (!tpPayDrill.month) {
    crumb.innerHTML = `<span onclick="tpPayGoRoot()">All Years</span><span class="sep">\u203a</span><span class="active">${tpPayDrill.year}</span>`;
    const months = yearData ? Object.keys(yearData.months).sort((a,b)=>a-b) : [];
    area.innerHTML = months.length ? `<div class="drill-grid">${months.map(m=>`
      <div class="drill-card" onclick="tpPayGoMonth(${m})">
        <div class="dc-title">${monthNamesShort[m-1]}</div>
        <div class="dc-count">${yearData.months[m].count} payment${yearData.months[m].count===1?'':'s'}</div>
        <div class="dc-amt">${currency(yearData.months[m].total)}</div>
      </div>`).join('')}</div>` : '<div class="empty-compact">No payments found.</div>';
    return;
  }

  crumb.innerHTML = `<span onclick="tpPayGoRoot()">All Years</span><span class="sep">\u203a</span><span onclick="tpPayGoYear(${tpPayDrill.year})">${tpPayDrill.year}</span><span class="sep">\u203a</span><span class="active">${monthNamesShort[tpPayDrill.month-1]}</span>`;
  const monthPays = yearData.months[tpPayDrill.month].items;
  area.innerHTML = `
    <div id="tpPayList">
      ${monthPays.map(p=>`
      <div class="tenant-card tp-pay-row">
        <div class="row1"><span class="title mono">${currency(p.amount)}</span><span class="meta">${escapeHtml(p.payment_method)}</span></div>
        <div class="meta">Paid ${dateFmt(p.payment_date)} · Receipt #${p.id}${p.remarks?' · '+escapeHtml(p.remarks):''}</div>
      </div>`).join('')}
    </div>
  `;
}
function tpPayGoRoot(){ tpPayDrill = { year:null, month:null }; renderTpPayDrill(); }
function tpPayGoYear(y){ tpPayDrill = { year:y, month:null }; renderTpPayDrill(); }
function tpPayGoMonth(m){ tpPayDrill.month = m; renderTpPayDrill(); }


function renderTenantLedger(data){
  const monthly = data.monthly || [];
  const summary = data.summary || {};
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  let summaryHtml = `
    <div class="stat-row" style="margin:10px 0 16px; grid-template-columns:repeat(4,1fr);">
      <div class="card stat-card"><div class="label">Outstanding Dues</div><div class="value mono" style="font-size:18px;">${currency(summary.outstanding_dues)}</div></div>
      <div class="card stat-card accent-green"><div class="label">Total Billed</div><div class="value mono" style="font-size:18px;">${currency(summary.total_billed)}</div></div>
      <div class="card stat-card accent-green"><div class="label">Total Paid</div><div class="value mono" style="font-size:18px;">${currency(summary.total_paid)}</div></div>
      <div class="card stat-card"><div class="label">Deposit on File</div><div class="value mono" style="font-size:18px;">${currency(summary.deposit_on_file)}</div></div>
    </div>
  `;

  const rows = monthly.map(m => {
    const statusColor = m.status === 'Paid' ? 'var(--success)' :
                        m.status === 'Partial' ? 'var(--partial)' :
                        m.status === 'Pending' ? 'var(--rust)' : 'var(--muted)';
    return `
      <tr>
        <td><strong>${monthNames[m.month-1]}</strong></td>
        <td class="num">${m.bills_count}</td>
        <td class="num">${m.bills_count ? currency(m.billed) : '–'}</td>
        <td class="num">${m.bills_count ? currency(m.paid) : '–'}</td>
        <td class="num">${m.bills_count ? currency(m.remaining) : '–'}</td>
        <td><span style="color:${statusColor}; font-weight:600;">${m.status}</span></td>
      </tr>
    `;
  }).join('');

  const totalBilled = monthly.reduce((s,m) => s + m.billed, 0);
  const totalPaid = monthly.reduce((s,m) => s + m.paid, 0);
  const totalRemaining = monthly.reduce((s,m) => s + m.remaining, 0);
  const totalBillsCount = monthly.reduce((s,m) => s + m.bills_count, 0);
  const overallStatus = totalRemaining === 0 ? 'Paid' : (totalPaid > 0 ? 'Partial' : 'Pending');

  const tableHtml = `
    <div class="table-wrap" style="border:1px solid var(--line); border-radius:var(--radius);">
      <table>
        <thead>
          <tr>
            <th>Month</th>
            <th class="num">Bills</th>
            <th class="num">Billed</th>
            <th class="num">Paid</th>
            <th class="num">Remaining</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
          <tr style="font-weight:700; background:var(--paper); border-top:2px solid var(--line);">
            <td><strong>Total</strong></td>
            <td class="num">${totalBillsCount}</td>
            <td class="num">${currency(totalBilled)}</td>
            <td class="num">${currency(totalPaid)}</td>
            <td class="num">${currency(totalRemaining)}</td>
            <td><span style="color:${overallStatus === 'Paid' ? 'var(--success)' : 'var(--rust)'}; font-weight:700;">${overallStatus}</span></td>
          </tr>
        </tbody>
      </table>
    </div>
  `;

  return summaryHtml + tableHtml;
}





function renderMonthSummary(bills, payments){
  // Group by year-month
  const months = {};
  bills.forEach(b => {
    const d = b.bill_date || b.created_at || b.due_date;
    if (!d) return;
    const dt = new Date(d);
    const key = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
    if (!months[key]) months[key] = { bills:[], payments:[] };
    months[key].bills.push(b);
  });
  payments.forEach(p => {
    const d = p.payment_date;
    if (!d) return;
    const dt = new Date(d);
    const key = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
    if (!months[key]) months[key] = { bills:[], payments:[] };
    months[key].payments.push(p);
  });

  const sortedKeys = Object.keys(months).sort((a,b)=>b.localeCompare(a));
  if (!sortedKeys.length) return '<div class="empty-compact">No billing history yet.</div>';

  return sortedKeys.map(key => {
    const [yr, mo] = key.split('-');
    const mName = new Date(Number(yr), Number(mo)-1).toLocaleString('en-IN',{month:'long', year:'numeric'});
    const mBills = months[key].bills;
    const mPays = months[key].payments;
    const rent = mBills.reduce((s,b)=>s+Number(b.amount||0),0);
    const paid = mPays.reduce((s,p)=>s+Number(p.amount||0),0);
    const pending = mBills.reduce((s,b)=>s+Number(b.pending_amount||0),0);
    return `
    <div class="month-row">
      <div class="month-row-head">
        <div class="m-name">${mName}</div>
        <div class="m-badges">
          <span style="font-size:12px; color:var(--muted);">${currency(rent)} billed</span>
          ${pending>0?`<span class="stamp pending" style="transform:none; font-size:10px;">${currency(pending)} due</span>`:`<span class="stamp paid" style="transform:none; font-size:10px;">paid</span>`}
        </div>
      </div>
      <div class="month-row-body">
        <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-bottom:10px;">
          <div><div style="font-size:11px; color:var(--muted); font-weight:600; text-transform:uppercase;">Rent</div><div class="mono" style="font-weight:700;">${currency(rent)}</div></div>
          <div><div style="font-size:11px; color:var(--muted); font-weight:600; text-transform:uppercase;">Paid</div><div class="mono" style="color:var(--success); font-weight:700;">${currency(paid)}</div></div>
          <div><div style="font-size:11px; color:var(--muted); font-weight:600; text-transform:uppercase;">Pending</div><div class="mono" style="color:${pending>0?'var(--rust)':'var(--success)'}; font-weight:700;">${currency(pending)}</div></div>
        </div>
        ${mBills.length ? `<div style="font-size:12px; font-weight:600; color:var(--muted); margin-bottom:6px; text-transform:uppercase; letter-spacing:.04em;">Bills</div>
          ${mBills.map(b=>`<div style="font-size:13px; padding:6px 0; border-bottom:1px dashed var(--line);">
            <div style="display:flex; justify-content:space-between;"><span>${escapeHtml(b.bill_type)} · #${b.id}</span><span style="display:flex; gap:8px; align-items:center;">${stampHtml(b.status)} ${currency(b.pending_amount)} due</span></div>
            <div style="font-size:11.5px; color:var(--muted); margin-top:2px;">Bill date: ${dateFmt(b.bill_date)} · Due date: ${dateFmt(b.due_date)}${b.description ? ' · Description: '+escapeHtml(b.description) : ''}</div>
          </div>`).join('')}` : ''}
        ${mPays.length ? `<div style="font-size:12px; font-weight:600; color:var(--muted); margin:10px 0 6px; text-transform:uppercase; letter-spacing:.04em;">Payments</div>
          ${mPays.map(p=>`<div style="display:flex; justify-content:space-between; font-size:13px; padding:5px 0; border-bottom:1px dashed var(--line);">
            <span>Paid on: ${dateFmt(p.payment_date)} · ${escapeHtml(p.payment_method)}${p.remarks ? ' · Remarks: '+escapeHtml(p.remarks) : ''}</span><span class="mono" style="color:var(--success); font-weight:700;">${currency(p.amount)}</span>
          </div>`).join('')}` : ''}
      </div>
    </div>`;
  }).join('');
}

/* ================================================================
   INIT
   (the guard script in <head> already confirmed a valid tenant session)
   ================================================================ */
(async function boot(){
  await loadTenantPortal();
})();
