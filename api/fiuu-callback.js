import { readBody } from '../lib/shared/http.js'; import { db } from '../lib/shared/db.js'; import { text, logActivity, publicOrigin } from '../lib/shared/payment.js'; import { assertConfigured, verifyCallback, mapStatus, ipnUrl } from '../lib/shared/fiuu.js';
function plain(res,status,body=''){res.status(status).setHeader('Content-Type','text/plain; charset=utf-8');res.end(body);}
export default async function handler(req,res){
  if(!['GET','POST'].includes(req.method)) return plain(res,405,'Method not allowed');
  try{
    const body=await readBody(req); const params={...req.query,...body}; delete params.mode; delete params.osr_token;
    const order=text(params.orderid,100); if(!order)return plain(res,400,'ERROR');
    const sql=db();const rows=await sql`select * from ssm_renewals where bill_id=${order} and payment_method='fiuu' limit 1`;const row=rows[0];if(!row)return plain(res,404,'ERROR');
    const c=assertConfigured(); if(!verifyCallback(params,c.secretKey))return plain(res,400,'ERROR'); if(text(params.domain,200)!==c.merchantId)return plain(res,400,'ERROR');
    const currency=text(params.currency,20).toUpperCase();if(!['MYR','RM'].includes(currency))return plain(res,400,'ERROR');
    if(Number(row.total_amount).toFixed(2)!==Number(params.amount||0).toFixed(2))return plain(res,400,'ERROR');
    const mapped=mapStatus(params.status), previous=String(row.status||'pending'), status=previous==='paid'?'paid':mapped; const tran=text(params.tranID,200), txStatus=text(params.status,50);
    if(status==='paid') await sql`update ssm_renewals set updated_at=now(),payment_verified_at=now(),transaction_id=${tran||row.transaction_id||''},transaction_status=${txStatus},payment_method='fiuu',status='paid',paid_at=coalesce(paid_at,now()) where record_id=${row.record_id}`;
    else await sql`update ssm_renewals set updated_at=now(),payment_verified_at=now(),transaction_id=${tran||row.transaction_id||''},transaction_status=${txStatus},payment_method='fiuu',status=${status} where record_id=${row.record_id}`;
    if(status==='paid'&&previous!=='paid')await logActivity(sql,row.record_id,'payment','paid','Fiuu confirmed the payment as paid.','Fiuu');
    if(status==='failed'&&previous!=='failed'&&previous!=='paid')await logActivity(sql,row.record_id,'payment','failed','Fiuu reported that the payment failed.','Fiuu');
    const nbcb=text(params.nbcb,10);
    if(nbcb==='1') return plain(res,200,'CBTOKEN:MPSTATOK');
    if(nbcb==='2'){
      try{const ack=new URLSearchParams();for(const [k,v] of Object.entries(params))if(['string','number'].includes(typeof v))ack.set(k,String(v));ack.set('treq','1');await fetch(ipnUrl(),{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:ack,signal:AbortSignal.timeout(10000)});}catch{}
      return plain(res,200,'');
    }
    const origin=publicOrigin(req); const target=status==='paid'?`${origin}/payment-confirmation/`:`${origin}/payment-failed/?reason=${encodeURIComponent(status)}`; res.statusCode=302;res.setHeader('Location',target);res.end();
  }catch(e){ console.error('Fiuu callback error',e); return plain(res,500,'ERROR'); }
}
