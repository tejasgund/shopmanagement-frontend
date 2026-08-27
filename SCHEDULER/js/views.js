/* ================================================================
   SCHEDULER/js/views.js — the tracking views.

   Every list is rendered from what the API returns. There is no
   catalogue of schedulers, actions or reasons computed in this file:
   the "why" text on every row is the sentence the cron script wrote
   when it made the decision, carried through the API untouched.

   That matters. Recomputing an explanation in the browser from
   today's settings would quietly disagree with what the tenant was
   actually charged on the night.
   ================================================================ */

/* ── The status strip: one card per scheduler ───────────────────
   "Last run" and "last successful run" are shown separately on
   purpose. A scheduler that ran an hour ago and failed looks
   healthy by the first measure alone, and that is exactly the case
   this strip exists to catch. */

async function loadSummary(){
  sch.summary = await api('/api/scheduler/summary');
  renderStatus();
}

function renderStatus(){
  const s = sch.summary;
  if (!s) return;

  document.getElementById('schStatus').innerHTML = s.schedulers.map(item => {
    const last = item.last_run;
    const broken = last && (last.status === 'FAILED' || last.is_stalled);
    const partial = last && last.status === 'PARTIAL';

    let tone = '';
    if (!item.enabled) tone = '';
    else if (broken) tone = 'is-bad';
    else if (partial || item.failed_runs_last_7_days) tone = 'is-warn';
    else if (last) tone = 'is-good';

    let sub;
    if (item.never_run)      sub = 'has never run on this database';
    else if (broken)         sub = 'last run did not succeed';
    else if (partial)        sub = 'last run finished with failures';
    else                     sub = `${item.failed_runs_last_7_days} problem run(s) in 7 days`;

    return `
      <div class="sch-stat ${tone}">
        <div class="label">${escapeHtml(item.label)}</div>
        <div class="value" style="font-size:15px;">
          ${item.never_run ? 'Never run' : dtFmt(last.started_at)}
          ${last ? runBadge(last) : ''}
        </div>
        <div class="sub">${escapeHtml(sub)}</div>
        <div class="sub">${item.enabled
          ? 'switched on in Settings'
          : '<strong>switched OFF</strong> — cron runs, nothing is written'}</div>
      </div>`;
  }).join('');
}


/* ══════════════════════════════════════════════════════════════
   OVERVIEW
   ══════════════════════════════════════════════════════════════ */

async function renderOverview(){
  const body = document.getElementById('schBody');
  const [recent, problems] = await Promise.all([
    api('/api/scheduler/runs?limit=8'),
    // PARTIAL as well as FAILED: a run that billed most tenants and dropped
    // one is not a success, and the one it dropped is the row someone needs
    // to see. Two calls rather than one filter because the API takes a single
    // status - deliberately, so the filter means exactly one thing.
    Promise.all([
      api('/api/scheduler/runs?status=FAILED&limit=5'),
      api('/api/scheduler/runs?status=PARTIAL&limit=5'),
    ]).then(([failed, partial]) => [...failed.runs, ...partial.runs]
      .sort((a, b) => new Date(b.started_at) - new Date(a.started_at))),
  ]);

  const problemBlock = problems.length ? `
    <div class="sch-section-title">Needs attention</div>
    ${problems.map(runRow).join('')}` : '';

  body.innerHTML = `
    ${problemBlock}
    <div class="sch-section-title">Recent runs</div>
    ${recent.runs.length ? recent.runs.map(runRow).join('')
                         : emptyState('No scheduler has run yet. Once cron runs one of the two scripts, its history appears here.')}
    <div class="sch-section-title">How this works</div>
    <div class="sch-note">
      Two scripts run from cron and write what they did to the database:
      <code>scheduler/auto_rent_generation/</code> and
      <code>scheduler/due_bill_penalty/</code>. This screen reads that back —
      it cannot start a run, so cron remains the only thing that decides when
      a bill is raised.
    </div>`;
  wireRunLinks();
}


/* ══════════════════════════════════════════════════════════════
   RUNS  (execution history, and one run in detail)
   ══════════════════════════════════════════════════════════════ */

function runRow(run){
  const counts = [
    `${run.items_succeeded} done`,
    run.items_skipped ? `${run.items_skipped} skipped` : null,
    run.items_failed  ? `${run.items_failed} failed`   : null,
  ].filter(Boolean).join(' · ');

  return `
    <div class="sch-task sch-run-link" data-run="${escapeHtml(run.run_id)}" role="button" tabindex="0">
      <div>
        <div class="sch-task-name">${escapeHtml(run.scheduler_label)}</div>
        <div class="sch-task-meta">
          <code>${escapeHtml(run.run_id)}</code><br>
          For ${dateFmt(run.run_date)} · started ${dtFmt(run.started_at)}
          · took ${durationFmt(run.duration_ms)}
          ${run.trigger_source === 'manual' ? ' · run by hand' : ''}
        </div>
        ${run.error_message ? `<div class="sch-error">${escapeHtml(run.error_message)}</div>` : ''}
      </div>
      <div class="sch-task-right">
        ${runBadge(run)}
        <div class="sch-task-meta">${escapeHtml(counts)}</div>
        ${run.amount_total ? `<div class="sch-amount">${amountFmt(run.amount_total)}</div>` : ''}
      </div>
    </div>`;
}

function wireRunLinks(){
  document.querySelectorAll('.sch-run-link').forEach(el => {
    const open = () => { sch.openRunId = el.dataset.run; switchTab('runs'); };
    el.addEventListener('click', open);
    el.addEventListener('keydown', e => { if (e.key === 'Enter') open(); });
  });
}

async function renderRuns(){
  if (sch.openRunId) return renderRunDetail(sch.openRunId);

  const body = document.getElementById('schBody');
  const f = sch.filters.runs;
  const data = await api('/api/scheduler/runs' + qs({ ...f, limit: 100 }));

  body.innerHTML = `
    <div class="sch-filters">
      <label>Scheduler
        <select data-filter="runs.scheduler">
          <option value="">All</option>
          ${Object.entries(SCHEDULERS).map(([v, l]) =>
            `<option value="${v}" ${f.scheduler === v ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('')}
        </select>
      </label>
      <label>Status
        <select data-filter="runs.status">
          ${['', 'SUCCESS', 'PARTIAL', 'FAILED', 'RUNNING'].map(v =>
            `<option value="${v}" ${f.status === v ? 'selected' : ''}>${v || 'All'}</option>`).join('')}
        </select>
      </label>
      <label>From <input type="date" data-filter="runs.date_from" value="${escapeHtml(f.date_from)}"></label>
      <label>To <input type="date" data-filter="runs.date_to" value="${escapeHtml(f.date_to)}"></label>
      <button class="btn btn-ghost btn-sm" id="schClearRuns">Clear</button>
      <span class="sch-count">${data.total} run(s)</span>
    </div>
    ${data.runs.length ? data.runs.map(runRow).join('')
                       : emptyState('No runs match these filters.')}`;

  wireFilters();
  wireRunLinks();
  document.getElementById('schClearRuns').addEventListener('click', () => {
    sch.filters.runs = { scheduler: '', status: '', date_from: '', date_to: '' };
    renderTab('runs');
  });
}

async function renderRunDetail(runId){
  const body = document.getElementById('schBody');
  const data = await api(`/api/scheduler/runs/${encodeURIComponent(runId)}`);
  const run = data.run;

  const breakdown = Object.entries(data.action_breakdown || {})
    .map(([action, count]) => `${actionBadge(action)} <span class="sch-count">${count}</span>`)
    .join(' ');

  body.innerHTML = `
    <button class="btn btn-ghost btn-sm" id="schBack">← All runs</button>

    <div class="sch-detail-head">
      <div>
        <div class="sch-task-name">${escapeHtml(run.scheduler_label)} ${runBadge(run)}</div>
        <div class="sch-task-meta">
          <code>${escapeHtml(run.run_id)}</code><br>
          For ${dateFmt(run.run_date)} · started ${dtFmt(run.started_at)}
          · finished ${dtFmt(run.finished_at)} · took ${durationFmt(run.duration_ms)}<br>
          Triggered by ${escapeHtml(run.trigger_source)}${run.hostname ? ` on ${escapeHtml(run.hostname)}` : ''}
        </div>
      </div>
      <div class="sch-task-right">
        <div class="sch-amount-big">${amountFmt(run.amount_total)}</div>
        <div class="sch-task-meta">
          ${run.items_total} considered · ${run.items_succeeded} done
          · ${run.items_skipped} skipped · ${run.items_failed} failed
        </div>
      </div>
    </div>

    ${run.error_message ? `<div class="sch-error">${escapeHtml(run.error_message)}</div>` : ''}
    ${breakdown ? `<div class="sch-breakdown">${breakdown}</div>` : ''}

    <div class="sch-section-title">What this run did</div>
    ${data.items.length ? data.items.map(itemRow).join('')
                        : emptyState('This run recorded no individual items.')}`;

  document.getElementById('schBack').addEventListener('click', () => {
    sch.openRunId = null;
    renderTab('runs');
  });
}


/* ══════════════════════════════════════════════════════════════
   ITEM ROW  (shared by run detail, Rent and Penalty)
   ══════════════════════════════════════════════════════════════ */

function itemRow(item){
  const who = [
    item.user_name ? escapeHtml(item.user_name) : null,
    item.shop_number ? `shop ${escapeHtml(item.shop_number)}` : null,
    item.bill_id ? `bill #${item.bill_id}` : null,
  ].filter(Boolean).join(' · ');

  const penaltyBits = item.penalty_amount !== null && item.penalty_amount !== undefined ? `
    <div class="sch-task-meta">
      Penalty now ${amountFmt(item.penalty_amount)}
      · ${item.penalty_days ?? 0} chargeable day(s)
      · ${item.penalty_rate ?? '—'}%/day
      ${item.bill_due_date ? ` · was due ${dateFmt(item.bill_due_date)}` : ''}
    </div>` : '';

  return `
    <div class="sch-task">
      <div>
        <div class="sch-task-name">${who || '—'}</div>
        <div class="sch-task-meta">
          ${dateFmt(item.run_date)}
          ${item.period_key ? ` · ${escapeHtml(item.period_key)}` : ''}
          ${item.scheduler ? ` · ${escapeHtml(schedulerLabel(item.scheduler))}` : ''}
        </div>
        ${penaltyBits}
        ${item.reason ? `<div class="sch-reason">${escapeHtml(item.reason)}</div>` : ''}
        ${item.error_message ? `<div class="sch-error">${escapeHtml(item.error_message)}</div>` : ''}
      </div>
      <div class="sch-task-right">
        ${actionBadge(item.action)}
        ${item.amount !== null && item.amount !== undefined
          ? `<div class="sch-amount">${amountFmt(item.amount)}</div>` : ''}
      </div>
    </div>`;
}


/* ══════════════════════════════════════════════════════════════
   RENT  (which day, which customer, and what was skipped)
   ══════════════════════════════════════════════════════════════ */

async function renderRent(){
  const body = document.getElementById('schBody');
  const f = sch.filters.rent;
  const data = await api('/api/scheduler/items' + qs({
    scheduler: 'auto_rent_generation',
    action: f.action,
    period_key: f.period_key,
    user_id: f.user,
    limit: 200,
  }));

  const created = data.items.filter(i => i.action === 'RENT_CREATED');
  const total = created.reduce((sum, i) => sum + Number(i.amount || 0), 0);

  body.innerHTML = `
    <div class="sch-filters">
      <label>Outcome
        <select data-filter="rent.action">
          <option value="">All</option>
          ${['RENT_CREATED', 'SKIPPED_DUPLICATE', 'SKIPPED_NO_SHOP', 'SKIPPED_ZERO_RENT', 'FAILED']
            .map(v => `<option value="${v}" ${f.action === v ? 'selected' : ''}>${escapeHtml(ACTIONS[v].label)}</option>`).join('')}
        </select>
      </label>
      <label>Month <input type="text" placeholder="RENT-2026-09" data-filter="rent.period_key" value="${escapeHtml(f.period_key)}"></label>
      <label>Customer ID <input type="number" placeholder="any" data-filter="rent.user" value="${escapeHtml(f.user)}"></label>
      <button class="btn btn-ghost btn-sm" id="schClearRent">Clear</button>
      <span class="sch-count">${data.total} record(s) · ${created.length} bill(s) created · ${amountFmt(total)}</span>
    </div>
    ${data.items.length ? data.items.map(itemRow).join('')
                        : emptyState('Nothing recorded yet. Rent activity appears here after the rent script runs.')}`;

  wireFilters();
  document.getElementById('schClearRent').addEventListener('click', () => {
    sch.filters.rent = { action: '', period_key: '', user: '' };
    renderTab('rent');
  });
}


/* ══════════════════════════════════════════════════════════════
   PENALTY  (which bill, how much, and why)
   ══════════════════════════════════════════════════════════════ */

async function renderPenalty(){
  const body = document.getElementById('schBody');
  const f = sch.filters.penalty;
  const data = await api('/api/scheduler/items' + qs({
    scheduler: 'due_bill_penalty',
    action: f.action,
    user_id: f.user,
    limit: 200,
  }));

  const applied = data.items.filter(i => i.action === 'PENALTY_APPLIED');
  const total = applied.reduce((sum, i) => sum + Number(i.amount || 0), 0);

  body.innerHTML = `
    <div class="sch-filters">
      <label>Outcome
        <select data-filter="penalty.action">
          <option value="">All</option>
          ${['PENALTY_APPLIED', 'PENALTY_REDUCED', 'FAILED']
            .map(v => `<option value="${v}" ${f.action === v ? 'selected' : ''}>${escapeHtml(ACTIONS[v].label)}</option>`).join('')}
        </select>
      </label>
      <label>Customer ID <input type="number" placeholder="any" data-filter="penalty.user" value="${escapeHtml(f.user)}"></label>
      <button class="btn btn-ghost btn-sm" id="schClearPenalty">Clear</button>
      <span class="sch-count">${data.total} record(s) · ${amountFmt(total)} charged</span>
    </div>
    <div class="sch-note">
      Every row carries the arithmetic as it stood on the night it was applied —
      the rate, the grace period and the day count that produced the figure.
      Changing the rate later does not rewrite what a tenant was already charged.
    </div>
    ${data.items.length ? data.items.map(itemRow).join('')
                        : emptyState('No penalties recorded. If the penalty scheduler is switched off in Settings, nothing is charged.')}`;

  wireFilters();
  document.getElementById('schClearPenalty').addEventListener('click', () => {
    sch.filters.penalty = { action: '', user: '' };
    renderTab('penalty');
  });
}


/* ══════════════════════════════════════════════════════════════
   REPORTS
   ══════════════════════════════════════════════════════════════ */

async function renderReports(){
  const body = document.getElementById('schBody');
  const f = sch.filters.reports;
  const data = await api(`/api/scheduler/reports/${f.granularity}` + qs({ scheduler: f.scheduler }));

  const key = { daily: 'date', monthly: 'month', yearly: 'year' }[f.granularity];
  const totals = data.rows.reduce((acc, r) => ({
    rent: acc.rent + r.rent_amount,
    penalty: acc.penalty + r.penalty_amount,
    bills: acc.bills + r.rent_bills_created,
    penalties: acc.penalties + r.penalties_applied,
  }), { rent: 0, penalty: 0, bills: 0, penalties: 0 });

  body.innerHTML = `
    <div class="sch-filters">
      <label>Period
        <select data-filter="reports.granularity">
          ${['daily', 'monthly', 'yearly'].map(v =>
            `<option value="${v}" ${f.granularity === v ? 'selected' : ''}>${v[0].toUpperCase() + v.slice(1)}</option>`).join('')}
        </select>
      </label>
      <label>Scheduler
        <select data-filter="reports.scheduler">
          <option value="">Both</option>
          ${Object.entries(SCHEDULERS).map(([v, l]) =>
            `<option value="${v}" ${f.scheduler === v ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('')}
        </select>
      </label>
    </div>

    <div class="sch-status-row">
      <div class="sch-stat"><div class="label">Rent raised</div>
        <div class="value">${amountFmt(totals.rent)}</div>
        <div class="sub">${totals.bills} bill(s)</div></div>
      <div class="sch-stat"><div class="label">Penalties charged</div>
        <div class="value">${amountFmt(totals.penalty)}</div>
        <div class="sub">${totals.penalties} application(s)</div></div>
    </div>

    <!-- Rent and penalty are totalled apart on purpose: they are different
         kinds of money, and one combined figure would mislead. -->
    ${data.rows.length ? `
      <table class="sch-table">
        <thead><tr>
          <th>${escapeHtml(key)}</th>
          <th class="num">Rent bills</th><th class="num">Rent amount</th>
          <th class="num">Penalties</th><th class="num">Penalty amount</th>
        </tr></thead>
        <tbody>
          ${data.rows.map(r => `
            <tr>
              <td>${escapeHtml(r[key])}</td>
              <td class="num">${r.rent_bills_created || '—'}</td>
              <td class="num">${r.rent_amount ? amountFmt(r.rent_amount) : '—'}</td>
              <td class="num">${r.penalties_applied || '—'}</td>
              <td class="num">${r.penalty_amount ? amountFmt(r.penalty_amount) : '—'}</td>
            </tr>`).join('')}
        </tbody>
      </table>` : emptyState('Nothing to report for this period yet.')}`;

  wireFilters();
}


/* ══════════════════════════════════════════════════════════════
   FILTER WIRING  (shared by every tab that has filters)
   ══════════════════════════════════════════════════════════════ */

function wireFilters(){
  document.querySelectorAll('[data-filter]').forEach(el => {
    const [tab, field] = el.dataset.filter.split('.');
    const event = el.tagName === 'SELECT' || el.type === 'date' ? 'change' : 'input';
    let debounce;
    el.addEventListener(event, () => {
      sch.filters[tab][field] = el.value;
      clearTimeout(debounce);
      // Typing in a text box should not fire a request per keystroke.
      debounce = setTimeout(() => renderTab(tab).catch(e => showToast(e.message, 'error')),
                            event === 'input' ? 400 : 0);
    });
  });
}


/* ══════════════════════════════════════════════════════════════
   TAB DISPATCH
   ══════════════════════════════════════════════════════════════ */

/* Wrapped in arrows rather than referenced directly: this file is loaded
   BEFORE settings.js, so naming renderSettings here would capture undefined
   and the Settings tab would throw the moment it was opened. The arrow defers
   the lookup to the click, by which point every file has loaded. */
const TABS = {
  overview: () => renderOverview(),
  runs:     () => renderRuns(),
  rent:     () => renderRent(),
  penalty:  () => renderPenalty(),
  reports:  () => renderReports(),
  settings: () => renderSettings(),      // settings.js
};

async function renderTab(tab){
  const render = TABS[tab];
  if (!render) return;
  await render();
}

function switchTab(tab){
  document.querySelectorAll('[data-tab]').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab));
  sch.tab = tab;
  renderTab(tab).catch(err => showToast(err.message, 'error'));
}

async function refreshAll(){
  try {
    await loadSummary();
    await renderTab(sch.tab);
  } catch (err) {
    showToast(err.message, 'error');
  }
}
