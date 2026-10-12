(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.OneStopSSMReportsCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const parseIso = (iso) => {
    const [y, m, d] = String(iso).split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0, 0);
  };
  const iso = (date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const addDays = (date, days) => { const copy = new Date(date); copy.setDate(copy.getDate() + days); return copy; };

  function presetRange(preset, todayIso, firstEntryDate = '') {
    const today = parseIso(todayIso);
    if (preset === 'today') return { startDate: todayIso, endDate: todayIso };
    if (preset === 'last7') return { startDate: iso(addDays(today, -6)), endDate: todayIso };
    if (preset === 'last30') return { startDate: iso(addDays(today, -29)), endDate: todayIso };
    if (preset === 'thisMonth') return { startDate: iso(new Date(today.getFullYear(), today.getMonth(), 1, 12)), endDate: todayIso };
    if (preset === 'lastMonth') return { startDate: iso(new Date(today.getFullYear(), today.getMonth()-1, 1, 12)), endDate: iso(new Date(today.getFullYear(), today.getMonth(), 0, 12)) };
    if (preset === 'thisYear') return { startDate: `${today.getFullYear()}-01-01`, endDate: todayIso };
    if (preset === 'all') return { startDate: firstEntryDate || todayIso, endDate: todayIso };
    return { startDate: '', endDate: '' };
  }

  function formatMoney(value) {
    return `RM${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  function formatPercent(value) { return `${Number(value || 0).toFixed(1)}%`; }
  function formatDateTime(value) {
    if (!value) return '-';
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
    if (!match) return String(value);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    if (!match[4]) return `${day} ${months[month-1]} ${year}`;
    const hour24 = Number(match[4]), minute = match[5], suffix = hour24 >= 12 ? 'PM' : 'AM';
    const hour12 = hour24 % 12 || 12;
    return `${day} ${months[month-1]} ${year}, ${hour12}:${minute} ${suffix}`;
  }
  function buildQuery(state, includePagination = true) {
    const q = new URLSearchParams();
    if (Number(state.formId || 0) > 0) q.set('form_id', String(state.formId));
    if (state.startDate) q.set('start_date', state.startDate);
    if (state.endDate) q.set('end_date', state.endDate);
    if (includePagination) { q.set('page', String(state.page || 1)); q.set('per_page', String(state.perPage || 20)); }
    return q.toString();
  }

  function axisLabelIndexes(length, maxLabels = 9) {
    const total = Math.max(0, Number(length || 0));
    if (!total) return [];
    const cap = Math.max(1, Number(maxLabels || 1));
    const step = Math.max(1, Math.ceil(total / cap));
    const indexes = [];
    for (let i = 0; i < total; i += step) indexes.push(i);
    return indexes;
  }

  function niceAxisStep(maxValue, targetIntervals = 5) {
    const max = Math.max(0, Number(maxValue || 0));
    if (max <= 0) return 1;

    const rough = max / Math.max(1, Number(targetIntervals || 1));
    const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
    const normalized = rough / magnitude;

    let niceNormalized;
    if (normalized <= 1) niceNormalized = 1;
    else if (normalized <= 2) niceNormalized = 2;
    else if (normalized <= 5) niceNormalized = 5;
    else niceNormalized = 10;

    return niceNormalized * magnitude;
  }

  function lineChartGeometry(series, width, height) {
    const padding = { left: 112, right: 42, top: 24, bottom: 58 };
    const values = series.map(p => Number(p.value || 0));
    const max = Math.max(0, ...values);
    const step = niceAxisStep(max, 5);
    const scaleMax = max > 0 ? Math.ceil(max / step) * step : step;
    const innerW = Math.max(1, width - padding.left - padding.right);
    const innerH = Math.max(1, height - padding.top - padding.bottom);
    const points = series.map((p, i) => ({
      bucket: p.bucket,
      value: Number(p.value || 0),
      x: padding.left + (series.length <= 1 ? innerW / 2 : (i / (series.length - 1)) * innerW),
      y: padding.top + innerH - (Number(p.value || 0) / scaleMax) * innerH,
    }));

    const tickCount = Math.max(1, Math.round(scaleMax / step));
    const yTicks = Array.from({ length: tickCount + 1 }, (_, i) => {
      const value = i * step;
      const ratio = scaleMax > 0 ? value / scaleMax : 0;
      return { value, y: padding.top + innerH - (ratio * innerH) };
    });

    return { padding, max: scaleMax, step, points, yTicks };
  }

  return { presetRange, formatMoney, formatPercent, formatDateTime, buildQuery, axisLabelIndexes, niceAxisStep, lineChartGeometry };
});
