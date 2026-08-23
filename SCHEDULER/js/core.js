/* ================================================================
   SCHEDULER/js/core.js — API access, formatting and shared state.
   Standalone page, but the same session as the admin app: one login
   covers both, and this screen is admin-only.
   ================================================================ */

const API_BASE_URL = "";   // same origin; Apache proxies /api to the backend

const sch = {
  status: null,
  tab: 'overview',
  lists: {},          // cached per tab so switching back is instant
  timer: null,
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

/* Durations read as "how long did it take", not as a raw millisecond count. */
function durationFmt(ms){
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function elapsedFmt(seconds){
  if (seconds === null || seconds === undefined) return '—';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m ${seconds % 60}s`;
}

/* "Missed" is a PENDING row whose moment has passed - the server decides,
   this only picks the label so the two can never disagree. */
function statusBadge(task){
  const label = task.is_missed ? 'MISSED' : task.status;
  return `<span class="sch-badge ${escapeHtml(label)}">${escapeHtml(label)}</span>`;
}
