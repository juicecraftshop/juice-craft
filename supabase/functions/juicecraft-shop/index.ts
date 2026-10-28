import {bootstrapData,billData,changedProducts,productMasters} from './snapshot.ts';
import {allowedOrigin} from './origins.ts';
import postgres from 'npm:postgres@3.4.7';
import {context,response} from './server.ts';
import {GET,POST} from './routes.ts';
const sql=postgres(Deno.env.get('SUPABASE_DB_URL')!,{prepare:false,max:1,ssl:'require',idle_timeout:20,connect_timeout:15,types:{bigint:{to:20,from:[20,1700],serialize:(v:any)=>String(v),parse:(v:string)=>Number(v)}}});
const corsBase={'Access-Control-Allow-Headers':'content-type,x-shop-session','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Max-Age':'600','Vary':'Origin','Cache-Control':'no-store'};
class Rejected extends Error{constructor(public result:Response){super('Request rejected')}}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('origin');
 const cors={...corsBase,...(origin?{'Access-Control-Allow-Origin':origin}:{})};
 if(!allowedOrigin(origin))return response({error:'This website is not allowed.'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(!['GET','POST'].includes(req.method))return new Response('Method not allowed',{status:405,headers:cors});
 let result:Response;
 try{
  let action='',payload:any={};if(req.method==='POST'){const body=await req.clone().text();if(body.length>100000)throw new Rejected(response({error:'Request too large.'},413));payload=JSON.parse(body);action=payload.action;}
  result=await sql.begin(async tx=>{
   await tx.unsafe("SET LOCAL ROLE juicecraft_app; SET LOCAL search_path TO juicecraft, pg_catalog; SET LOCAL statement_timeout TO '15s'");
   // Serialize writes so stock checks, bill numbers, idempotency and writes are atomic.
   if(req.method==='POST')await tx`SELECT pg_advisory_xact_lock(748290153)`;
   return await context.run(tx,async()=>{const r=await(req.method==='POST'?POST(req):GET(req));if(r.status>=400&&action!=='login')throw new Rejected(r);if(r.ok&&['product','stock','sale','wastage','adjustment'].includes(action)){const saved=await r.json();return response({...saved,...(new URL(req.url).searchParams.get('incremental')==='1'?{products:await changedProducts(action,payload,saved.id),...(action==='product'?{masters:await productMasters(saved.id)}:{})}:{bootstrap:await bootstrapData()}),...(action==='sale'?{bill:await billData(saved.id)}:{})})}return r});
  });
 }catch(e){if(!(e instanceof Rejected))console.error('shop transaction failed',String(e));result=e instanceof Rejected?e.result:response({error:'Could not connect to your shop. Please try again.'},503);}
 const headers=new Headers(result.headers);for(const[k,v]of Object.entries(cors))headers.set(k,v);headers.delete('set-cookie');
 return new Response(result.body,{status:result.status,headers});
});
