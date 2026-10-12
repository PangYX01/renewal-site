(() => {
  const core = window.OneStopSSMReportsCore;
  const config = window.OneStopSSMReports;
  if (!core || !config || !document.querySelector('#onestop-ssm-reports')) return;

  const initialRange = core.presetRange('thisMonth', config.today);
  const state = { formId: 0, preset: 'thisMonth', startDate: initialRange.startDate, endDate: initialRange.endDate };
  const $ = (selector) => document.querySelector(selector);
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

  async function api(path, includePagination = false) {
    const query = core.buildQuery(state, includePagination);
    const response = await fetch(`${config.restBase}${path}${query ? `?${query}` : ''}`, { credentials: 'same-origin' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Could not load report data.');
    return data;
  }

  function summaryCard(key, label, metric, mode, status = '') {
    let main = '';
    let secondary = '';
    if (mode === 'moneyCount') {
      main = core.formatMoney(metric.amount);
      secondary = `${Number(metric.count || 0).toLocaleString()} paid transaction${Number(metric.count || 0) === 1 ? '' : 's'}`;
    } else if (mode === 'count') {
      main = Number(metric.count || 0).toLocaleString();
      secondary = 'submissions';
    } else if (mode === 'countMoney') {
      main = Number(metric.count || 0).toLocaleString();
      secondary = core.formatMoney(metric.amount);
    } else {
      main = Number(metric.count || 0).toLocaleString();
      secondary = core.formatPercent(metric.percentage);
    }
    const interactive = status ? ' reports-summary-card-action' : '';
    const attrs = status ? ` role="button" tabindex="0" data-drill-status="${escapeHtml(status)}" title="Open Entries. Entries date filters use Submitted At."` : '';
    return `<article class="reports-summary-card${interactive}"${attrs}><span class="reports-summary-label">${escapeHtml(label)}</span><strong>${escapeHtml(main)}</strong><span class="reports-summary-secondary">${escapeHtml(secondary)}</span></article>`;
  }

  function renderSummary(payload) {
    const s = payload.summary || {};
    $('#reports-summary').innerHTML = [
      summaryCard('total_revenue', 'Total Revenue', s.total_revenue || {}, 'moneyCount'),
      summaryCard('total_submissions', 'Total Submissions', s.total_submissions || {}, 'count'),
      summaryCard('paid', 'Paid', s.paid || {}, 'countMoney', 'paid'),
      summaryCard('pending', 'Pending', s.pending || {}, 'countMoney', 'pending'),
      summaryCard('failed', 'Failed', s.failed || {}, 'countMoney', 'failed'),
      summaryCard('refunded', 'Refunded', s.refunded || {}, 'countMoney', 'refunded'),
      summaryCard('verified', 'SSM Verified', s.verified || {}, 'countPercent'),
      summaryCard('unverified', 'Unverified / Manual', s.unverified || {}, 'countPercent'),
    ].join('');
  }


  function chartPointRadius(pointCount) {
    const total = Number(pointCount || 0);
    if (total >= 240) return 1.8;
    if (total >= 180) return 2.2;
    if (total >= 120) return 2.6;
    if (total >= 75) return 3.2;
    if (total >= 45) return 3.8;
    return 4.5;
  }

  function renderLineChart(container, series, valueFormatter) {
    if (!series?.length) { container.innerHTML = '<div class="reports-empty">No data for this period.</div>'; return; }
    const width = 1000, height = 320;
    const g = core.lineChartGeometry(series, width, height);
    const pointRadius = chartPointRadius(series.length);
    const plotBottom = height - g.padding.bottom;
    const plotRight = width - g.padding.right;
    const points = g.points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const yGrid = g.yTicks.map(t => `<g class="reports-chart-y-tick"><line x1="${g.padding.left}" y1="${t.y}" x2="${plotRight}" y2="${t.y}"></line><text class="reports-chart-y-label" x="${g.padding.left - 10}" y="${t.y + 4}" text-anchor="end">${escapeHtml(valueFormatter(t.value))}</text></g>`).join('');
    const dots = g.points.map(p => {
      const formatted = valueFormatter(p.value);
      return `<circle class="reports-chart-point" cx="${p.x}" cy="${p.y}" r="${pointRadius}" tabindex="0" data-chart-tooltip="1" data-chart-date="${escapeHtml(p.bucket)}" data-chart-value="${escapeHtml(formatted)}" aria-label="${escapeHtml(`${p.bucket}: ${formatted}`)}"><title>${escapeHtml(p.bucket)}: ${escapeHtml(formatted)}</title></circle>`;
    }).join('');
    const labelIndexes = core.axisLabelIndexes(g.points.length, 9);
    const labels = labelIndexes.map(index => {
      const p = g.points[index];
      const anchor = index === 0 ? 'start' : 'middle';
      return `<text class="reports-chart-x-label" x="${p.x}" y="${height - 22}" text-anchor="${anchor}">${escapeHtml(p.bucket)}</text>`;
    }).join('');
    container.innerHTML = `<svg class="reports-line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Trend chart">${yGrid}<line class="reports-chart-y-axis" x1="${g.padding.left}" y1="${g.padding.top}" x2="${g.padding.left}" y2="${plotBottom}"></line><line class="reports-chart-x-axis" x1="${g.padding.left}" y1="${plotBottom}" x2="${plotRight}" y2="${plotBottom}"></line><polyline points="${points}" fill="none"></polyline>${dots}${labels}</svg><div class="reports-chart-tooltip" hidden><strong></strong><span></span></div>`;

    const tooltip = container.querySelector('.reports-chart-tooltip');
    const showTooltip = (point) => {
      if (!tooltip || !point) return;
      tooltip.querySelector('strong').textContent = point.dataset.chartValue || '';
      tooltip.querySelector('span').textContent = point.dataset.chartDate || '';
      tooltip.hidden = false;
      const host = container.getBoundingClientRect();
      const dot = point.getBoundingClientRect();
      const rawLeft = dot.left + (dot.width / 2) - host.left;
      const left = Math.max(72, Math.min(container.clientWidth - 72, rawLeft));
      const top = Math.max(18, dot.top - host.top);
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
    };
    const hideTooltip = () => { if (tooltip) tooltip.hidden = true; };
    container.querySelectorAll('[data-chart-tooltip]').forEach(point => {
      point.addEventListener('pointerenter', () => showTooltip(point));
      point.addEventListener('pointerleave', hideTooltip);
      point.addEventListener('focus', () => showTooltip(point));
      point.addEventListener('blur', hideTooltip);
    });
  }

  function barRowPercent(label, percentage, secondary) {
    const pct = Math.max(0, Math.min(100, Number(percentage || 0)));
    return `<div class="reports-bar-row"><div><strong>${escapeHtml(label)}</strong><span>${escapeHtml(secondary)}</span></div><div class="reports-bar-track"><span style="width:${pct.toFixed(1)}%"></span></div></div>`;
  }

  function barRow(label, count, total, secondary) {
    const pct = total > 0 ? (Number(count || 0) / total) * 100 : 0;
    return barRowPercent(label, pct, secondary);
  }

  const methodColor = (method, index = 0) => {
    if (method === 'billplz') return '#2563eb';
    if (method === 'fiuu') return '#0f9f8f';
    if (method === 'razorpay') return '#475569';
    return ['#7c3aed','#d97706','#64748b'][index % 3];
  };

  function donutMarkup(items, centerValue, centerLabel) {
    if (!items.length) return '<div class="reports-empty">No data for this period.</div>';
    let cursor = 0;
    const stops = items.map((item) => {
      const next = Math.min(100, cursor + Number(item.percentage || 0));
      const stop = `${item.color} ${cursor.toFixed(1)}% ${next.toFixed(1)}%`;
      cursor = next;
      return stop;
    });
    if (cursor < 100) stops.push(`#edf1f5 ${cursor.toFixed(1)}% 100%`);
    const legend = items.map(item => `<div class="reports-chart-legend-row"><span class="reports-chart-key"><i style="background:${escapeHtml(item.color)}"></i><strong>${escapeHtml(item.label)}</strong></span><span>${escapeHtml(item.secondary)}</span></div>`).join('');
    return `<div class="reports-donut-layout"><div class="reports-donut" style="--donut-fill:conic-gradient(${stops.join(',')})"><div class="reports-donut-hole"><strong>${escapeHtml(centerValue)}</strong><span>${escapeHtml(centerLabel)}</span></div></div><div class="reports-chart-legend">${legend}</div></div>`;
  }

  function renderPaymentMethod(rows) {
    const container = $('#reports-payment-method');
    const items = (rows || []).map((row, index) => {
      const count = Number(row.paid_count || 0);
      return {
        label: row.label || row.payment_method || 'Other',
        percentage: Number(row.percentage || 0),
        color: methodColor(String(row.payment_method || ''), index),
        secondary: `${count.toLocaleString()} paid · ${core.formatMoney(row.revenue || 0)}`,
      };
    });
    const total = (rows || []).reduce((sum, row) => sum + Number(row.paid_count || 0), 0);
    container.innerHTML = donutMarkup(items, total.toLocaleString(), 'paid transactions');
  }

  function renderPaymentStatus(data) {
    const entries = [['paid','Paid'],['pending','Pending'],['failed','Failed'],['refunded','Refunded']];
    const total = entries.reduce((n, [key]) => n + Number(data?.[key]?.count || 0), 0);
    if (!total) { $('#reports-payment-status').innerHTML = '<div class="reports-empty">No data for this period.</div>'; return; }
    const segments = entries.map(([key,label]) => {
      const count = Number(data?.[key]?.count || 0);
      const percentage = total > 0 ? (count / total) * 100 : 0;
      return count > 0 ? `<span class="reports-stacked-segment ${escapeHtml(key)}" style="width:${percentage.toFixed(1)}%" title="${escapeHtml(`${label}: ${count.toLocaleString()}`)}"></span>` : '';
    }).join('');
    const legend = entries.map(([key,label]) => {
      const count = Number(data?.[key]?.count || 0);
      const percentage = total > 0 ? (count / total) * 100 : 0;
      return `<div class="reports-status-legend-item"><span class="status-badge ${escapeHtml(key)}">${escapeHtml(label)}</span><strong>${count.toLocaleString()}</strong><small>${escapeHtml(core.formatPercent(percentage))} · ${escapeHtml(core.formatMoney(data?.[key]?.amount || 0))}</small></div>`;
    }).join('');
    $('#reports-payment-status').innerHTML = `<div class="reports-stacked-bar" aria-label="Payment status distribution">${segments}</div><div class="reports-status-legend">${legend}</div>`;
  }

  function renderVerificationDonut(data) {
    const verified = data?.verified || {count:0,percentage:0};
    const unverified = data?.unverified || {count:0,percentage:0};
    const notStated = data?.not_stated || {count:0,percentage:0};
    const total = Number(verified.count || 0) + Number(unverified.count || 0) + Number(notStated.count || 0);
    const items = [
      { label:'Verified', count:Number(verified.count || 0), percentage:Number(verified.percentage || 0), color:'#16a34a' },
      { label:'Unverified / Manual', count:Number(unverified.count || 0), percentage:Number(unverified.percentage || 0), color:'#f59e0b' },
      { label:'Not Stated', count:Number(notStated.count || 0), percentage:Number(notStated.percentage || 0), color:'#94a3b8' },
    ].filter(item => item.count > 0).map(item => ({
      ...item,
      secondary: `${item.count.toLocaleString()} · ${core.formatPercent(item.percentage)}`,
    }));
    $('#reports-verification').innerHTML = donutMarkup(items, total.toLocaleString(), 'submissions');
  }

  function tableMarkup(headers, rows, emptyText = 'No data for this period.') {
    if (!rows.length) return `<div class="reports-empty">${escapeHtml(emptyText)}</div>`;
    return `<div class="reports-table-wrap"><table class="reports-table"><thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
  }

  function renderTable(container, headers, rows, emptyText = 'No data for this period.') {
    container.innerHTML = tableMarkup(headers, rows, emptyText);
  }

  function renderFormPerformance(forms) {
    const container = $('#reports-form-performance');
    if (!forms?.length) { container.innerHTML = '<div class="reports-empty">No data for this period.</div>'; return; }

    if (forms.length === 1) {
      const row = forms[0];
      const submissions = Number(row.submissions || 0);
      const paid = Number(row.paid_count || 0);
      const paidWidth = submissions > 0 ? Math.min(100, (paid / submissions) * 100) : 0;
      const kpis = [
        ['Submissions', submissions.toLocaleString()],
        ['Paid', paid.toLocaleString()],
        ['Conversion', core.formatPercent(row.conversion_rate)],
        ['Revenue', core.formatMoney(row.paid_revenue)],
        ['Avg. Paid Order', core.formatMoney(row.average_paid_order)],
      ].map(([label,value]) => `<div class="reports-single-form-kpi"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');

      container.innerHTML = `<div class="reports-single-form-head"><div><strong>${escapeHtml(row.form_title)}</strong><small>ID ${escapeHtml(row.form_id)}</small></div></div><div class="reports-single-form-kpis">${kpis}</div><div class="reports-single-form-compare"><div class="reports-single-form-compare-head"><strong>Submissions vs Paid</strong><span>${paid.toLocaleString()} of ${submissions.toLocaleString()} paid</span></div><div class="reports-single-form-track"><span class="submissions"></span><span class="paid" style="width:${paidWidth.toFixed(1)}%"></span></div><div class="reports-single-form-compare-legend"><span><i class="submissions"></i>Submissions ${submissions.toLocaleString()}</span><span><i class="paid"></i>Paid ${paid.toLocaleString()}</span></div></div>`;
      return;
    }

    const maxValue = Math.max(1, ...forms.flatMap(r => [Number(r.submissions || 0), Number(r.paid_count || 0)]));
    const groups = forms.map(r => {
      const submissions = Number(r.submissions || 0);
      const paid = Number(r.paid_count || 0);
      const subHeight = (submissions / maxValue) * 100;
      const paidHeight = (paid / maxValue) * 100;
      return `<div class="reports-grouped-category"><div class="reports-grouped-bars"><div class="reports-grouped-bar submissions" style="height:${subHeight.toFixed(1)}%" title="Submissions: ${submissions.toLocaleString()}"><span>${submissions.toLocaleString()}</span></div><div class="reports-grouped-bar paid" style="height:${paidHeight.toFixed(1)}%" title="Paid: ${paid.toLocaleString()}"><span>${paid.toLocaleString()}</span></div></div><strong title="${escapeHtml(r.form_title)}">${escapeHtml(r.form_title)}</strong><small>ID ${escapeHtml(r.form_id)}</small></div>`;
    }).join('');
    const chart = `<div class="reports-grouped-chart-wrap"><div class="reports-grouped-chart-legend"><span><i class="submissions"></i>Submissions</span><span><i class="paid"></i>Paid</span></div><div class="reports-grouped-chart">${groups}</div></div>`;
    const table = tableMarkup(['Form','Submissions','Paid','Revenue','Conversion','Avg. Paid Order'], forms.map(r => `<tr><td><strong>${escapeHtml(r.form_title)}</strong><small>ID ${escapeHtml(r.form_id)}</small></td><td>${Number(r.submissions || 0).toLocaleString()}</td><td>${Number(r.paid_count || 0).toLocaleString()}</td><td>${escapeHtml(core.formatMoney(r.paid_revenue))}</td><td>${escapeHtml(core.formatPercent(r.conversion_rate))}</td><td>${escapeHtml(core.formatMoney(r.average_paid_order))}</td></tr>`));
    container.innerHTML = chart + table;
  }

  function renderRenewalYears(rows) {
    const container = $('#reports-renewal-years');
    if (!rows?.length) { container.innerHTML = '<div class="reports-empty">No data for this period.</div>'; return; }
    const maxCount = Math.max(1, ...rows.map(r => Number(r.submissions || 0)));
    const columns = rows.map(r => {
      const years = Number(r.renewal_years || 0);
      const count = Number(r.submissions || 0);
      const percentage = Number(r.percentage || 0);
      const height = (count / maxCount) * 100;
      const label = years > 0 ? `${years} yr` : 'Not stated';
      return `<div class="reports-column-item"><div class="reports-column-value">${count.toLocaleString()}</div><div class="reports-column-track"><span class="reports-column-bar" style="height:${height.toFixed(1)}%" title="${escapeHtml(`${label}: ${count.toLocaleString()} (${core.formatPercent(percentage)})`)}"></span></div><strong>${escapeHtml(label)}</strong><small>${escapeHtml(core.formatPercent(percentage))}</small></div>`;
    }).join('');
    container.innerHTML = `<div class="reports-column-chart">${columns}</div>`;
  }

  function renderAddons(rows) {
    const container = $('#reports-addons');
    if (!rows?.length) { container.innerHTML = '<div class="reports-empty">No data for this period.</div>'; return; }
    container.innerHTML = rows.map(r => {
      const count = Number(r.selected_count || 0);
      const percentage = Number(r.selection_rate || 0);
      return barRowPercent(r.label, percentage, `${count.toLocaleString()} · ${core.formatPercent(percentage)}`);
    }).join('');
  }



  async function loadOverview() {
    const region = $('#reports-summary');
    region.innerHTML = '<div class="reports-loading">Loading summary…</div>';
    try {
      const data = await api('reports-overview');
      renderSummary(data);
      $('#reports-aov').textContent = `Avg. paid order ${core.formatMoney(data.average_paid_order)}`;
    } catch (error) { region.innerHTML = `<div class="reports-error">${escapeHtml(error.message)}</div>`; }
  }

  async function loadAnalysis() {
    try {
      const data = await api('reports-analysis');
      renderLineChart($('#reports-revenue-trend'), data.revenue_trend, core.formatMoney);
      renderLineChart($('#reports-submission-trend'), data.submission_trend, v => String(Math.round(v)));
      $('#reports-trend-granularity').textContent = `${data.trend_granularity} grouping`;
      renderPaymentMethod(data.payment_method_breakdown);
      renderPaymentStatus(data.payment_status);
      renderVerificationDonut(data.verification);
      renderFormPerformance(data.forms);
      renderRenewalYears(data.renewal_years);
      renderAddons(data.addons);
    } catch (error) {
      ['#reports-revenue-trend','#reports-submission-trend','#reports-payment-method','#reports-payment-status','#reports-verification','#reports-form-performance','#reports-renewal-years','#reports-addons'].forEach(sel => { const el=$(sel); if (el) el.innerHTML=`<div class="reports-error">${escapeHtml(error.message)}</div>`; });
    }
  }

  function loadAll() { return Promise.allSettled([loadOverview(), loadAnalysis()]); }


  function entriesUrl(status) {
    const url = new URL(config.entriesUrl, window.location.origin);
    url.searchParams.set('status', status);
    if (state.formId > 0) url.searchParams.set('form_id', String(state.formId));
    if (state.startDate) url.searchParams.set('start_date', state.startDate);
    if (state.endDate) url.searchParams.set('end_date', state.endDate);
    return url.toString();
  }



  const reportsLogoutButton = $('#reports-logout-button');
  if (reportsLogoutButton && config.logoutUrl) {
    reportsLogoutButton.addEventListener('click', () => { fetch('/api/admin-logout',{method:'POST',credentials:'same-origin'}).finally(()=>{window.location.href='/admin/login/';}); });
  }

  const formSelect = $('#reports-form-filter');
  const presetSelect = $('#reports-date-preset');
  const startInput = $('#reports-start-date');
  const endInput = $('#reports-end-date');
  const firstEntryDateForSelectedForm = () => {
    const key = String(Number(formSelect.value || 0));
    return (config.firstEntryDates && config.firstEntryDates[key]) || config.today;
  };
  const rangeForPreset = (preset) => core.presetRange(
    preset,
    config.today,
    preset === 'all' ? firstEntryDateForSelectedForm() : ''
  );
  if (formSelect.disabled) state.formId = Number(formSelect.value || 0);
  startInput.value = state.startDate; endInput.value = state.endDate;

  presetSelect.addEventListener('change', () => {
    state.preset = presetSelect.value;
    if (state.preset !== 'custom') {
      const range = rangeForPreset(state.preset);
      startInput.value = range.startDate; endInput.value = range.endDate;
    }
  });
  formSelect.addEventListener('change', () => {
    if (presetSelect.value !== 'all') return;
    const range = rangeForPreset('all');
    startInput.value = range.startDate;
    endInput.value = range.endDate;
  });
  [startInput,endInput].forEach(input => input.addEventListener('change', () => { presetSelect.value='custom'; state.preset='custom'; }));
  $('#reports-apply').addEventListener('click', () => {
    state.formId = Number(formSelect.value || 0);
    state.startDate = startInput.value; state.endDate = endInput.value;
    loadAll();
  });
  $('#reports-clear').addEventListener('click', () => {
    const range = core.presetRange('thisMonth', config.today);
    const formId = formSelect.disabled ? Number(formSelect.value || 0) : 0;
    if (!formSelect.disabled) formSelect.value = '0';
    presetSelect.value = 'thisMonth';
    Object.assign(state, { formId, preset:'thisMonth', startDate:range.startDate, endDate:range.endDate });
    startInput.value = state.startDate; endInput.value = state.endDate; loadAll();
  });
  $('#reports-summary').addEventListener('click', e => {
    const card = e.target.closest('[data-drill-status]'); if (card) window.location.href = entriesUrl(card.dataset.drillStatus);
  });
  $('#reports-summary').addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('[data-drill-status]'); if (!card) return;
    e.preventDefault(); window.location.href = entriesUrl(card.dataset.drillStatus);
  });

  loadAll();
})();
