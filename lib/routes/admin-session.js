import { json } from '../shared/http.js'; import { validSession } from '../shared/auth.js';
export default async function handler(req,res){ return json(res,200,{authenticated:validSession(req),passwordRequired:true,databaseConfigured:Boolean(process.env.DATABASE_URL)}); }
