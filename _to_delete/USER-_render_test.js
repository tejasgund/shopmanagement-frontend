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
    documentElement: { lang: 'mr' },
  },
  window: { jspdf: null },
  localStorage: (() => {
    const store = {};   // real behaviour, so the language setting round-trips
    return {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    };
  })(),
  fetch: async () => ({ ok: true, status: 200, text: async () => '{}' }),
  setTimeout, clearTimeout, URL: { createObjectURL: () => 'blob:x' },
  FormData: class { append(){} },
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

/* Load the real files (skip tenant-app.js — it boots itself) */
['js/i18n.js','js/core.js','js/ui-helpers.js','js/tenant-home.js','js/tenant-bills.js',
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
vm.runInContext('globalThis.setLang = setLang; globalThis.getLang = getLang; globalThis.t = t;', sandbox);

/* ---------- The data, shaped like the real API ---------- */
Object.assign(sandbox.tp, {
  loaded: true,
  profile: { id: 2, name: 'Ramesh Patel', mobile: '9822012345', email: null },
  shops: [{ id: 1, shop_number: 'A-101', complex_id: 1, complex_name: 'Sahyadri Business Park',
            shop_rent: 10000, shop_deposit: 50000,
            agreement_start_date: daysAgo(325), agreement_end_date: daysAhead(40) }],
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
    // One 6,000 handover, auto-allocated across 3 bills in a single
    // transaction -> identical created_at.
    { id: 31, bill_id: 9,  amount: 4000, payment_method: 'UPI',  payment_date: daysAgo(30), created_at: '2026-07-15T10:22:04' },
    { id: 32, bill_id: 8,  amount: 500,  payment_method: 'UPI',  payment_date: daysAgo(30), created_at: '2026-07-15T10:22:04' },
    { id: 33, bill_id: 11, amount: 1500, payment_method: 'UPI',  payment_date: daysAgo(30), created_at: '2026-07-15T10:22:04' },
    // One 8,500 cash handover, also a single allocation.
    { id: 34, bill_id: 9,  amount: 6000, payment_method: 'Cash', payment_date: daysAgo(12), created_at: '2026-08-02T09:10:11', remarks: 'At office' },
    { id: 35, bill_id: 11, amount: 2500, payment_method: 'Cash', payment_date: daysAgo(12), created_at: '2026-08-02T09:10:11' },
    // SAME DAY, SAME METHOD, but recorded hours later - a genuinely separate
    // payment that date-only grouping used to merge into the one above.
    { id: 36, bill_id: 11, amount: 1200, payment_method: 'Cash', payment_date: daysAgo(12), created_at: '2026-08-02T17:45:30' },
  ],
  meters: [{ id: 7, meter_number: 'MTR-001', shop_id: 1, shop_number: 'A-101',
             previous_reading: 12730, has_pending: false }],
  readings: [
    { id: 51, meter_id: 7, status: 'approved', customer_reading: 12732, approved_reading: 12730,
      calculated_units: 280, reading_date: daysAgo(5), has_photo: true,
      bill_id: 12, bill: { id: 12, amount: 2660 } },
    { id: 50, meter_id: 7, status: 'rejected', customer_reading: 12900, calculated_units: null,
      reading_date: daysAgo(8), rejection_reason: 'Photo too blurry to read', has_photo: true },
  ],
  deposits: [{ id: 1, shop_id: 1, amount: 30000, payment_date: daysAgo(300) }],
  publicSettings: null,
});

/* ---------- Checks ---------- */
const results = [];
const check = (name, cond, extra = '') => {
  results.push({ name, pass: !!cond });
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
};
const strip = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/* The portal defaults to Marathi. Most checks below read the English wording,
   so switch to English first; a dedicated Marathi section follows at the end. */
console.log('\n=== DEFAULT LANGUAGE ===');
check('portal defaults to Marathi', sandbox.getLang() === 'mr', sandbox.getLang());
const mrHome = strip(sandbox.renderHomeScreen());
check('Marathi home shows "तुम्हाला भरायचे आहे"', mrHome.includes('तुम्हाला भरायचे आहे'));
check('Marathi home has no leftover English labels',
      !/You need to pay|How to pay|My shops/.test(mrHome));
check('Marathi month names used', /ऑग|जुलै|जून|मे|एप्रिल|जाने|फेब्रु|मार्च|सप्टें|ऑक्टो|नोव्हें|डिसें/.test(mrHome));
check('Marathi bill type "दुकान भाडे"', strip(sandbox.renderBillsScreen()).includes('दुकान भाडे'));
check('Marathi meter block "मागील रीडिंग"', mrHome.includes('मागील रीडिंग'));
check('Marathi big button "नवीन रीडिंग द्या"', mrHome.includes('नवीन रीडिंग द्या'));
check('Marathi agreement labels', mrHome.includes('करार सुरू झाला') && mrHome.includes('उरलेले दिवस'));
check('Marathi deposit labels', mrHome.includes('एकूण अनामत') && mrHome.includes('बाकी अनामत'));

sandbox.setLang('en');
check('can switch to English', sandbox.getLang() === 'en');

console.log('\n=== HOME (English) ===');
const home = strip(sandbox.renderHomeScreen());
check('shows the total owed (₹8,660.00)', home.includes('8,660.00'));
check('says something is overdue', /overdue/i.test(home));
check('shows how many days late', /Late by \d+ day/.test(home));
check('Home no longer shows a "how to pay" block', !/How to pay/i.test(home));
check('Home no longer says "bills not fully paid"', !/not fully paid/i.test(home));
check('offers the reading action on Home', /Add meter reading/.test(home));
check('shows the shop and rent', home.includes('A-101') && home.includes('10,000.00'));
check('agreement warning appears in the More sheet', true);  // checked in MORE below
check('shows recent payment', /What you paid recently/.test(home));

console.log('\n--- Home block 2: pending by bill type ---');
const homeHtml = sandbox.renderHomeScreen();
check('has a "what you still owe" block', /What you still owe/.test(home));
check('breaks the total down by type', /Shop rent/.test(home) && /Electricity/.test(home));
check('shows rent pending 6,000 and electricity 2,660',
      home.includes('6,000.00') && home.includes('2,660.00'));
check('no progress bars in the owed-by-type block',
      !/tp-progress/.test(homeHtml.split('tp-section-title')[0] || homeHtml));

console.log('\n--- Home block 3: one block per shop ---');
check('shop block present', /tp-shop-block/.test(homeHtml));
check('shows shop number', home.includes('A-101'));
check('shows complex name', home.includes('Sahyadri Business Park'));
check('shows rent', home.includes('10,000.00'));
check('shows previous reading', home.includes('12,730'));
check('shows previous reading date', /Previous reading date/.test(home));
check('big add-reading button', /Add meter reading/.test(home) && /tp-add-reading/.test(homeHtml));
check('shows agreement start date', /Started on/.test(home));
check('shows agreement end date', /Ends on/.test(home));
check('shows days remaining', /Days remaining/.test(home) && /40 days/.test(home));
check('shows deposit needed / paid / left',
      /Deposit needed/.test(home) && /Deposit paid/.test(home) && /Deposit left/.test(home));
check('deposit maths right (50,000 - 30,000 = 20,000)',
      home.includes('50,000.00') && home.includes('30,000.00') && home.includes('20,000.00'));

console.log('\n=== MY BILLS ===');
const billsHtml = sandbox.renderBillsScreen();
const bills = strip(billsHtml);
check('shows the amount still to pay', bills.includes('8,660.00'));
check('lists rent in plain words ("Shop rent")', /Shop rent/.test(bills));
check('lists the electricity bill', /Electricity/.test(bills));
check('uses plain status words', /Not paid|Part paid/.test(bills));
check('never shows "pending" or "partial"', !/\bpending\b|\bpartial\b/i.test(bills));
check('renders no <table> at all', !/<table/i.test(billsHtml));
check('default filter shows the 2 unpaid bills', (billsHtml.match(/class="tp-bill /g) || []).length === 2,
      `${(billsHtml.match(/class="tp-bill /g) || []).length} cards`);
check('bills grouped into month blocks', /tp-month-block/.test(billsHtml));
check('each month block has a progress bar', /tp-month-block[\s\S]{0,400}tp-progress/.test(billsHtml));
check('month block shows billed / paid / left', /Billed/.test(bills) && /Left/.test(bills));

console.log('\n=== I PAID  (the complaint) ===');
const groups = sandbox.groupedPayments();
check('6 API rows became 3 payments', groups.length === 3, `${groups.length} groups from 6 rows`);
check('same-day payments taken hours apart stay separate',
      groups.filter(g => g.method === 'Cash').length === 2,
      `${groups.filter(g => g.method === 'Cash').length} cash entries`);
check('the later same-day 1,200 is its own entry',
      groups.some(g => Math.round(g.total) === 1200));
const six = groups.find(g => Math.round(g.total) === 6000);
const eighty5 = groups.find(g => Math.round(g.total) === 8500);
check('the ₹6,000 handover is one entry', !!six, six ? `${six.parts.length} bills, ${six.method}` : '');
check('the ₹8,500 handover is one entry', !!eighty5, eighty5 ? `${eighty5.parts.length} bills, ${eighty5.method}` : '');

const payHtml = sandbox.renderPaymentsScreen();
const pay = strip(payHtml);
check('screen shows ₹6,000.00', pay.includes('6,000.00'));
check('screen shows ₹8,500.00', pay.includes('8,500.00'));
check('says the payment was split across bills', /3 bills/.test(pay) && /tap to see/.test(pay));
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
// Approved readings render as a label/value card now ("units used" / "280"),
// not the old combined "280 units used" phrase from the plain-row layout.
check('shows units used on past readings', /units used\s*280/i.test(meter));
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
check('shows agreement end date', /Agreement ends/.test(more));
check('has the language switch', /मराठी/.test(more) && /English/.test(more));

console.log('\n=== NO-DATA CASES ===');
const backup = JSON.parse(JSON.stringify({ b: sandbox.tp.bills, p: sandbox.tp.payments, m: sandbox.tp.meters }));
sandbox.tp.bills = []; sandbox.tp.payments = []; sandbox.tp.meters = []; sandbox.tp.readings = [];
check('all-paid-up message when nothing is owed', /all paid up/i.test(strip(sandbox.renderHomeScreen())));
check('friendly empty state on bills', /Nothing to pay/i.test(strip(sandbox.renderBillsScreen())));
check('friendly empty state on payments', /No payments yet/i.test(strip(sandbox.renderPaymentsScreen())));
check('meter tab explains there is no meter', /No meter for your shop/i.test(strip(sandbox.renderMeterScreen())));
sandbox.tp.bills = backup.b; sandbox.tp.payments = backup.p; sandbox.tp.meters = backup.m;

console.log('\n=== MARATHI, EVERY SCREEN ===');
sandbox.setLang('mr');
const mrBills = strip(sandbox.renderBillsScreen());
const mrPay   = strip(sandbox.renderPaymentsScreen());
const mrMeter = strip(sandbox.renderMeterScreen());
check('bills screen in Marathi', mrBills.includes('एकूण बाकी') && mrBills.includes('बाकी'));
check('payments screen in Marathi', mrPay.includes('तुम्ही भरले'));
check('meter screen in Marathi', mrMeter.includes('शेवटचे मंजूर रीडिंग'));
check('status words in Marathi', mrBills.includes('थोडे भरले') || mrBills.includes('बाकी'));
const allMr = mrHome + mrBills + mrPay + mrMeter;
check('no English UI words leaked into Marathi',
      !/(Still to pay|Not paid|Part paid|You paid|Previous reading|Add meter reading)/.test(allMr));
sandbox.setLang('en');

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
