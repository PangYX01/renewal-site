import * as cheerio from 'cheerio';

const SSM_URL = 'https://www.ssm.com.my/Pages/e-Search.aspx';
const CANARY_NUMBER = '201903123456';
const CANARY_OLD_NUMBER = 'AS0402639-H';
const REG_TYPES = [
  { key: 'robNew', name: 'Business Registration Number New' },
  { key: 'rob', name: 'Business Registration Number Old' }
];

export function normalizeNumber(value) {
  const cleaned = String(value || '').trim().toUpperCase();
  if (/^\d{12}$/.test(cleaned)) return cleaned;
  const m = cleaned.match(/^([A-Z0-9]{9})(?:-[A-Z]?)?$/);
  if (!m) return '';
  const base = m[1];
  if (/^\d{9}$/.test(base) || /^[A-Z]\d{8}$/.test(base) || /^[A-Z]{2}\d{7}$/.test(base)) return base;
  return '';
}

function cookieHeader(response) {
  const values = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
  if (values.length) return values.map(v => v.split(';')[0]).join('; ');
  const one = response.headers.get('set-cookie');
  return one ? one.split(',').map(v => v.trim().split(';')[0]).join('; ') : '';
}

function hidden($, name) { return $(`input[name="${name}"]`).attr('value') || ''; }

async function fetchWithTimeout(url, options = {}, ms = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try { return await fetch(url, { ...options, signal: controller.signal, redirect: 'follow' }); }
  finally { clearTimeout(timer); }
}

export async function rawLookup(number) {
  let initial;
  try {
    initial = await fetchWithTimeout(SSM_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  } catch (e) {
    return { exists: false, unavailable: true, reason: e?.name === 'AbortError' ? 'SSM connection timed out.' : (e?.message || 'SSM connection failed.'), http_status: 0 };
  }
  const initialHtml = await initial.text().catch(() => '');
  if (!initial.ok || !initialHtml.trim()) return { exists: false, unavailable: true, reason: `SSM returned HTTP ${initial.status}.`, http_status: initial.status };
  const $ = cheerio.load(initialHtml);
  const viewState = hidden($, '__VIEWSTATE');
  const eventValidation = hidden($, '__EVENTVALIDATION');
  const viewStateGenerator = hidden($, '__VIEWSTATEGENERATOR');
  if (!viewState || !eventValidation || !viewStateGenerator) return { exists: false, unavailable: true, reason: 'The expected SSM hidden fields were not found.', http_status: initial.status };
  const cookies = cookieHeader(initial);
  let notFound = 0;
  for (const type of REG_TYPES) {
    const body = new URLSearchParams({
      '__VIEWSTATE': viewState,
      '__EVENTVALIDATION': eventValidation,
      '__VIEWSTATEGENERATOR': viewStateGenerator,
      'ctl00$ctl36$g_2e791db6_58e3_41f2_a6f4_9c226eefabbc$ctl00$idDropRegistrationType': type.key,
      'ctl00$ctl36$g_2e791db6_58e3_41f2_a6f4_9c226eefabbc$ctl00$txtCarieSearch': number,
      'ctl00$ctl36$g_2e791db6_58e3_41f2_a6f4_9c226eefabbc$ctl00$idBtneSearch': 'Search Now'
    });
    let response;
    try {
      response = await fetchWithTimeout(SSM_URL, {
        method: 'POST',
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': SSM_URL,
          ...(cookies ? { Cookie: cookies } : {})
        },
        body
      });
    } catch (e) {
      return { exists: false, unavailable: true, reason: e?.name === 'AbortError' ? 'SSM validation timed out.' : (e?.message || 'SSM validation failed.'), http_status: 0 };
    }
    const html = await response.text().catch(() => '');
    if (!response.ok || !html.trim()) return { exists: false, unavailable: true, reason: `SSM validation returned HTTP ${response.status}.`, http_status: response.status };
    const $$ = cheerio.load(html);
    if ($$('tr.alert-info').length) { notFound++; continue; }
    const row = $$('table[id*="GridViewRob"] tr').eq(1);
    const cols = row.find('td');
    if (cols.length < 5) return { exists: false, unavailable: true, reason: 'The SSM validation response structure was unexpected.', http_status: response.status };
    return {
      exists: true,
      unavailable: false,
      type: type.name,
      data: {
        registrationNumber: $$(cols[0]).text().trim(),
        newRegistrationNumber: $$(cols[1]).text().trim(),
        entityName: $$(cols[2]).text().trim(),
        status: $$(cols[3]).text().trim(),
        gstNumber: $$(cols[4]).text().trim() || null
      },
      http_status: response.status
    };
  }
  if (notFound === REG_TYPES.length) return { exists: false, unavailable: false, http_status: 200 };
  return { exists: false, unavailable: true, reason: 'SSM verification returned an unexpected result.', http_status: 200 };
}

const verified = r => r?.exists === true && r?.unavailable !== true && r?.data && typeof r.data === 'object';
const notFound = r => r?.exists === false && r?.unavailable === false;
const canaryHealthy = r => verified(r) && String(r.data.newRegistrationNumber || '').trim() === CANARY_NUMBER && String(r.data.registrationNumber || '').trim() === CANARY_OLD_NUMBER;
const verifiedResponse = r => ({ mode:'verified', health:'healthy', exists:true, unavailable:false, verified:true, verification_marker:'Verified', data:r.data, message:'' });
const notFoundResponse = () => ({ mode:'not_found', health:'healthy', exists:false, unavailable:false, verified:false, verification_marker:'', data:null, message:"Registration Number doesn't exist, please make sure it is NON SDN BHD." });
const fallbackResponse = r => ({ mode:'fallback', health:'healthy', exists:false, unavailable:true, verified:false, verification_marker:'Unverified', data:verified(r)?{registrationNumber:String(r.data.registrationNumber||'').trim()}:null, message:'SSM verification is temporarily unavailable. Please enter the Business Name manually. You may continue after completing the required field.' });

export async function orchestratedLookup(number) {
  const first = await rawLookup(number);
  if (verified(first)) return verifiedResponse(first);
  const canary = await rawLookup(CANARY_NUMBER);
  if (!canaryHealthy(canary)) return fallbackResponse(first);
  if (notFound(first)) return notFoundResponse();
  const retry = await rawLookup(number);
  if (verified(retry)) return verifiedResponse(retry);
  if (notFound(retry)) return notFoundResponse();
  return fallbackResponse(retry);
}
