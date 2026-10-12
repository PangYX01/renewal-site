import overview from '../lib/routes/reports-overview.js'; import analysis from '../lib/routes/reports-analysis.js';
export default async function handler(req,res){ const action=String(req.query?.action||''); const fn=action==='overview'?overview:action==='analysis'?analysis:null; if(!fn){res.status(404).json({error:'Reports API route not found.'});return;} return fn(req,res); }
