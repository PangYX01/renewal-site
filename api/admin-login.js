import crypto from 'node:crypto';
import { json, readBody } from './lib/http.js';
import { makeSession, sessionCookie } from './lib/auth.js';
function safeEqual(a,b){ const x=Buffer.from(String(a)),y=Buffer.from(String(b)); return x.length===y.length && crypto.timingSafeEqual(x,y); }
export default async function handler(req,res){
  if(req.method!=='POST') return json(res,405,{error:'Method not allowed'});
  if(!process.env.ADMIN_PASSWORD || !process.env.SESSION_SECRET) return json(res,503,{error:'Admin environment variables are not configured.'});
  const body=await readBody(req);
  if(!safeEqual(body.password||'',process.env.ADMIN_PASSWORD)) return json(res,401,{error:'Invalid password.'});
  res.setHeader('Set-Cookie',sessionCookie(makeSession())); return json(res,200,{ok:true});
}
