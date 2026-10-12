import { json } from '../shared/http.js'; import { clearCookie } from '../shared/auth.js';
export default async function handler(req,res){ res.setHeader('Set-Cookie',clearCookie()); return json(res,200,{ok:true}); }
