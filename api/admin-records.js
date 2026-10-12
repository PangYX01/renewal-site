import { json } from './lib/http.js'; import { validSession } from './lib/auth.js'; import { db } from './lib/db.js';
export default async function handler(req,res){
  if(!validSession(req)) return json(res,401,{error:'Unauthorized'});
  if(req.method!=='GET') return json(res,405,{error:'Method not allowed'});
  try{
    const sql=db(); const rows=await sql`select id,record_id,created_at,status,registration_number,business_name,verification_status,renewal_years,branches,total_amount,customer_name,email,phone,payment_method,transaction_id,source_url from ssm_renewals order by created_at desc limit 250`;
    return json(res,200,{records:rows});
  }catch(e){ return json(res,503,{error:e.message}); }
}
