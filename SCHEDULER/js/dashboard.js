/* ================================================================
   SCHEDULER/js/dashboard.js — the monitoring views.

   Every list is rendered from what the API returns. There is no task
   catalogue in this file: names, labels and schedules all come from
   the server's registry, so a task added in the backend shows up here
   with no frontend change. That is a requirement, not an accident.
   ================================================================ */

async function loadStatus(){
  sch.status = await api('/api/scheduler/status');
  renderStatus();
}

function renderStatus(){
  const s = sch.status;
  if (!s) return;
  const on = s.scheduler_enabled;
  const failed = s.failed_count || 0;
  const missed = s.missed_count || 0;

  document.getElementById('schStatus').innerHTML = `
    <div class="sch-stat ${on ? 'is-good' : 'is-bad'}">
      <div class="label">Scheduler</div>
      <div class="value">${on ? 'ENABLED' : 'DISABLED'}</div>
      <div class="sub">${on ? 'tasks will process' : 'cron runs, nothing processes'}</div>
    </div>
    <div class="sch-stat">
      <div class="label">Last run</div>
      <div class="value" style="font-size:15px;">${dtFmt(s.last_run && s.last_run.finished_at)}</div>
      <div class="sub">${s.last_run ? escapeHtml(s.last_run.label) + ' · ' + escapeHtml(s.last_run.status) : 'never run'}</div>
    </div>
    <div class="sch-stat">
      <div class="label">Next expected</div>
      <div class="value" style="font-size:15px;">${dtFmt(s.next_expected_run && s.next_expected_run.scheduled_for)}</div>
      <div class="sub">${s.next_expected_run ? escapeHtml(s.next_expected_run.label) : 'nothing scheduled'}</div>
    </div>
    <div class="sch-stat">
      <div class="label">Last success</div>
      <div class="value" style="font-size:15px;">${dtFmt(s.last_successful_run && s.last_successful_run.finished_at)}</div>
      <div class="sub">${s.last_successful_run ? escapeHtml(s.last_successful_run.label) : '—'}</div>
    </div>
    <div class="sch-stat ${failed ? 'is-bad' : ''}">
      <div class="label">Failed</div>
      <div class="value">${failed}</div>
      <div class="sub">${failed ? 'needs attention' : 'none'}</div>
    </div>
    <div class="sch-stat ${missed ? 'is-warn' : ''}">
      <div class="label">Missed</div>
      <div class="value">${missed}</div>
      <div class="sub">${missed ? 'overdue, will be picked up' : 'nothing overdue'}</div>
    </div>`;
}

function taskRow(task, opts = {}){
  const bits = [];
  bits.push(`Scheduled ${dtFmt(task.scheduled_for)}`);
  if (task.run_date) bits.push(`for ${dateFmt(task.run_date)}`);
  if (task.started_at) bits.push(`started ${dtFmt(task.started_at)}`);
  if (task.duration_ms !== null && task.duration_ms !== undefined) bits.push(`took ${durationFmt(task.duration_ms)}`);
  if (task.status === 'RUNNING' && task.running_for_seconds !== null) {
    bits.push(`<span class="sch-elapsed">running ${elapsedFmt(task.running_for_seconds)}</span>`);
  }
  if (task.attempts > 1) bits.push(`${task.attempts} attempts`);

  const records = [];
  if (task.records_processed) records.push(`${task.records_processed} processed`);
  if (task.records_failed) records.push(`${task.records_failed} failed`);

  const canRetry = task.status === 'FAILED' || task.status === 'SKIPPED';

  return `
  <div class="sch-task">
    <div>
      <div class="sch-task-name">${escapeHtml(task.label || task.task_name)}</div>
      <div class="sch-task-meta">${bits.join(' · ')}</div>
      ${records.length ? `<div class="sch-task-meta"><strong>${records.join(' · ')}</strong></div>` : ''}
      ${task.skip_reason ? `<div class="sch-task-meta">Skipped: ${escapeHtml(task.skip_reason)}</div>` : ''}
      ${task.is_stuck ? `<div class="sch-task-meta" style="color:var(--rust);">Running unusually long — may have been interrupted.</div>` : ''}
      ${(opts.showError && task.error_message)
          ? `<div class="sch-error">${escapeHtml(task.error_message.split('\n').slice(0, 6).join('\n'))}</div>` : ''}
    </div>
    <div class="sch-task-right">
      ${statusBadge(task)}
      ${canRetry ? `<button class="btn btn-ghost" data-retry="${task.id}" style="padding:4px 11px; font-size:12px;">Retry</button>` : ''}
    </div>
  </div>`;
}

function renderList(tasks, emptyMessage, opts){
  if (!tasks || !tasks.length) return `<div class="sch-empty">${escapeHtml(emptyMessage)}</div>`;
  return tasks.map(t => taskRow(t, opts)).join('');
}

async function renderTab(tab){
  const body = document.getElementById('schBody');
  body.innerHTML = `<div class="sch-loading">Loading…</div>`;

  if (tab === 'settings') return renderSettingsTab(body);

  if (tab === 'overview'){
    const [running, missed, failed, upcoming] = await Promise.all([
      api('/api/scheduler/tasks?view=running&limit=20'),
      api('/api/scheduler/tasks?view=missed&limit=20'),
      api('/api/scheduler/tasks?view=failed&limit=10'),
      api('/api/scheduler/tasks?view=upcoming&limit=12'),
    ]);
    body.innerHTML = `
      <div class="sch-section-title">Currently running</div>
      ${renderList(running, 'Nothing running right now.')}
      <div class="sch-section-title">Missed / pending</div>
      ${renderList(missed, 'Nothing overdue — every expected run has been processed.')}
      <div class="sch-section-title">Failed</div>
      ${renderList(failed, 'No failures.', { showError: true })}
      <div class="sch-section-title">Upcoming</div>
      ${renderList(upcoming, 'No future runs registered yet.')}`;
    return attachRowHandlers();
  }

  const view = tab;
  const tasks = await api(`/api/scheduler/tasks?view=${encodeURIComponent(view)}&limit=100`);
  const empty = {
    running:  'Nothing running right now.',
    missed:   'Nothing overdue — every expected run has been processed.',
    failed:   'No failures.',
    upcoming: 'No future runs registered yet.',
    history:  'No runs recorded yet.',
  }[view] || 'Nothing to show.';

  body.innerHTML = renderList(tasks, empty, { showError: view === 'failed' || view === 'history' });
  attachRowHandlers();
}

function attachRowHandlers(){
  document.querySelectorAll('[data-retry]').forEach(btn =>
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Queuing…';
      try {
        const res = await api(`/api/scheduler/tasks/${btn.dataset.retry}/retry`, { method: 'POST' });
        showToast(res.message, 'success');
        await refreshAll();
      } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Retry';
      }
    }));
}

async function refreshAll(){
  try {
    await loadStatus();
    await renderTab(sch.tab);
  } catch (err) {
    document.getElementById('schBody').innerHTML =
      `<div class="sch-empty">Could not load the scheduler: ${escapeHtml(err.message)}</div>`;
  }
}
