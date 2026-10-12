import { json } from '../shared/http.js';
import { pricing } from '../shared/pricing.js';
export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  return json(res, 200, pricing);
}
