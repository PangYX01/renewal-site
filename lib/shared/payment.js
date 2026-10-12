import crypto from 'crypto';
import { pricing } from './pricing.js';

export function text(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}
export function cleanEmail(value) {
  const v = text(value, 254);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : '';
}
export function sha256(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }
export function md5(value) { return crypto.createHash('md5').update(String(value)).digest('hex'); }
export function randomToken(bytes = 30) { return crypto.randomBytes(bytes).toString('hex'); }
export function recordId() { return crypto.randomUUID(); }
export function orderId(uuid) { return 'OSR' + String(uuid).replace(/-/g, '').slice(0, 24).toUpperCase(); }

export function calculate(payload = {}) {
  const years = Math.max(1, Math.trunc(Number(payload.years || 0)));
  const duration = pricing.durations.find((d) => Number(d.years) === years);
  if (!duration) throw Object.assign(new Error('Please choose a valid renewal duration.'), { status: 400 });
  const branchesRaw = Number(payload.branches ?? 0);
  if (!Number.isFinite(branchesRaw) || Math.trunc(branchesRaw) !== branchesRaw || branchesRaw < 0 || branchesRaw > 100) {
    throw Object.assign(new Error('Number of Branches must be a whole number between 0 and 100.'), { status: 400 });
  }
  const branches = Math.trunc(branchesRaw);
  const renewalAmount = Number(duration.price);
  const branchFee = branches * (pricing.branch.multiply_by_years ? years : 1) * Number(pricing.branch.rate || 0);
  const addOns = payload.addOns && typeof payload.addOns === 'object' ? payload.addOns : {};
  let addonTotal = 0;
  const paymentItems = [{ key: 'renewal', label: duration.label, amount: renewalAmount }];
  for (const key of ['compound','info','colored']) {
    if (addOns[key]) {
      const amount = Number(pricing.addons?.[key]?.price || 0);
      addonTotal += amount;
      paymentItems.push({ key, label: key, amount });
    }
  }
  if (branchFee > 0) paymentItems.push({ key: 'branches', label: pricing.branch.item_name || 'Branch Renewal Fee', amount: branchFee });
  const total = Number((renewalAmount + branchFee + addonTotal).toFixed(2));
  return {
    years, branches, renewalAmount, branchFee, addonTotal, total, paymentItems,
    pricingSnapshot: { currency: pricing.currency, years, durationPrice: renewalAmount, branchRate: pricing.branch.rate, addons: pricing.addons }
  };
}

export function publicOrigin(req) {
  const configured = text(process.env.PUBLIC_SITE_URL || '', 500).replace(/\/+$/, '');
  if (configured) return configured;
  const proto = text(req.headers['x-forwarded-proto'] || 'https', 20).split(',')[0];
  const host = text(req.headers['x-forwarded-host'] || req.headers.host || '', 255).split(',')[0];
  return `${proto}://${host}`;
}

export async function logActivity(sql, record, eventType, label, message, actor = 'System') {
  try {
    await sql`insert into ssm_activities (activity_id,record_id,event_type,actor,label,message,created_at)
      values (${crypto.randomUUID()}::uuid,${record}::uuid,${eventType},${actor},${label},${message},now())`;
  } catch (_) {}
}
