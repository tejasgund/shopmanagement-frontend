/* ================================================================
   SCHEDULER/js/core.js — API access, formatting and shared state.

   Standalone page, but the same session as the admin app: one login
   covers both, and this screen is admin-only.

   Everything this page shows is READ from the tracking tables. The
   two schedulers are cron scripts; nothing here can start one.
   ================================================================ */

const API_BASE_URL = "";   // same origin; Apache proxies /api to the backend

const sch = {
  summary: null,
  tab: 'overview',
  filters: {                 // remembered per tab so switching back keeps them
    runs:    { scheduler: '', status: '', date_from: '', date_to: '' },
    rent:    { action: '', period_key: '', user: '' },
    penalty: { action: '', user: '' },
    reports: { granularity: 'daily', scheduler: '' },
  },
  openRunId: null,           // when set, the Runs tab shows one run in detail
  billId: null,              // when set (#bill-123), one bill's history replaces the tabs
  timer: null,
  // Accumulated rows for tabs with a "Load more" button. Each holds
  // {rows, total} and is reset to null whenever a filter changes or the
  // tab is (re)opened fresh - see loadMoreRows() / the render* functions.
  paged: { runs: null, rent: null, penalty: null },
};

/* The two schedulers, and the labels used wherever one is named. Mirrors the
   API's own registry - if the server ever grows a third, this is the one place
   the frontend needs to learn about it. */
const SCHEDULERS = {
  auto_rent_generation: 'Auto Rent Generation',
  due_bill_penalty:     'Due Bill Penalty',
};

/* What each action means, in the words the screen should use. Keyed by the
   exact strings the scripts write, so an unknown action falls back to its raw
   name rather than silently rendering as blank. */
const ACTIONS = {
  RENT_CREATED:      { label: 'Rent created',      tone: 'good' },
  SKIPPED_DUPLICATE: { label: 'Duplicate skipped', tone: 'muted' },
  SKIPPED_NO_SHOP:   { label: 'No shop assigned',  tone: 'warn' },
  SKIPPED_ZERO_RENT: { label: 'Shop rent not set', tone: 'warn' },
  PENALTY_APPLIED:   { label: 'Penalty applied',   tone: 'warn' },
  PENALTY_REDUCED:   { label: 'Penalty reduced',   tone: 'muted' },
  PENALTY_UNCHANGED: { label: 'Unchanged',         tone: 'muted' },
  FAILED:            { label: 'Failed',            tone: 'bad'  },
};

class ApiError extends Error {
  constructor(message, status){ super(message); this.status = status; }
}

async function api(path, { method = 'GET', body = null } = {}) {
  const token = localStorage.getItem('tms_token');
  let res;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new ApiError("Can't reach the server.", 0);
  }

  const text = await res.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = null; } }

  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem('tms_token');
      localStorage.removeItem('tms_role');
      window.location.href = '../index.html?expired=1';
    }
    let msg = `Request failed (${res.status})`;
    if (data && typeof data.detail === 'string') msg = data.detail;
    throw new ApiError(msg, res.status);
  }
  return data;
}

/* Build a query string from a filter object, dropping the empty values so a
   blank filter box means "no filter" rather than "match the empty string". */
function qs(params){
  const parts = Object.entries(params)
    .filter(([, v]) => v !== '' && v !== null && v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

function escapeHtml(str){
  const d = document.createElement('div');
  d.textContent = String(str ?? '');
  return d.innerHTML;
}

function showToast(message, type = 'default'){
  const stack = document.getElementById('toastStack');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${escapeHtml(message)}</span>`;
  stack.appendChild(el);
  setTimeout(() => { el.classList.add('fade-out'); setTimeout(() => el.remove(), 250); }, 3400);
}

/* ── formatting ─────────────────────────────────────────────── */

const dtFmt = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return String(iso);
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
};

const dateFmt = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return String(iso);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

/* Money reads as money. No currency symbol: the app's is configurable, and a
   wrong one is worse than none. */
function amountFmt(value){
  if (value === null || value === undefined) return '—';
  return Number(value).toLocaleString('en-IN', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

/* Durations read as "how long did it take", not as a raw millisecond count. */
function durationFmt(ms){
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

/* A run that started hours ago and never finished was killed, not working.
   The server decides which; this only picks the label so the two can never
   disagree. */
function runBadge(run){
  const label = run.is_stalled ? 'STALLED' : run.status;
  return `<span class="sch-badge ${escapeHtml(label)}">${escapeHtml(label)}</span>`;
}

function actionBadge(action){
  const spec = ACTIONS[action] || { label: action, tone: 'muted' };
  return `<span class="sch-chip tone-${spec.tone}">${escapeHtml(spec.label)}</span>`;
}

function schedulerLabel(name){
  return SCHEDULERS[name] || name;
}

function emptyState(message){
  return `<div class="sch-empty">${escapeHtml(message)}</div>`;
}
