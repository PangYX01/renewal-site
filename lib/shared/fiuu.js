import crypto from 'crypto';
import { md5, text } from './payment.js';

export function sandboxEnabled() {
  return /^(1|true|yes|on)$/i.test(String(process.env.FIUU_SANDBOX || 'false'));
}
export function credentials() {
  return {
    merchantId: text(process.env.FIUU_MERCHANT_ID || '', 200),
    verifyKey: text(process.env.FIUU_VERIFY_KEY || '', 500),
    secretKey: text(process.env.FIUU_SECRET_KEY || '', 500),
  };
}
export function assertConfigured() {
  const c = credentials();
  if (!c.merchantId || !c.verifyKey || !c.secretKey) throw Object.assign(new Error('Fiuu is not configured.'), { status: 503 });
  return c;
}
export function baseUrl() { return sandboxEnabled() ? 'https://sandbox-payment.fiuu.com/' : 'https://pay.fiuu.com/'; }
export function seamlessScriptUrl() { return sandboxEnabled() ? 'https://sandbox.merchant.razer.com/RMS/API/seamless/3.28/js/MOLPay_seamless.deco.js' : 'https://pay.fiuu.com/RMS/API/seamless/3.28/js/MOLPay_seamless.deco.js'; }
export function channelStatusUrl() { return baseUrl().replace(/\/$/,'') + '/RMS/API/chkstat/channel_status.php'; }
export function ipnUrl() { return baseUrl() + 'MOLPay/API/chkstat/returnipn.php'; }
export function vcode(amount, merchantId, orderId, verifyKey) { return md5(`${amount}${merchantId}${orderId}${verifyKey}`); }
export function callbackSkey(p, secret) {
  for (const k of ['tranID','orderid','status','domain','amount','currency','paydate','appcode']) if (p[k] == null) return '';
  const key0 = md5(`${p.tranID}${p.orderid}${p.status}${p.domain}${p.amount}${p.currency}`);
  return md5(`${p.paydate}${p.domain}${key0}${p.appcode}${secret}`);
}
export function verifyCallback(p, secret) {
  const got = text(p.skey || '', 200).toLowerCase();
  const exp = callbackSkey(p, secret).toLowerCase();
  if (!got || !exp || !secret) return false;
  try { return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(exp)); } catch { return false; }
}
export function mapStatus(v) { return String(v) === '00' ? 'paid' : String(v) === '11' ? 'failed' : 'pending'; }
function catalogKey(v) { return String(v || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^[-_]+|[-_]+$/g,''); }
function currencySupported(v, currency='MYR') {
  if (v == null || v === '') return true;
  if (Array.isArray(v)) return v.some(x => String(x).toUpperCase() === currency);
  if (typeof v === 'object') return Object.entries(v).some(([k,x]) => String(k).toUpperCase() === currency || String(x).toUpperCase() === currency);
  return new RegExp(`(?:^|[^A-Z])${currency}(?:$|[^A-Z])`).test(String(v).toUpperCase());
}
function seamlessRequest(row) {
  const maps = row?.channel_map;
  if (!maps) return '';
  if (!Array.isArray(maps) && typeof maps === 'object') {
    for (const k of ['seamless','seamlesspayment']) {
      const r = maps[k];
      if (r && typeof r === 'object' && text(r.request,100)) return text(r.request,100);
    }
  }
  const list = Array.isArray(maps) ? maps : Object.values(maps || {});
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const t = String(raw.integration_type || '').toLowerCase();
    if (['seamless','seamlesspayment'].includes(t) && text(raw.request,100)) return text(raw.request,100);
  }
  return '';
}
function businessBank(channel, title='') {
  const c = String(channel).toUpperCase(), t=String(title).toUpperCase();
  return c === 'FPX_M2E' || c.startsWith('FPX_B2B_') || c.includes('_B2B_') || c.endsWith('_B2B') || t.includes('B2B') || t.includes('MAYBANK2E');
}
function genericBank(channel,title='') {
  const c=String(channel).toLowerCase(),t=String(title).toLowerCase();
  return ['fpx','fpx_b2b'].includes(c) || ['fpx','fpx b2b model'].includes(t);
}
let cache = { at:0, data:null };
export async function channelCatalog() {
  if (cache.data && Date.now()-cache.at < 300000) return cache.data;
  const c = assertConfigured();
  const dt = new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14);
  const skey = crypto.createHmac('sha256', c.verifyKey).update(dt + c.merchantId).digest('hex');
  const body = new URLSearchParams({ merchantID:c.merchantId, datetime:dt, skey });
  const response = await fetch(channelStatusUrl(), { method:'POST', headers:{'Accept':'application/json','Content-Type':'application/x-www-form-urlencoded'}, body, signal:AbortSignal.timeout(10000) });
  const raw = await response.text();
  let payload={}; try{ payload=JSON.parse(raw); }catch{}
  if (!response.ok || !payload || !payload.status || !payload.result) throw Object.assign(new Error(payload?.error_desc || 'Unable to retrieve Fiuu subscribed channels.'), { status:502 });
  const result = Array.isArray(payload.result) ? payload.result : Object.values(payload.result);
  const out={banks:{},business_banks:{},wallets:{},cards:{}};
  for(const row of result){
    if(!row||typeof row!=='object') continue;
    const channel=seamlessRequest(row); const type=String(row.channel_type||'').toUpperCase();
    if(!channel || !currencySupported(row.currency,'MYR') || !['IB','EW','CC'].includes(type)) continue;
    const key=catalogKey(channel); const label=text(row.title||channel,200);
    if(type==='IB'&&genericBank(channel,label)) continue;
    const normalized={label,channel,available:Boolean(row.status)};
    if(type==='IB') out[businessBank(channel,label)?'business_banks':'banks'][key]=normalized;
    else if(type==='EW') out.wallets[key]=normalized; else out.cards[key]=normalized;
  }
  cache={at:Date.now(),data:out}; return out;
}
export async function resolveChannel(category, bank='', wallet='') {
  const catalogs=await channelCatalog();
  const cat=String(category||'').toLowerCase();
  if(cat==='online_banking') return catalogs.banks[catalogKey(bank)]?.available ? catalogs.banks[catalogKey(bank)].channel : '';
  if(cat==='business_banking') return catalogs.business_banks[catalogKey(bank)]?.available ? catalogs.business_banks[catalogKey(bank)].channel : '';
  if(cat==='ewallet') return catalogs.wallets[catalogKey(wallet)]?.available ? catalogs.wallets[catalogKey(wallet)].channel : '';
  if(cat==='card') {
    for(const wanted of ['credit','creditt','creditai','creditan']) for(const row of Object.values(catalogs.cards)) if(row.available&&String(row.channel).toLowerCase()===wanted) return row.channel;
    for(const row of Object.values(catalogs.cards)) if(row.available&&row.channel) return row.channel;
  }
  return '';
}
export function selectionError(category, bank='', wallet='') {
  const cat=String(category||'').toLowerCase();
  if(!cat) return 'Please choose a payment method.';
  if(cat==='online_banking'&&!bank) return 'Please choose your bank.';
  if(cat==='business_banking'&&!bank) return 'Please choose your business bank.';
  if(cat==='ewallet'&&!wallet) return 'Please choose a QR or e-wallet.';
  if(!['online_banking','business_banking','card','ewallet'].includes(cat)) return 'Please choose a valid payment method.';
  return '';
}
