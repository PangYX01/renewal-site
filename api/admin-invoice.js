import { validSession } from '../lib/shared/auth.js';
import { db } from '../lib/shared/db.js';
import { invoicePdf, invoiceFilename } from '../lib/shared/invoice.js';
export default async function handler(req,res){
  if(!validSession(req)){res.status(401).json({error:'Unauthorized'});return;}
  if(req.method!=='GET'){res.status(405).json({error:'Method not allowed'});return;}
  const id=String(req.query?.id||'').trim();if(!id){res.status(400).json({error:'Missing record id'});return;}
  try{const sql=db();const rows=await sql`select id entry_number,* from ssm_renewals where record_id::text=${id} limit 1`;if(!rows.length){res.status(404).json({error:'Entry not found'});return;}const row=rows[0],pdf=invoicePdf(row);res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition',`attachment; filename="${invoiceFilename(row)}"`);res.setHeader('Content-Length',String(pdf.length));res.status(200).send(pdf);}catch(e){res.status(500).json({error:e.message||'Unable to create invoice.'});}
}
