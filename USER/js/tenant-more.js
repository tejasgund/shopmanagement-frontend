/* ================================================================
   USER/js/tenant-more.js — the "⋮" sheet

   Everything that isn't a daily job: deposit, agreement, profile,
   statement download, sign out. Kept off the main tabs so the four
   things a tenant actually does stay one tap away.
   ================================================================ */

function openMoreSheet(){
  const depositPaid = tp.deposits.reduce((s, d) => s + Number(d.amount || 0), 0);
  const depositDue  = tp.shops.reduce((s, sh) => s + Number(sh.shop_deposit || 0), 0);
  const p = tp.profile || {};

  openModal('More', `
    <div class="tp-sheet">

      <div class="tp-sheet-sub">How to pay</div>
      <div class="tp-pay-line">${escapeHtml(paymentMethodsText())}</div>
      <div class="tp-sheet-hint">
        Payments are recorded by the office. Once recorded, they appear under the
        “I paid” tab, usually the same day.
      </div>

      ${depositDue > 0 ? `
      <div class="tp-sheet-sub">Security deposit</div>
      <div class="tp-kv"><span>Deposit for your shop</span><strong>${currency(depositDue)}</strong></div>
      <div class="tp-kv"><span>You have paid</span><strong>${currency(depositPaid)}</strong></div>
      ${depositPaid < depositDue
        ? `<div class="tp-kv"><span>Still to pay</span><strong class="tp-red">${currency(depositDue - depositPaid)}</strong></div>`
        : `<div class="tp-kv"><span>Status</span><strong class="tp-green">Fully paid ✓</strong></div>`}
      ` : ''}

      <div class="tp-sheet-sub">My details</div>
      <div class="tp-kv"><span>Name</span><strong>${escapeHtml(p.name || '—')}</strong></div>
      <div class="tp-kv"><span>Mobile</span><strong>${escapeHtml(p.mobile || '—')}</strong></div>
      ${p.email ? `<div class="tp-kv"><span>Email</span><strong>${escapeHtml(p.email)}</strong></div>` : ''}
      ${tp.shops.map(s => `
        <div class="tp-kv">
          <span>${escapeHtml(s.shop_number || 'Shop')}</span>
          <strong>${currency(s.shop_rent)} / month</strong>
        </div>
        ${s.agreement_end_date
          ? `<div class="tp-kv"><span class="tp-kv-sub">Agreement ends</span><strong>${dateFmt(s.agreement_end_date)}</strong></div>`
          : ''}`).join('')}
      <div class="tp-sheet-hint">
        Something wrong here? The office can correct it — these details are read-only.
      </div>

      <div class="tp-sheet-sub">Statement</div>
      <button class="tp-btn tp-btn-ghost tp-btn-block" id="tpStatementBtn">
        Download my statement (PDF)
      </button>

      <button class="tp-btn tp-btn-danger tp-btn-block" id="tpSignOutBtn" style="margin-top:22px;">
        Sign out
      </button>
    </div>
  `, `<button class="tp-btn tp-btn-primary tp-btn-block" id="tpMoreClose">Close</button>`);

  document.getElementById('tpMoreClose').addEventListener('click', closeModal);
  document.getElementById('tpSignOutBtn').addEventListener('click', logout);
  document.getElementById('tpStatementBtn').addEventListener('click', downloadTenantStatement);
}

/* ================================================================
   HOW TO PAY — methods only, never account numbers or UPI IDs.

   Comes from the backend setting `payment.methods` if you add one to
   /api/settings/public; otherwise this default is used. To change it
   without any backend work, edit PAYMENT_METHODS_FALLBACK in core.js.
   ================================================================ */
function paymentMethodsText(){
  return (tp.publicSettings && tp.publicSettings.payment_methods)
      || PAYMENT_METHODS_FALLBACK;
}

/* ================================================================
   STATEMENT PDF
   One page: what you were billed, what you paid, what's left.
   ================================================================ */
function downloadTenantStatement(){
  if (!window.jspdf){ showToast('Statement is not available on this device', 'error'); return; }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const marginX = 40;
  const pageW = doc.internal.pageSize.getWidth();
  const money = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  let y = 50;

  doc.setFillColor(21, 32, 27);
  doc.rect(0, 0, pageW, 6, 'F');

  doc.setFontSize(17); doc.setFont(undefined, 'bold'); doc.setTextColor(20);
  doc.text('My Statement', marginX, y); y += 22;

  doc.setFontSize(11); doc.setFont(undefined, 'normal'); doc.setTextColor(60);
  doc.text(tp.profile?.name || '', marginX, y); y += 15;
  doc.setFontSize(9); doc.setTextColor(130);
  doc.text(`${tp.profile?.mobile || ''}   ·   Generated ${new Date().toLocaleDateString('en-IN')}`, marginX, y);
  y += 24;

  const billed = tp.bills.reduce((s, b) => s + Number(b.amount || 0), 0);
  const paid   = tp.bills.reduce((s, b) => s + Number(b.paid_amount || 0), 0);
  const left   = tpTotalDue();

  doc.setDrawColor(220); doc.line(marginX, y, pageW - marginX, y); y += 20;
  [['Total billed', billed], ['Total paid', paid], ['Still to pay', left]].forEach(([label, val], i) => {
    const x = marginX + i * 165;
    doc.setFontSize(8.5); doc.setTextColor(130); doc.setFont(undefined, 'normal');
    doc.text(label.toUpperCase(), x, y);
    doc.setFontSize(13); doc.setFont(undefined, 'bold');
    doc.setTextColor(...(label === 'Still to pay' && left > 0 ? [176, 62, 46] : [20, 20, 20]));
    doc.text(money(val), x, y + 17);
  });
  y += 42;

  doc.setTextColor(20); doc.setFont(undefined, 'bold'); doc.setFontSize(11);
  doc.text('Your bills', marginX, y); y += 8;
  doc.autoTable({
    startY: y,
    head: [['Date', 'For', 'Amount', 'Paid', 'Left']],
    body: [...tp.bills]
      .sort((a, b) => new Date(b.bill_date) - new Date(a.bill_date))
      .map(b => [
        dateFmt(b.bill_date), billTypeLabel(b.bill_type),
        money(b.amount), money(b.paid_amount), money(b.pending_amount),
      ]),
    margin: { left: marginX, right: marginX },
    styles: { fontSize: 8.5, cellPadding: 5 },
    headStyles: { fillColor: [47, 111, 79] },
  });
  y = doc.lastAutoTable.finalY + 22;

  const groups = groupedPayments();
  if (groups.length){
    doc.setFont(undefined, 'bold'); doc.setFontSize(11); doc.setTextColor(20);
    doc.text('What you paid', marginX, y); y += 8;
    doc.autoTable({
      startY: y,
      head: [['Date', 'Method', 'Amount', 'Put towards']],
      body: groups.map(g => [
        dateFmt(g.date), g.method || '—', money(g.total),
        g.parts.length > 1 ? `${g.parts.length} bills` : '1 bill',
      ]),
      margin: { left: marginX, right: marginX },
      styles: { fontSize: 8.5, cellPadding: 5 },
      headStyles: { fillColor: [47, 111, 79] },
    });
  }

  const pages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++){
    doc.setPage(i);
    const h = doc.internal.pageSize.getHeight();
    doc.setFontSize(8); doc.setTextColor(140); doc.setFont(undefined, 'normal');
    doc.text('Computer generated statement — no signature required', marginX, h - 22);
    doc.text(`Page ${i} of ${pages}`, pageW - marginX, h - 22, { align: 'right' });
  }

  doc.save(`statement-${(tp.profile?.name || 'me').replace(/\s+/g, '_')}.pdf`);
  showToast('Statement downloaded', 'success');
}
