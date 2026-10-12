import crypto from 'node:crypto';
import { json, readBody } from '../shared/http.js'; import { validSession } from '../shared/auth.js'; import { db } from '../shared/db.js';
const allowed=new Set(['paid','pending','failed','refunded']);
export default async function handler(req,res){
  if(!validSession(req)) return json(res,401,{error:'Unauthorized'});
  const u=new URL(req.url||'/', 'https://local.invalid'); const id=String(u.searchParams.get('id')||'').trim(); if(!id) return json(res,400,{error:'Missing record id'});
  try{ const sql=db();
    if(req.method==='GET'){
      const rows=await sql`select id entry_number,* from ssm_renewals where record_id::text=${id} limit 1`; if(!rows.length)return json(res,404,{error:'Entry not found'});
      const acts=await sql`select activity_id,record_id,event_type,actor,label,message,created_at from ssm_activities where record_id::text=${id} order by created_at desc`;
      return json(res,200,{...rows[0],activities:acts});
    }
    if(req.method==='PATCH'){
      const body=await readBody(req); const status=String(body.status||'').toLowerCase(); if(!allowed.has(status))return json(res,400,{error:'Invalid payment status'});
      const rows=await sql`update ssm_renewals set status=${status},updated_at=now(),paid_at=case when ${status}='paid' then coalesce(paid_at,now()) else paid_at end,refunded_at=case when ${status}='refunded' then coalesce(refunded_at,now()) else refunded_at end where record_id::text=${id} returning id entry_number,*`;
      if(!rows.length)return json(res,404,{error:'Entry not found'});
      await sql`insert into ssm_activities(activity_id,record_id,event_type,actor,label,message) values(${crypto.randomUUID()},${id}::uuid,'status_change','admin','status',${`Payment status changed to ${status}`})`;
      return json(res,200,rows[0]);
    }
    if(req.method==='DELETE'){
      await sql`delete from ssm_activities where record_id::text=${id}`; const rows=await sql`delete from ssm_renewals where record_id::text=${id} returning record_id`; return rows.length?json(res,200,{ok:true}):json(res,404,{error:'Entry not found'});
    }
    return json(res,405,{error:'Method not allowed'});
  }catch(e){ return json(res,503,{error:e.message}); }
}
