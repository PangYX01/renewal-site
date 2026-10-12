import { json } from './lib/http.js'; import { validSession } from './lib/auth.js'; import { db } from './lib/db.js'; import { parseReportFilters, buildReportWhere } from './lib/admin-query.js';
const pct=(a,b)=>b>0?Math.round((a/b)*1000)/10:0;
export default async function handler(req,res){
  if(!validSession(req)) return json(res,401,{error:'Unauthorized'});
  try{const sql=db();const f=parseReportFilters(req);const sub=buildReportWhere(f,{excludePrepared:true});const paid=buildReportWhere(f,{status:'paid'});const pending=buildReportWhere(f,{status:'pending'});const failed=buildReportWhere(f,{status:'failed'});const refunded=buildReportWhere(f,{status:'refunded'});
    const [sr]=await sql.unsafe(`select count(*)::int submissions,count(*) filter(where lower(trim(coalesce(verification_status,'')))='verified')::int verified,count(*) filter(where lower(trim(coalesce(verification_status,'')))='unverified')::int unverified from ssm_renewals${sub.where}`,sub.params);
    async function metric(x){const [r]=await sql.unsafe(`select count(*)::int count,coalesce(sum(total_amount),0)::numeric amount from ssm_renewals${x.where}`,x.params);return {count:Number(r?.count||0),amount:Number(r?.amount||0)}}
    const [p,pe,fa,re]=await Promise.all([metric(paid),metric(pending),metric(failed),metric(refunded)]);const submissions=Number(sr?.submissions||0),verified=Number(sr?.verified||0),unverified=Number(sr?.unverified||0);
    return json(res,200,{filters:{form_id:f.formId,start_date:f.startDate,end_date:f.endDate},summary:{total_revenue:{amount:p.amount,count:p.count},total_submissions:{count:submissions},paid:p,pending:pe,failed:fa,refunded:re,verified:{count:verified,percentage:pct(verified,submissions)},unverified:{count:unverified,percentage:pct(unverified,submissions)}},average_paid_order:p.count?p.amount/p.count:0,trend_granularity:'daily',available_forms:[{id:1,title:'SSM Renewal Form'}]});
  }catch(e){return json(res,503,{error:e.message});}
}
