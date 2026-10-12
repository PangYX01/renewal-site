import { json } from '../shared/http.js'; import { validSession } from '../shared/auth.js'; import { db } from '../shared/db.js'; import { parseAdminFilters, buildWhere } from '../shared/admin-query.js';
export default async function handler(req,res){
  if(!validSession(req)) return json(res,401,{error:'Unauthorized'});
  if(req.method!=='GET') return json(res,405,{error:'Method not allowed'});
  try{
    const sql=db(); const f=parseAdminFilters(req); const {where,params}=buildWhere(f,{excludePrepared:true});
    const countRows=await sql.unsafe(`select count(*)::int total from ssm_renewals${where}`,params); const total=Number(countRows[0]?.total||0);
    const offset=(f.page-1)*f.perPage; const p=[...params,f.perPage,offset]; const lim=`$${params.length+1}`, off=`$${params.length+2}`;
    const rows=await sql.unsafe(`select id entry_number,id,record_id,form_id,created_at,updated_at,status,bill_id,registration_number,business_name,old_registration,verification_status,renewal_years,branches,renewal_amount,branch_fee,addon_total,payment_items,pricing_snapshot,extra_fields,total_amount,late_compound,business_info,colored_certificate,customer_name,email,phone,payment_url,source_url,payment_method,terms_agreed,client_browser,client_platform,client_ip,paid_at,refunded_at,transaction_id,transaction_status,payment_verified_at,customer_email_sent_at,admin_email_sent_at,email_retry_count,last_email_error,is_read from ssm_renewals${where} order by created_at desc,id desc limit ${lim} offset ${off}`,p);
    return json(res,200,{records:rows,total,page:f.page,per_page:f.perPage,total_pages:Math.max(1,Math.ceil(total/f.perPage))});
  }catch(e){ return json(res,503,{error:e.message}); }
}
