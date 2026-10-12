import { json, readBody } from '../lib/shared/http.js';
import { db } from '../lib/shared/db.js';
import { calculate, cleanEmail, text, recordId as makeRecordId, randomToken, sha256, orderId, publicOrigin, logActivity } from '../lib/shared/payment.js';
import { assertConfigured, selectionError } from '../lib/shared/fiuu.js';

export default async function handler(req,res){
  if(req.method!=='POST') return json(res,405,{error:'Method not allowed'});
  try{
    assertConfigured();
    const p=await readBody(req); const calc=calculate(p);
    for(const f of ['name','email','phone','registration','businessName']) if(!text(p[f])) return json(res,400,{error:`Missing required field: ${f}`});
    const email=cleanEmail(p.email); if(!email) return json(res,400,{error:'Please enter a valid email address.'});
    const verification=text(p.verificationStatus,30); if(!['Verified','Unverified'].includes(verification)) return json(res,400,{error:'SSM verification status is missing or invalid. Please verify the registration number again.'});
    if(Math.abs(Number(p.total||0)-calc.total)>.01) return json(res,400,{error:'Amount mismatch detected.'});
    const chooseErr=selectionError(p.paymentCategory,p.paymentBank,p.paymentWallet); if(chooseErr) return json(res,400,{error:chooseErr});
    const sql=db(); let record=makeRecordId(), token=randomToken(30), reuse=false, bill='';
    if(text(p.preparedRecordId)&&text(p.preparedToken)){
      const found=await sql`select record_id,bill_id,redirect_token,status from ssm_renewals where record_id=${text(p.preparedRecordId)}::uuid and payment_method='fiuu' limit 1`;
      const row=found[0];
      if(!row||row.status!=='prepared'||!row.redirect_token||row.redirect_token!==sha256(text(p.preparedToken))) return json(res,409,{error:'The prepared payment session is no longer available. Please refresh and try again.'});
      record=String(row.record_id); token=text(p.preparedToken); bill=text(row.bill_id); reuse=true;
    }
    if(!bill) bill=orderId(record);
    const origin=publicOrigin(req); const handoff=`${origin}/?record_id=${encodeURIComponent(record)}&osr_token=${encodeURIComponent(token)}`;
    const addons=p.addOns&&typeof p.addOns==='object'?p.addOns:{};
    const browser=text(p.clientMeta?.browser||req.headers['user-agent']||'',200); const platform=text(p.clientMeta?.platform||'',100);
    const ip=text(String(req.headers['x-forwarded-for']||'').split(',')[0],80);
    const values={record,formId:Math.max(1,Number(p.formId||1)),bill,registration:text(p.registration,100).toUpperCase(),business:text(p.businessName,300),oldReg:text(p.oldRegistration,100),verification,name:text(p.name,200),email,phone:text(p.phone,100),source:text(p.sourceUrl,1000),terms:p.termsAgreed?'Agreed':'Not agreed',browser,platform,ip,handoff};
    if(reuse){
      await sql`update ssm_renewals set updated_at=now(),status='prepared',bill_id=${bill},registration_number=${values.registration},business_name=${values.business},old_registration=${values.oldReg},verification_status=${verification},renewal_years=${calc.years},branches=${calc.branches},renewal_amount=${calc.renewalAmount},branch_fee=${calc.branchFee},addon_total=${calc.addonTotal},payment_items=${sql.json(calc.paymentItems)},pricing_snapshot=${sql.json(calc.pricingSnapshot)},extra_fields=${sql.json(p.extraFields||{})},total_amount=${calc.total},late_compound=${addons.compound?'Yes':'No'},business_info=${addons.info?'Yes':'No'},colored_certificate=${addons.colored?'Yes':'No'},customer_name=${values.name},email=${values.email},phone=${values.phone},payment_url=${handoff},source_url=${values.source},payment_method='fiuu',terms_agreed=${values.terms},client_browser=${browser},client_platform=${platform},client_ip=${ip} where record_id=${record}::uuid and status='prepared'`;
    }else{
      await sql`insert into ssm_renewals (record_id,form_id,created_at,updated_at,status,bill_id,registration_number,business_name,old_registration,verification_status,renewal_years,branches,renewal_amount,branch_fee,addon_total,payment_items,pricing_snapshot,extra_fields,total_amount,late_compound,business_info,colored_certificate,customer_name,email,phone,payment_url,source_url,payment_method,terms_agreed,client_browser,client_platform,client_ip,redirect_token) values (${record}::uuid,${values.formId},now(),now(),'prepared',${bill},${values.registration},${values.business},${values.oldReg},${verification},${calc.years},${calc.branches},${calc.renewalAmount},${calc.branchFee},${calc.addonTotal},${sql.json(calc.paymentItems)},${sql.json(calc.pricingSnapshot)},${sql.json(p.extraFields||{})},${calc.total},${addons.compound?'Yes':'No'},${addons.info?'Yes':'No'},${addons.colored?'Yes':'No'},${values.name},${values.email},${values.phone},${handoff},${values.source},'fiuu',${values.terms},${browser},${platform},${ip},${sha256(token)})`;
      await logActivity(sql,record,'submission','prepared','Form details prepared for Fiuu payment; payment has not started yet.','Customer');
    }
    return json(res,200,{billId:bill,recordId:record,token,paymentUrl:handoff,amount:calc.total,breakdown:calc});
  }catch(e){ return json(res,Number(e.status||500),{error:e.message||'Unable to prepare payment.'}); }
}
