/* Throwaway harness — run with:  node USER/_render_test.js
   Loads the portal's real render functions with a tiny DOM stub, feeds them
   API responses shaped exactly like the backend's, and asserts on the HTML
   they produce. Checks the numbers, the wording, and above all that one
   lump-sum payment appears as ONE payment, not several fragments. */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DIR = __dirname;
const today = new Date();
const iso = (d) => new Date(d).toISOString();
const daysAgo = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return iso(d); };
const daysAhead = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return iso(d); };

/* ---------- Minimal DOM stub: only what the render code touches ---------- */
const noop = () => {};
const stubEl = () => ({
  textContent: '', innerHTML: '', style: {}, dataset: {}, files: [], value: '',
  classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
  addEventListener: noop, appendChild: noop, remove: noop, focus: noop,
  querySelectorAll: () => [], querySelector: () => null,
});

const sandbox = {
  console,
  document: {
    createElement: () => {
      const el = { _t: '', set textContent(v){ this._t = String(v ?? ''); },
                   get textContent(){ return this._t; },
                   get innerHTML(){
                     return this._t.replace(/&/g,'&amp;').replace(/</g,'&lt;')
                                   .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
                   } };
      return el;
    },
    getElementById: () => stubEl(),
    querySelectorAll: () => [],
    addEventListener: noop,
    body: { style: {} },
  },
  window: { jspdf: null },
  localStorage: { getItem: () => 'x', setItem: noop, removeItem: noop },
  fetch: async () => ({ ok: true, status: 200, text: async () => '{}' }),
  setTimeout, clearTimeout, URL: { createObjectURL: () => 'blob:x' },
  FormData: class { append(){} },
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

/* Load the real files (skip tenant-app.js — it boots itself) */
['js/core.js','js/ui-helpers.js','js/tenant-home.js','js/tenant-bills.js',
 'js/tenant-payments.js','js/tenant-meters.js','js/tenant-more.js']
  .forEach(f => vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), sandbox, { filename: f }));

/* tenant-app.js defines the shared `tp` object + helpers, but its boot IIFE
   would try to fetch. Pull in just the parts we need by evaluating the file
   with the IIFE stripped. */
let appSrc = fs.readFileSync(path.join(DIR, 'js/tenant-app.js'), 'utf8');
appSrc = appSrc.replace(/\(async function boot\(\)[\s\S]*$/, '');
vm.runInContext(appSrc, sandbox, { filename: 'js/tenant-app.js' });

// `const` at the top level of a vm script stays lexical, so it never lands on
// the sandbox object. Publish the few we need to poke at from the harness.
vm.runInContext('globalThis.tp = tp; globalThis.state = state;', sandbox);

/* ---------- The data, shaped like the real API ---------- */
Object.assign(sandbox.tp, {
  loaded: true,
  profile: { id: 2, name: 'Ramesh Patel', mobile: '9822012345', email: null },
  shops: [{ id: 1, shop_number: 'A-101', complex_id: 1, complex_name: 'Sahyadri Business Park',
            shop_rent: 10000, shop_deposit: 50000, agreement_end_date: daysAhead(40) }],
  bills: [
    { id: 11, shop_id: 1, bill_type: 'Rent', amount: 10000, paid_amount: 4000,
      pending_amount: 6000, bill_date: daysAgo(40), due_date: daysAgo(9), status: 'partial' },
    { id: 12, shop_id: 1, bill_type: 'Electricity',
      description: 'Meter MTR-001 | 12450.00 to 12730.00 | 280.00 units @ 9.5/unit',
      amount: 2660, paid_amount: 0, pending_amount: 2660,
      bill_date: daysAgo(5), due_date: daysAhead(10), status: 'pending' },
    { id: 9, shop_id: 1, bill_type: 'Rent', amount: 10000, paid_amount: 10000,
      pending_amount: 0, bill_date: daysAgo(70), due_date: daysAgo(40), status: 'paid' },
    { id: 8, shop_id: 1, bill_type: 'Maintenance', description: 'Common area', amount: 500,
      paid_amount: 500, pending_amount: 0, bill_date: daysAgo(70), due_date: daysAgo(40), status: 'paid' },
  ],
  // THE SCENARIO: one ₹6,000 handover auto-allocated across 3 bills (3 rows,
  // same date + method), plus a separate ₹8,500 cash handover across 2 bills.
  payments: [
    { id: 31, bill_id: 9,  amount: 4000, payment_method: 'UPI',  payment_date: daysAgo(30) },
    { id: 32, bill_id: 8,  amount: 500,  payment_method: 'UPI',  payment_date: daysAgo(30) },
    { id: 33, bill_id: 11, amount: 1500, payment_method: 'UPI',  payment_date: daysAgo(30) },
    { id: 34, bill_id: 9,  amount: 6000, payment_method: 'Cash', payment_date: daysAgo(12), remarks: 'At office' },
    { id: 35, bill_id: 11, amount: 2500, payment_method: 'Cash', payment_date: daysAgo(12) },
  ],
  meters: [{ id: 7, meter_number: 'MTR-001', shop_number: 'A-101',
             previous_reading: 12730, has_pending: false }],
  readings: [
    { id: 51, meter_id: 7, status: 'approved', customer_reading: 12732, approved_reading: 12730,
      calculated_units: 280, reading_date: daysAgo(5), has_photo: true,
      bill_id: 12, bill: { id: 12, amount: 2660 } },
    { id: 50, meter_id: 7, status: 'rejected', customer_reading: 12900, calculated_units: null,
      reading_date: daysAgo(8), rejection_reason: 'Photo too blurry to read', has_photo: true },
  ],
  deposits: [{ id: 1, amount: 30000, payment_date: daysAgo(300) }],
  publicSettings: null,
});

/* ---------- Checks ---------- */
const results = [];
const check = (name, cond, extra = '') => {
  results.push({ name, pass: !!cond });
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
};
const strip = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

console.log('\n=== HOME ===');
const home = strip(sandbox.renderHomeScreen());
check('shows the total owed (₹8,660.00)', home.includes('8,660.00'));
check('says something is overdue', /overdue/i.test(home));
check('shows how many days late', /Late by \d+ day/.test(home));
check('shows how to pay (methods only)', /How to pay/i.test(home) && /Cash, UPI/.test(home));
check('leaks no UPI id / account number', !/@ok|IFSC|A\/c\b/i.test(home));
check('prompts for a meter reading', /Send your meter reading|wasn't accepted/i.test(home));
check('shows the shop and rent', home.includes('A-101') && home.includes('10,000.00'));
check('warns the agreement is ending', /agreement ends/i.test(home));
check('shows recent payment', /What you paid recently/.test(home));

console.log('\n=== MY BILLS ===');
const billsHtml = sandbox.renderBillsScreen();
const bills = strip(billsHtml);
check('shows the amount still to pay', bills.includes('8,660.00'));
check('lists rent in plain words ("Shop rent")', /Shop rent/.test(bills));
check('lists the electricity bill', /Electricity/.test(bills));
check('uses plain status words', /Not paid|Part paid/.test(bills));
check('never shows "pending" or "partial"', !/\bpending\b|\bpartial\b/i.test(bills));
check('groups bills under a month heading', /tp-month-head/.test(billsHtml));
check('renders no <table> at all', !/<table/i.test(billsHtml));
check('default filter shows the 2 unpaid bills', (billsHtml.match(/class="tp-bill /g) || []).length === 2,
      `${(billsHtml.match(/class="tp-bill /g) || []).length} cards`);

console.log('\n=== I PAID  (the complaint) ===');
const groups = sandbox.groupedPayments();
check('5 API rows became 2 payments', groups.length === 2, `${groups.length} groups from 5 rows`);
const six = groups.find(g => Math.round(g.total) === 6000);
const eighty5 = groups.find(g => Math.round(g.total) === 8500);
check('the ₹6,000 handover is one entry', !!six, six ? `${six.parts.length} bills, ${six.method}` : '');
check('the ₹8,500 handover is one entry', !!eighty5, eighty5 ? `${eighty5.parts.length} bills, ${eighty5.method}` : '');

const payHtml = sandbox.renderPaymentsScreen();
const pay = strip(payHtml);
check('screen shows ₹6,000.00', pay.includes('6,000.00'));
check('screen shows ₹8,500.00', pay.includes('8,500.00'));
check('says the payment was split across bills', /Put towards 3 bills/.test(pay));
check('shows the payment method', /UPI/.test(pay) && /Cash/.test(pay));
check('shows a year total', /You paid in \d{4}/.test(pay));

// The breakdown sheet
let sheetHtml = '';
sandbox.openModal = (t, body) => { sheetHtml = body; };
sandbox.openPaymentSheet(six.key);
const sheet = strip(sheetHtml);
check('breakdown lists 4,000 + 1,500 + 500', /4,000\.00/.test(sheet) && /1,500\.00/.test(sheet) && /500\.00/.test(sheet));
check('breakdown totals 6,000', /Total\s*₹?6,000\.00/.test(sheet));
check('names the bills it went to', /Shop rent/.test(sheet) && /Maintenance/.test(sheet));
check('explains the split in plain words', /divided it between the bills/i.test(sheet));

console.log('\n=== METER ===');
const meter = strip(sandbox.renderMeterScreen());
check('shows the last confirmed reading', meter.includes('12,730'));
check('offers to send this month\'s reading', /Send this month/.test(meter));
check('shows units used on past readings', /280 units used/.test(meter));
check('shows why one was rejected', /too blurry/i.test(meter));

sandbox.openSendReadingModal(7);
const form = strip(sheetHtml);
check('form: photo step then number step', /Take a photo/.test(form) && /Type the number/.test(form));
check('form repeats the previous reading', /12,730/.test(form));

console.log('\n=== MORE ===');
sandbox.openMoreSheet();
const more = strip(sheetHtml);
check('shows deposit paid vs required', /30,000\.00/.test(more) && /50,000\.00/.test(more));
check('shows the tenant\'s own details', /Ramesh Patel/.test(more) && /9822012345/.test(more));
check('offers the statement download', /Download my statement/.test(more));
check('offers sign out', /Sign out/.test(more));

console.log('\n=== NO-DATA CASES ===');
const backup = JSON.parse(JSON.stringify({ b: sandbox.tp.bills, p: sandbox.tp.payments, m: sandbox.tp.meters }));
sandbox.tp.bills = []; sandbox.tp.payments = []; sandbox.tp.meters = []; sandbox.tp.readings = [];
check('all-paid-up message when nothing is owed', /all paid up/i.test(strip(sandbox.renderHomeScreen())));
check('friendly empty state on bills', /Nothing to pay/i.test(strip(sandbox.renderBillsScreen())));
check('friendly empty state on payments', /No payments yet/i.test(strip(sandbox.renderPaymentsScreen())));
check('meter tab explains there is no meter', /No meter for your shop/i.test(strip(sandbox.renderMeterScreen())));
sandbox.tp.bills = backup.b; sandbox.tp.payments = backup.p; sandbox.tp.meters = backup.m;

console.log('\n=== SAFETY ===');
sandbox.tp.profile.name = '<img src=x onerror=alert(1)>';
check('escapes HTML in tenant data (no XSS)', !sandbox.renderHomeScreen().includes('<img src=x'));

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length){
  console.log('FAILED:');
  failed.forEach(f => console.log('  - ' + f.name));
  process.exit(1);
}
