/* ================================================================
   USER/js/ui-helpers.js — split from the old USER/script.js
   Contains: SHARED UI HELPERS (skeleton/error/stamp/warn) and the
   Monthly Ledger PDF build/download/print/share helpers.
   ================================================================ */

/* ================================================================
   SHARED UI HELPERS
   ================================================================ */
function skeletonHtml(){
  return `<div class="table-wrap">${Array.from({length:5}).map(()=>'<div class="skeleton-row"></div>').join('')}</div>`;
}
function errorBannerHtml(msg){
  return `<div class="error-banner">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
    <span>${escapeHtml(msg)}</span>
    <button id="retryBtn" class="btn btn-sm btn-ghost" style="margin-left:auto; border-color:var(--danger); color:var(--danger);">Retry</button>
  </div>`;
}
function stampHtml(status){
  const cls = status === 'paid' ? 'paid' : status === 'partial' ? 'partial' : 'pending';
  return `<span class="stamp ${cls}">${escapeHtml(status)}</span>`;
}
function warnIcon(){
  return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
}

/* ---------- Monthly Ledger: PDF build / download / print / share ---------- */
const currencyPdf = (n) => 'Rs. ' + Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function buildMonthlyLedgerDoc(tenantName, tenantMobile, year, monthly, summary, complexName){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const marginX = 40;
  const pageW = doc.internal.pageSize.getWidth();
  let y = 46;
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  doc.setFillColor(58, 54, 46);
  doc.rect(0, 0, pageW, 6, 'F');

  doc.setFontSize(12); doc.setFont(undefined, 'bold'); doc.setTextColor(58, 54, 46);
  doc.text('LEDGER', marginX, y);
  doc.setFontSize(9); doc.setFont(undefined, 'normal'); doc.setTextColor(130);
  doc.text('Shop & Tenant Management' + (complexName ? '  ·  ' + complexName : ''), marginX + 55, y);
  y += 24;

  doc.setDrawColor(220); doc.setLineWidth(0.6);
  doc.line(marginX, y, pageW - marginX, y);
  y += 22;

  doc.setFontSize(17); doc.setFont(undefined, 'bold'); doc.setTextColor(20);
  doc.text('Monthly Ledger', marginX, y); y += 20;
  doc.setFontSize(10.5); doc.setFont(undefined, 'bold'); doc.setTextColor(60);
  doc.text(tenantName, marginX, y);
  if (tenantMobile){
    doc.setFont(undefined, 'normal'); doc.setTextColor(120);
    doc.text(tenantMobile, marginX + doc.getTextWidth(tenantName) + 10, y);
  }
  y += 15;
  doc.setFontSize(9); doc.setFont(undefined, 'normal'); doc.setTextColor(130);
  doc.text(`Year ${year}   ·   Generated ${new Date().toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}`, marginX, y);
  y += 24;

  const kpis = [
    { label: 'OUTSTANDING DUES', value: currencyPdf(summary.outstanding_dues), color: [176, 62, 46] },
    { label: 'TOTAL BILLED', value: currencyPdf(summary.total_billed), color: [20,20,20] },
    { label: 'TOTAL PAID', value: currencyPdf(summary.total_paid), color: [46, 110, 62] },
    { label: 'DEPOSIT ON FILE', value: currencyPdf(summary.deposit_on_file), color: [20,20,20] },
  ];
  const kpiW = (pageW - marginX*2) / 4;
  kpis.forEach((it, i) => {
    const x = marginX + i * kpiW;
    doc.setDrawColor(225); doc.setLineWidth(0.5);
    if (i > 0) doc.line(x, y - 14, x, y + 8);
    doc.setFontSize(7.5); doc.setFont(undefined, 'bold'); doc.setTextColor(140);
    doc.text(it.label, x, y);
    doc.setFontSize(12.5); doc.setFont(undefined, 'bold'); doc.setTextColor(...it.color);
    doc.text(it.value, x, y + 16);
  });
  y += 36;
  doc.setDrawColor(220); doc.line(marginX, y, pageW - marginX, y);
  y += 20;
  doc.setTextColor(0);

  const totalBilled = monthly.reduce((s,m) => s + m.billed, 0);
  const totalPaid = monthly.reduce((s,m) => s + m.paid, 0);
  const totalRemaining = monthly.reduce((s,m) => s + m.remaining, 0);
  const totalBillsCount = monthly.reduce((s,m) => s + m.bills_count, 0);
  const overallStatus = totalRemaining === 0 ? 'Paid' : (totalPaid > 0 ? 'Partial' : 'Pending');

  const statusColorMap = { Paid: [46,110,62], Partial: [176,130,30], Pending: [176,62,46], 'No bills': [150,150,150] };

  doc.autoTable({
    startY: y,
    head: [['Month','Bills','Billed','Paid','Remaining','Status']],
    body: monthly.map((m, idx) => [
      monthNames[idx], String(m.bills_count),
      m.bills_count ? currencyPdf(m.billed) : '—',
      m.bills_count ? currencyPdf(m.paid) : '—',
      m.bills_count ? currencyPdf(m.remaining) : '—',
      m.status,
    ]),
    foot: [['Year total', String(totalBillsCount), currencyPdf(totalBilled), currencyPdf(totalPaid), currencyPdf(totalRemaining), overallStatus]],
    margin: { left: marginX, right: marginX },
    styles: { fontSize: 8.5, cellPadding: { top:6, bottom:6, left:8, right:8 }, lineColor: [230,228,222], lineWidth: 0.5 },
    headStyles: { fillColor: [58, 54, 46], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    footStyles: { fillColor: [240, 237, 230], textColor: [20,20,20], fontStyle: 'bold', fontSize: 8.5 },
    alternateRowStyles: { fillColor: [250, 249, 246] },
    columnStyles: {
      0: { fontStyle: 'bold' },
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'left' },
    },
    didParseCell: (d) => {
      if (d.section === 'body' && d.column.index === 5){
        const c = statusColorMap[d.cell.raw] || [90,90,90];
        d.cell.styles.textColor = c; d.cell.styles.fontStyle = 'bold';
      }
      if (d.section === 'body' && d.column.index === 4 && d.cell.raw !== '—'){
        d.cell.styles.textColor = [176, 62, 46];
      }
    },
  });

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++){
    doc.setPage(i);
    const w = doc.internal.pageSize.getWidth(), h = doc.internal.pageSize.getHeight();
    doc.setDrawColor(230); doc.setLineWidth(0.5);
    doc.line(marginX, h - 34, w - marginX, h - 34);
    doc.setFontSize(8); doc.setFont(undefined, 'normal'); doc.setTextColor(140);
    doc.text('Ledger — Shop & Tenant Management', marginX, h - 20);
    doc.text(`Page ${i} of ${pageCount}`, w - marginX, h - 20, { align: 'right' });
  }
  return doc;
}


function downloadMonthlyLedgerPdf(source){
  const d = source === 'tenant' ? state._lastTpLedgerData : state._lastAdminLedgerData;
  if (!d) return;
  const doc = buildMonthlyLedgerDoc(d.tenantName, d.tenantMobile, d.year, d.monthly, d.summary, d.complexName);
  doc.save(`ledger-${d.tenantName.replace(/\s+/g,'_')}-${d.year}.pdf`);
}

function printMonthlyLedgerPdf(source){
  const d = source === 'tenant' ? state._lastTpLedgerData : state._lastAdminLedgerData;
  if (!d) return;
  const doc = buildMonthlyLedgerDoc(d.tenantName, d.tenantMobile, d.year, d.monthly, d.summary, d.complexName);
  doc.autoPrint();
  window.open(doc.output('bloburl'), '_blank');
}

async function shareMonthlyLedgerPdf(source){
  const d = source === 'tenant' ? state._lastTpLedgerData : state._lastAdminLedgerData;
  if (!d) return;
  const doc = buildMonthlyLedgerDoc(d.tenantName, d.tenantMobile, d.year, d.monthly, d.summary, d.complexName);
  const fileName = `ledger-${d.tenantName.replace(/\s+/g,'_')}-${d.year}.pdf`;
  const blob = doc.output('blob');
  const file = new File([blob], fileName, { type: 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: `Ledger ${d.year} — ${d.tenantName}`, text: `Monthly ledger for ${d.year}` });
    } catch (err) {
      if (err.name !== 'AbortError') showToast('Could not share — downloading instead', 'error');
      doc.save(fileName);
    }
  } else {
    doc.save(fileName);
    showToast('Sharing not supported on this device/browser — file downloaded instead', 'success');
  }
}
