export function parseAdminFilters(req) {
  const u = new URL(req.url || '/', 'https://local.invalid');
  const q = u.searchParams;
  const allowedStatuses = new Set(['all','paid','pending','failed','refunded']);
  const status = allowedStatuses.has(q.get('status')) ? q.get('status') : 'all';
  const search = String(q.get('search') || '').trim().slice(0, 200);
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const startDate = dateRe.test(q.get('start_date') || '') ? q.get('start_date') : '';
  const endDate = dateRe.test(q.get('end_date') || '') ? q.get('end_date') : '';
  const formId = Math.max(0, Number.parseInt(q.get('form_id') || '0', 10) || 0);
  const page = Math.max(1, Number.parseInt(q.get('page') || '1', 10) || 1);
  const perPage = Math.max(1, Math.min(100, Number.parseInt(q.get('per_page') || '20', 10) || 20));
  return { status, search, startDate, endDate, formId, page, perPage };
}

export function buildWhere(filters, { excludePrepared = false } = {}) {
  const clauses = [];
  const params = [];
  const add = (sql, value) => { params.push(value); clauses.push(sql.replace('?', `$${params.length}`)); };
  if (excludePrepared) clauses.push("coalesce(status,'') <> 'prepared'");
  if (filters.status && filters.status !== 'all') add('status = ?', filters.status);
  if (filters.formId > 0) add('form_id = ?', filters.formId);
  if (filters.startDate) add("created_at >= (?::date)", filters.startDate);
  if (filters.endDate) add("created_at < ((?::date) + interval '1 day')", filters.endDate);
  if (filters.search) {
    params.push(`%${filters.search}%`);
    const p = `$${params.length}`;
    clauses.push(`(coalesce(customer_name,'') ilike ${p} or coalesce(email,'') ilike ${p} or coalesce(registration_number,'') ilike ${p} or coalesce(business_name,'') ilike ${p} or coalesce(bill_id,'') ilike ${p} or coalesce(transaction_id,'') ilike ${p} or coalesce(record_id::text,'') ilike ${p})`);
  }
  return { where: clauses.length ? ` where ${clauses.join(' and ')}` : '', params };
}

export function parseReportFilters(req) {
  const u = new URL(req.url || '/', 'https://local.invalid');
  const q = u.searchParams;
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const today = new Date();
  const yyyy = today.getUTCFullYear();
  const mm = String(today.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(today.getUTCDate()).padStart(2, '0');
  const defaultEnd = `${yyyy}-${mm}-${dd}`;
  const defaultStart = `${yyyy}-${mm}-01`;
  return {
    formId: Math.max(0, Number.parseInt(q.get('form_id') || '0', 10) || 0),
    startDate: dateRe.test(q.get('start_date') || '') ? q.get('start_date') : defaultStart,
    endDate: dateRe.test(q.get('end_date') || '') ? q.get('end_date') : defaultEnd,
  };
}

export function buildReportWhere(filters, extra = {}) {
  const clauses = [];
  const params = [];
  const add = (sql, value) => { params.push(value); clauses.push(sql.replace('?', `$${params.length}`)); };
  if (filters.formId > 0) add('form_id = ?', filters.formId);
  if (filters.startDate) add('created_at >= (?::date)', filters.startDate);
  if (filters.endDate) add("created_at < ((?::date) + interval '1 day')", filters.endDate);
  if (extra.excludePrepared) clauses.push("coalesce(status,'') <> 'prepared'");
  if (extra.status) add('status = ?', extra.status);
  return { where: clauses.length ? ` where ${clauses.join(' and ')}` : '', params };
}
