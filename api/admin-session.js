import { json } from './lib/http.js'; import { validSession } from './lib/auth.js';
export default async function handler(req,res){ return json(res,200,{authenticated:validSession(req),databaseConfigured:Boolean(process.env.DATABASE_URL)}); }
