import { json } from './lib/http.js'; import { validSession } from './lib/auth.js'; import { db } from './lib/db.js';
export default async function handler(req,res){
  if(!validSession(req)) return json(res,401,{error:'Unauthorized'});
  try{
    const sql=db();
    const [row]=await sql`select count(*) filter (where coalesce(status,'') <> 'prepared')::int submissions, count(*) filter (where status='paid')::int paid, count(*) filter (where status='pending')::int pending, count(*) filter (where status='failed')::int failed, count(*) filter (where status='refunded')::int refunded, coalesce(sum(total_amount) filter (where status='paid'),0)::numeric revenue from ssm_renewals`;
    return json(res,200,row);
  }catch(e){ return json(res,503,{error:e.message}); }
}
