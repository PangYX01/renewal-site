import { json } from './lib/http.js';
import { validSession } from './lib/auth.js';
import { db } from './lib/db.js';
import { parseAdminFilters, buildWhere } from './lib/admin-query.js';
export default async function handler(req,res){
  if(!validSession(req)) return json(res,401,{error:'Unauthorized'});
  try{
    const sql=db(); const f=parseAdminFilters(req); const base={...f,status:'all'}; const {where,params}=buildWhere(base,{excludePrepared:true});
    const rows=await sql.unsafe(`select coalesce(status,'pending') status,count(*)::int count,coalesce(sum(total_amount),0)::numeric total from ssm_renewals${where} group by coalesce(status,'pending')`,params);
    const out={all:{count:0,total:0},paid:{count:0,total:0},pending:{count:0,total:0},failed:{count:0,total:0},refunded:{count:0,total:0}};
    for(const r of rows){ const k=String(r.status||'pending').toLowerCase(); if(out[k]){out[k]={count:Number(r.count||0),total:Number(r.total||0)}; out.all.count+=Number(r.count||0); out.all.total+=Number(r.total||0);} }
    return json(res,200,out);
  }catch(e){ return json(res,503,{error:e.message}); }
}
