import pricing from '../lib/routes/pricing.js';
import ssmCheck from '../lib/routes/ssm-check.js';
import adminLogin from '../lib/routes/admin-login.js';
import adminLogout from '../lib/routes/admin-logout.js';
import adminSession from '../lib/routes/admin-session.js';
import adminStats from '../lib/routes/admin-stats.js';
import adminRecords from '../lib/routes/admin-records.js';
import adminRecord from '../lib/routes/admin-record.js';
import adminNote from '../lib/routes/admin-note.js';
import adminExport from '../lib/routes/admin-export.js';
import reportsOverview from '../lib/routes/reports-overview.js';
import reportsAnalysis from '../lib/routes/reports-analysis.js';

export const config = { maxDuration: 60 };

const routes = {
  'pricing': pricing,
  'ssm-check': ssmCheck,
  'admin-login': adminLogin,
  'admin-logout': adminLogout,
  'admin-session': adminSession,
  'admin-stats': adminStats,
  'admin-records': adminRecords,
  'admin-record': adminRecord,
  'admin-note': adminNote,
  'admin-export': adminExport,
  'reports-overview': reportsOverview,
  'reports-analysis': reportsAnalysis,
};

export default async function handler(req, res) {
  const url = new URL(req.url || '/', 'https://local.invalid');
  const action = String(url.searchParams.get('action') || '').trim();
  const route = routes[action];
  if (!route) {
    res.status(404).setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'API route not found.' }));
    return;
  }
  return route(req, res);
}
