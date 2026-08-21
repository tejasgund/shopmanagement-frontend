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
    throw new ApiError(t('common.noInternet'), 0);
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

/* Dates are written out by hand rather than with toLocaleDateString, because
   Marathi month names aren't reliably available across the phone browsers
   our tenants use. Digits stay Latin - everyone reads those. */
const dateFmt = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return String(iso);
  return `${String(d.getDate()).padStart(2, '0')} ${monthShort(d.getMonth())} ${d.getFullYear()}`;
};

const monthYearFmt = (iso) => {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return `${monthName(d.getMonth())} ${d.getFullYear()}`;
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
  if (h < 12) return t('hello.morning');
  if (h < 17) return t('hello.afternoon');
  return t('hello.evening');
}

/* Percentage paid, clamped - used by every progress bar in the portal. */
function paidPercent(paid, total){
  const p = Number(paid || 0), tt = Number(total || 0);
  if (tt <= 0) return p > 0 ? 100 : 0;
  return Math.max(0, Math.min(100, Math.round((p / tt) * 100)));
}

/* One progress bar, used for bill-type totals and month totals. */
function progressBarHtml(paid, total, tone){
  const pct = paidPercent(paid, total);
  const cls = tone || (pct >= 100 ? 'done' : pct > 0 ? 'part' : 'none');
  return `<div class="tp-progress"><div class="tp-progress-fill is-${cls}" style="width:${pct}%;"></div></div>`;
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

/* ================================================================
   PAY ONLINE (Razorpay Standard Checkout)

   Shared by the bill detail sheet (one bill) and the Home screen's
   "Pay bill" button (the tenant's whole pending balance) - one
   implementation, so the two entry points can't quietly drift apart.

   opts:
     billId      - a specific bill's id, or null to pay across every bill
                   the tenant owes on (the backend FIFO-allocates it,
                   oldest due date first, same order the office's own
                   lump-sum tool uses)
     amount      - rupees, already validated by the caller against
                   whatever THAT screen's cap is (one bill's pending
                   amount, or the whole total due)
     description - shown inside the Razorpay modal
     btnEl       - the button to disable/spin/reset
     errElId     - id of the field-error element to show problems in
     onDone      - called after a successful, verified payment (e.g.
                   closeModal for the bill sheet; nothing needed on Home,
                   since refreshTenantPortal() already re-renders it)
   ================================================================ */
function tpStartRazorpayPayment({ billId, amount, description, btnEl, errElId, onDone }){
  if (typeof Razorpay === 'undefined'){
    showFieldError(errElId, t('pay.gatewayUnavailable'));
    return;
  }

  const originalLabel = btnEl.innerHTML;
  const resetButton = () => { btnEl.disabled = false; btnEl.innerHTML = originalLabel; };

  btnEl.disabled = true;
  btnEl.innerHTML = `<span class="tp-spinner"></span> ${t('pay.starting')}`;

  (async () => {
    let order;
    try {
      // The server decides and locks in the real amount here (capped at
      // whatever's actually pending) - this request value is a request,
      // never a promise the backend has to honour as-is.
      const body = { amount };
      if (billId != null) body.bill_id = billId;
      order = await api('/api/tenant/payments/razorpay/create-order', { method: 'POST', body });
    } catch (err) {
      showFieldError(errElId, err.message);
      resetButton();
      return;
    }

    btnEl.innerHTML = `<span class="tp-spinner"></span> ${t('pay.completeInWindow')}`;

    const options = {
      key: order.key_id,
      amount: order.amount,
      currency: order.currency,
      order_id: order.order_id,
      name: (tp.publicSettings && tp.publicSettings.app_name) || 'Payment',
      description: description || t('pay.payOnline'),
      prefill: {
        name:    tp.profile?.name   || '',
        email:   tp.profile?.email  || '',
        contact: tp.profile?.mobile || '',
      },
      theme: { color: '#2F6F4F' },
      handler: async function(response){
        btnEl.innerHTML = `<span class="tp-spinner"></span> ${t('pay.verifying')}`;
        try {
          await api('/api/tenant/payments/razorpay/verify', {
            method: 'POST',
            body: {
              razorpay_order_id:   response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature:  response.razorpay_signature,
            },
          });
          showToast(t('pay.success'), 'success');
          await refreshTenantPortal(false);
          if (onDone) onDone();
        } catch (err) {
          // Signature mismatch or a server-side hiccup - nothing was marked
          // paid. If money actually left their account, the office can
          // match it later using the Razorpay payment ID Razorpay itself
          // confirmed.
          resetButton();
          showFieldError(errElId, err.message || t('pay.verifyFailed'));
        }
      },
      modal: {
        ondismiss: function(){
          // User closed the Razorpay window without paying - not an error,
          // just let them try again.
          resetButton();
        },
      },
    };

    const rzp = new Razorpay(options);
    rzp.on('payment.failed', function(response){
      resetButton();
      showFieldError(errElId, (response && response.error && response.error.description) || t('pay.failed'));
    });
    rzp.open();
  })();
}
