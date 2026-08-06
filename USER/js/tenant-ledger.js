/* ================================================================
   USER/js/tenant-ledger.js — split from the old USER/script.js
   Contains: toggleCollapse, the bills/payments year→month
   drill-down renderers (renderTpBillDrill/renderTpPayDrill and
   their nav helpers), and the Monthly Ledger table renderers
   (renderTenantLedger, renderMonthSummary). Used by tenant-dashboard.js.
   ================================================================ */
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

// ── "Ask about a month" plain-language answer panel ──
// Filters already-loaded tpBillsData/tpPaysData by year+month (no extra API
// call), groups bills by type (Rent/Electricity/Water/...), and answers the
// two questions tenants actually ask: "what do I owe for this month" and
// "what did I pay this month" — in plain language, not a table.
function renderTpMonthAnswer(year, month){
  year = Number(year); month = Number(month);
  const monthLabel = `${monthNamesShort[month-1]} ${year}`;

  const monthBills = (tpBillsData||[]).filter(b => {
    if (!b.bill_date) return false;
    const d = new Date(b.bill_date);
    return d.getFullYear() === year && d.getMonth()+1 === month;
  });
  const monthPays = (tpPaysData||[]).filter(p => {
    if (!p.payment_date) return false;
    const d = new Date(p.payment_date);
    return d.getFullYear() === year && d.getMonth()+1 === month;
  });

  if (!monthBills.length && !monthPays.length) {
    return `<div class="empty-compact">No bills or payments recorded for ${monthLabel}.</div>`;
  }

  const byType = {};
  monthBills.forEach(b => {
    const t = b.bill_type || 'Other';
    if (!byType[t]) byType[t] = { amount:0, paid:0, pending:0, status:'paid' };
    byType[t].amount += Number(b.amount||0);
    byType[t].paid += Number(b.paid_amount||0);
    byType[t].pending += Number(b.pending_amount||0);
    if (b.status !== 'paid') byType[t].status = b.status;
  });

  const tilesHtml = Object.keys(byType).length ? `
    <div class="tp-answer-grid">
      ${Object.keys(byType).map(t => {
        const info = byType[t];
        const settled = info.pending <= 0;
        return `
        <div class="tp-answer-card">
          <div class="tp-answer-type">${escapeHtml(t)}</div>
          <div class="tp-answer-amt">${currency(info.amount)}</div>
          <div class="tp-answer-status ${settled?'ok':'due'}">${settled ? 'Fully paid' : `${currency(info.pending)} still due`}</div>
        </div>`;
      }).join('')}
    </div>` : `<div class="empty-compact">No bills for ${monthLabel}.</div>`;

  const paysHtml = monthPays.length ? `
    <div style="margin-top:16px;">
      <div style="font-size:12px; font-weight:700; color:var(--muted); text-transform:uppercase; letter-spacing:.04em; margin-bottom:8px;">Payments you made in ${monthLabel}</div>
      ${monthPays.map(p=>`
        <div class="tenant-card tp-pay-row">
          <div class="row1"><span class="title mono">${currency(p.amount)}</span><span class="meta">${escapeHtml(p.payment_method)}</span></div>
          <div class="meta">Paid ${dateFmt(p.payment_date)}${p.remarks?' · '+escapeHtml(p.remarks):''}</div>
        </div>`).join('')}
    </div>` : `
    <div style="margin-top:16px;">
      <div class="empty-compact">You made no payments in ${monthLabel}.</div>
    </div>`;

  const totalPending = monthBills.reduce((s,b)=>s+Number(b.pending_amount||0),0);
  const totalPaidThisMonth = monthPays.reduce((s,p)=>s+Number(p.amount||0),0);

  return `
    <div style="display:flex; gap:16px; flex-wrap:wrap; margin-bottom:14px; font-size:13px;">
      <div><span style="color:var(--muted);">Billed in ${monthLabel}:</span> <strong class="mono">${currency(monthBills.reduce((s,b)=>s+Number(b.amount||0),0))}</strong></div>
      <div><span style="color:var(--muted);">Paid in ${monthLabel}:</span> <strong class="mono" style="color:var(--success);">${currency(totalPaidThisMonth)}</strong></div>
      ${totalPending>0 ? `<div><span style="color:var(--muted);">Still due:</span> <strong class="mono" style="color:var(--rust);">${currency(totalPending)}</strong></div>` : ''}
    </div>
    ${tilesHtml}
    ${paysHtml}
  `;
}

// ── Bills drill-down (kept for compatibility; no longer linked from the
// main dashboard flow, which now uses renderTpMonthAnswer above, but left
// callable in case a future screen wants the full year→month browse UI) ──
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
    crumb.innerHTML = `<span onclick="tpBillGoRoot()">All Years</span><span class="sep">›</span><span class="active">${tpBillDrill.year}</span>`;
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

  crumb.innerHTML = `<span onclick="tpBillGoRoot()">All Years</span><span class="sep">›</span><span onclick="tpBillGoYear(${tpBillDrill.year})">${tpBillDrill.year}</span><span class="sep">›</span><span class="active">${monthNamesShort[tpBillDrill.month-1]}</span>`;
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
    crumb.innerHTML = `<span onclick="tpPayGoRoot()">All Years</span><span class="sep">›</span><span class="active">${tpPayDrill.year}</span>`;
    const months = yearData ? Object.keys(yearData.months).sort((a,b)=>a-b) : [];
    area.innerHTML = months.length ? `<div class="drill-grid">${months.map(m=>`
      <div class="drill-card" onclick="tpPayGoMonth(${m})">
        <div class="dc-title">${monthNamesShort[m-1]}</div>
        <div class="dc-count">${yearData.months[m].count} payment${yearData.months[m].count===1?'':'s'}</div>
        <div class="dc-amt">${currency(yearData.months[m].total)}</div>
      </div>`).join('')}</div>` : '<div class="empty-compact">No payments found.</div>';
    return;
  }

  crumb.innerHTML = `<span onclick="tpPayGoRoot()">All Years</span><span class="sep">›</span><span onclick="tpPayGoYear(${tpPayDrill.year})">${tpPayDrill.year}</span><span class="sep">›</span><span class="active">${monthNamesShort[tpPayDrill.month-1]}</span>`;
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
