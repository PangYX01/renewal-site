import { json, readBody } from '../shared/http.js';
import { normalizeNumber, orchestratedLookup } from '../shared/ssm.js';
export const config = { maxDuration: 60 };
export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  const body = await readBody(req);
  const number = normalizeNumber(body.number);
  if (!number) return json(res, 200, { mode:'invalid_format', health:'healthy', exists:false, unavailable:false, verified:false, verification_marker:'', data:null, message:'Please enter a valid registration number format.' });
  try { return json(res, 200, await orchestratedLookup(number)); }
  catch (e) { return json(res, 200, { mode:'fallback', health:'healthy', exists:false, unavailable:true, verified:false, verification_marker:'Unverified', data:null, message:'SSM verification is temporarily unavailable. Please enter the Business Name manually. You may continue after completing the required field.', debug: process.env.NODE_ENV === 'development' ? String(e?.message || e) : undefined }); }
}
