import crypto from 'node:crypto';
const COOKIE = 'osr_admin';
function secret() { return process.env.SESSION_SECRET || ''; }
function sign(value) { return crypto.createHmac('sha256', secret()).update(value).digest('hex'); }
export function makeSession() {
  if (!secret()) throw new Error('SESSION_SECRET is not configured.');
  const value = `${Date.now()}.${crypto.randomBytes(12).toString('hex')}`;
  return `${value}.${sign(value)}`;
}
export function validSession(req) {
  if (!secret()) return false;
  const cookie = String(req.headers.cookie || '').split(';').map(v=>v.trim()).find(v=>v.startsWith(`${COOKIE}=`));
  if (!cookie) return false;
  const token = decodeURIComponent(cookie.slice(COOKIE.length+1));
  const idx = token.lastIndexOf('.'); if (idx < 0) return false;
  const value = token.slice(0, idx), sig = token.slice(idx+1);
  const expected = sign(value);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  const ts = Number(value.split('.')[0]);
  return Number.isFinite(ts) && Date.now() - ts < 1000*60*60*12;
}
export function sessionCookie(token) { return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=43200`; }
export function clearCookie() { return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`; }
