/* ================================================================
   USER/js/core.js — config, API layer, formatters, auth.
   Loads first: every other file depends on api(), currency(),
   escapeHtml() and friends.
   ================================================================ */

/* ================================================================
   CONFIG
   ================================================================ */
const API_BASE_URL = ""; // relative — same origin; Apache proxies /api to the backend

/* How tenants can pay you. Methods only — deliberately no UPI IDs or
   account numbers, so nothing sensitive lives in the frontend.
   Edit this one line to change what every tenant sees, or add a
   `payment_methods` field to /api/settings/public and it will be used
   instead automatically. */
const PAYMENT_METHODS_FALLBACK = "Cash, UPI or bank transfer at the office.";

/* ================================================================
   STATE
   ================================================================ */
const state = {
  token: localStorage.getItem('tms_token') || null,
  role: localStorage.getItem('tms_role') || null,
};

/* ================================================================
   API
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
      method, headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new ApiError("Can't reach the server. Please check your internet and try again.", 0);
  }

  let data = null;
  const text = await res.text();
  if (text){ try { data = JSON.parse(text); } catch { data = null; } }

  if (!res.ok){
    let msg = `Something went wrong (${res.status})`;
    if (data){
      if (typeof data.detail === 'string') msg = data.detail;
      else if (Array.isArray(data.detail)) msg = data.detail.map(d => d.msg).join(', ');
    }
    if (res.status === 401) handleAuthExpired();
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
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => {
    el.classList.add('fade-out');
    setTimeout(() => el.remove(), 250);
  }, 3600);
}

function escapeHtml(str){
  const d = document.createElement('div');
  d.textContent = String(str ?? '');
  return d.innerHTML;
}

/* ================================================================
   FORMATTERS
   ================================================================ */
const currency = (n) => '₹' + Number(n ?? 0).toLocaleString('en-IN', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

const dateFmt = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return String(iso);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

function startOfToday(){
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/* Whole days from a to b (positive when b is later). */
function daysBetween(a, b){
  const x = new Date(a); x.setHours(0, 0, 0, 0);
  const y = new Date(b); y.setHours(0, 0, 0, 0);
  return Math.round((y - x) / 86400000);
}

function greetingWord(){
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function tpLoadingHtml(){
  return `
  <div class="tp-loading">
    <div class="tp-skeleton tp-skeleton-hero"></div>
    <div class="tp-skeleton"></div>
    <div class="tp-skeleton"></div>
  </div>`;
}

/* ================================================================
   AUTH
   ================================================================ */
function logout(){
  localStorage.removeItem('tms_token');
  localStorage.removeItem('tms_role');
  window.location.href = '../index.html';
}
