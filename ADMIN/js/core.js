/* ================================================================
   ADMIN/js/core.js — split from the old ADMIN/script.js
   Contains: CONFIG, STATE, API LAYER, TOASTS, FORMATTERS, AUTH,
   plus the toggleCollapse helper (shared with the tenant portal).
   Must load first — everything else depends on `state`, `api()`,
   `currency`, `escapeHtml`, etc.
   ================================================================ */

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
  currentUser: null,
  view: 'dashboard',
  cache: { complexes: [], shops: [], users: [], bills: [], payments: [] },
  loaded: { complexes:false, shops:false, users:false, bills:false, payments:false },
  billing: {
    section: 'view', // 'add' | 'manage' | 'view' — the three Finance section tabs
    manageTab: 'bills', // 'bills' | 'payments' — sub-tab within Manage
    filters: { status: [], complexIds: [], typeSet: [], years: [], months: [], search: '' },
    paymentFilters: { complexId: '', method: '', year: '', month: '', search: '' },
    nav: { mode: 'tenant', complexId: null, userId: null, year: null, month: null, tab: 'bills', duesStatus: 'all' },
    sort: 'newest',
    paymentSort: 'newest',
  },
  deposits: {
    mode: 'tenant', // 'tenant' | 'property' | 'all'
    showInactive: true,
  },
};
// Set by dashboard "at a glance" cards to auto-apply a filter when the Bills view loads next.
let pendingBillsViewFilter = null;
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
const currency = (n) => (window.__currencySymbol || '₹') + Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ================================================================
   TERMINOLOGY LABELS
   Admin-configurable words for "tenant"/"shop"/"complex" (Settings ->
   Branding), so a new client can call these "Customer"/"Unit"/"Property"
   etc. without a code change. window.__labels is populated from
   /api/settings/public (see applyBranding() in settings.js); until that
   resolves, or for a key an admin hasn't overridden, DEFAULT_LABELS is
   used - same fallback pattern as currency() above.
   ================================================================ */
const DEFAULT_LABELS = { tenant: 'Tenant', shop: 'Shop', complex: 'Complex' };

function L(key){
  return (window.__labels && window.__labels[key]) || DEFAULT_LABELS[key] || key;
}

/* Simple English pluraliser - good enough for the kind of one-word nouns
   this setting is meant for (Shop/Unit/Stall, Complex/Property/Building,
   Tenant/Customer/Shopkeeper). Not a general-purpose pluraliser. */
function pluralize(word){
  const w = String(word || '');
  if (/[sxz]$|[cs]h$/i.test(w)) return w + 'es';
  if (/[^aeiou]y$/i.test(w)) return w.slice(0, -1) + 'ies';
  return w + 's';
}

function LP(key){
  return pluralize(L(key));
}
const dateFmt = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
};
const initials = (name) => (name || '?').trim().split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase();

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
   AUTH
   (sign-in itself happens on the root index.html; this page assumes the
   guard script in <head> already confirmed a valid admin session)
   ================================================================ */
function logout(){
  localStorage.removeItem('tms_token');
  localStorage.removeItem('tms_role');
  window.location.href = '../index.html';
}

document.getElementById('logoutBtn').addEventListener('click', logout);

async function initAdminUser(){
  try {
    const users = await api('/api/user');
    state.cache.users = users; state.loaded.users = true;
    document.getElementById('sidebarUserName').textContent = 'Admin';
    document.getElementById('sidebarUserRole').textContent = state.role;
    document.getElementById('sidebarAvatar').textContent = 'A';
  } catch (err) { /* non-fatal */ }
}

/* ================================================================
   TENANT PROFILE LINKS
   One helper + one delegated listener so that everywhere a tenant's
   name is shown (Billing, Reports, Finance, Dashboard, Users…), it's
   clickable into their full statement — without every view having to
   wire its own click handler.
   ================================================================ */
function tenantLinkHtml(userId, name, extraStyle=''){
  if (!userId) return escapeHtml(name || '—');
  return `<a href="#" data-tenant-link="${userId}" data-tenant-link-name="${escapeHtml(name||'')}" style="color:var(--green-deep); font-weight:600; text-decoration:none; ${extraStyle}">${escapeHtml(name || '—')}</a>`;
}
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-tenant-link]');
  if (!el) return;
  e.preventDefault();
  openTenantFullStatementModal(Number(el.dataset.tenantLink), el.dataset.tenantLinkName);
});

/* ================================================================
   SHARED WITH TENANT PORTAL
   (also used here by the admin's own Ledger view — kept in sync with
   the identical copy in ../USER/script.js)
   ================================================================ */
function toggleCollapse(header){
  header.classList.toggle('open');
  const body = header.nextElementSibling;
  body.classList.toggle('open');
}
