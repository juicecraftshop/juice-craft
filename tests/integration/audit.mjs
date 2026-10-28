import {PGlite} from '@electric-sql/pglite';
import {PGLiteSocketServer} from '@electric-sql/pglite-socket';
import postgres from 'postgres';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {context,password} from '../../supabase/functions/juicecraft-shop/server.ts';
import {GET,POST} from '../../supabase/functions/juicecraft-shop/routes.ts';
import {bootstrapData,billData,changedProducts,productMasters} from '../../supabase/functions/juicecraft-shop/snapshot.ts';
const db=await PGlite.create();await db.exec('create role anon; create role authenticated;');
await db.exec(fs.readFileSync(new URL('../../supabase/schema/juicecraft.sql',import.meta.url),'utf8'));
await db.exec(fs.readFileSync(new URL('../../supabase/migrations/20261014160000_query_indexes.sql',import.meta.url),'utf8'));
const server=new PGLiteSocketServer({db,host:'127.0.0.1',port:55432});await server.start();
const sql=postgres({host:'127.0.0.1',port:55432,user:'postgres',database:'postgres',prepare:false,max:1,types:{bigint:{to:20,from:[20,1700],serialize:v=>String(v),parse:v=>Number(v)}}});
const temp='Local-Audit-Password-Only-1';await sql`INSERT INTO juicecraft.admin(id,hash,changed) VALUES(1,${await password(temp)},0)`;
let session='';const checks=[];const pass=n=>{checks.push(n);console.log('PASS',n)};
class Rejected extends Error{constructor(result){super();this.result=result}}
async function request(action,data){const req=new Request('https://test.local/?action='+action,{method:data?'POST':'GET',headers:{'content-type':'application/json','x-shop-session':session,Origin:'https://juicecraft.vercel.app'},body:data?JSON.stringify({action,...data}):undefined});try{return await sql.begin(async tx=>{await tx.unsafe("SET LOCAL ROLE juicecraft_app;SET LOCAL search_path TO juicecraft,pg_catalog;SET LOCAL statement_timeout TO '15s'");if(data)await tx`SELECT pg_advisory_xact_lock(748290153)`;return context.run(tx,async()=>{const r=await(data?POST(req):GET(req));const body=await r.json();if(!r.ok&&action!=='login')throw new Rejected({status:r.status,body});if(r.ok&&['product','stock','sale','wastage','adjustment'].includes(action))return{status:r.status,body:{...body,products:await changedProducts(action,data,body.id),...(action==='product'?{masters:await productMasters(body.id)}:{}),...(action==='sale'?{bill:await billData(body.id)}:{})}};return{status:r.status,body}})})}catch(e){if(e instanceof Rejected)return e.result;throw e}}
async function ok(a,b){const r=await request(a,b);assert.equal(r.status,200,JSON.stringify(r));return r.body}
try{
 assert.equal((await request('bootstrap')).status,401);pass('Anonymous access rejected');
 assert.equal((await request('login',{username:'admin',password:'wrong'})).status,401);pass('Wrong password rejected');
 const login=await ok('login',{username:'admin',password:temp});session=login.session;assert.equal(login.mustChange,true);
 assert.equal((await request('master',{kind:'brand',name:'Blocked'})).status,403);pass('Temporary password blocks stock writes');
 await ok('password',{current:temp,password:'Local-Audit-Changed-Password-2'});pass('Change password');
 for(const [kind,name]of [['brand','Test brand'],['category','Packaged'],['prepared','Drink']])await ok('master',{kind,name});
 let boot=await ok('bootstrap');const master=k=>boot.masters.find(x=>x.kind===k).id;
 const packaged=await ok('product',{kind:'packaged',category:master('category'),brand:master('brand'),name:'Ice cream',price:'10',cost:'4',qty:10,low:2});const pkg=packaged.id;
 const prepared=await ok('product',{kind:'prepared',category:master('prepared'),name:'Juice',price:'20',low:0});const drink=prepared.id;pass('Add packaged and prepared items, response snapshots');
 const day=boot.today;
 const stock={key:'stock-1',product:pkg,qty:10,cost:'6',date:day,note:'Delivery'};await ok('stock',stock);await ok('stock',stock);boot=await ok('bootstrap');assert.equal(boot.products.find(p=>p.id===pkg).qty,20);assert.equal(boot.products.find(p=>p.id===pkg).cost,500);pass('Receive stock, weighted cost and retry deduplication');
 const input={key:'sale-1',cart:[{id:pkg,qty:3},{id:drink,qty:2}],payment:'Cash',date:day};const sale=await ok('sale',input);assert.equal(sale.bill.total,7000);assert.equal(sale.bill.lines.length,2);assert.equal(sale.products.length,2);assert.equal(sale.products.find(p=>p.id===pkg).qty,17);pass('Mixed sale with real postgres.js JSON parameters and receipt');
 await ok('sale',input);assert.equal((await ok('bootstrap')).products.find(p=>p.id===pkg).qty,17);pass('Sale retry does not duplicate bill or reduce stock twice');
 assert.equal((await request('sale',{...input,key:'oversell',cart:[{id:pkg,qty:100}]})).status,400);assert.equal((await ok('bootstrap')).products.find(p=>p.id===pkg).qty,17);pass('Overselling rejected without changing stock');
 await ok('wastage',{key:'waste-1',product:pkg,qty:2,date:day,note:'Expired'});await ok('expense',{key:'expense-1',date:day,category:'Other',amount:'2',note:'Test'});pass('Wastage and expense');
 const report=await ok('report&from='+day+'&to='+day);assert.equal(report.totals.revenue,7000);assert.equal(report.totals.net,300);assert.equal(report.totals.prepared,4000);pass('Revenue and known-profit calculations');
 for(const range of ['7','30','90','all']){const d=await ok('dashboard&range='+range);assert.deepEqual(d.totals,report.totals);assert.ok(d.series.length>=7)}pass('Dashboard 7/30/90/all agrees with reports');
 await ok('product',{id:pkg,name:'Renamed',category:master('category'),brand:master('brand'),price:'12',low:2});assert.equal((await ok('bill&id=sale-1')).lines.find(l=>l.product===pkg).price,1000);pass('Historical receipt retains original price');
 await ok('cancel',{id:'sale-1',reason:'Test return'});await ok('cancel',{id:'sale-1',reason:'Test return'});assert.equal((await ok('bootstrap')).products.find(p=>p.id===pkg).qty,18);assert.equal((await ok('report&from='+day+'&to='+day)).totals.revenue,0);pass('Cancellation restores stock once and removes revenue');
 await ok('adjustment',{key:'adjust-1',product:pkg,qty:16,date:day,note:'Physical count'});assert.equal((await ok('bootstrap')).products.find(p=>p.id===pkg).qty,16);pass('Physical stock adjustment');
 assert.ok(Array.isArray(await ok('export&from='+day+'&to='+day)));pass('Report export');
 const onlyDrink=await ok('sale',{key:'prepared-only',cart:[{id:drink,qty:1}],payment:'Cash',date:day});assert.equal(onlyDrink.bill.total,2000);assert.equal(onlyDrink.bill.lines.length,1);assert.equal((await sql`SELECT count(*) n FROM juicecraft.movements WHERE sale='prepared-only'`)[0].n,0);pass('Prepared-only bill writes lines without stock movements');
 const oldBill=await ok('bill&id=sale-1');
 const current=(await ok('bootstrap')).products.find(p=>p.id===pkg);
 await ok('product',{id:pkg,name:'',price:'25',cost:'8',qty:current.qty,category:'',brand:'',low:''});
 const edited=(await ok('bootstrap')).products.find(p=>p.id===pkg);assert.equal(edited.price,2500);assert.equal(edited.cost,800);assert.equal(edited.name,current.name);
 assert.deepEqual(await ok('bill&id=sale-1'),oldBill);
 await ok('product',{id:pkg,delete:true});assert.ok(!(await ok('bootstrap')).products.some(p=>p.id===pkg));assert.deepEqual(await ok('bill&id=sale-1'),oldBill);
 assert.equal((await request('sale',{key:'deleted-sale',cart:[{id:pkg,qty:1}],date:day,payment:'Cash'})).status,400);
 const blank=await ok('product',{key:'blank-product',kind:'packaged',name:'',price:'',cost:'',qty:'',category:'',brand:'',low:''});assert.ok(blank.id);
 pass('Editable prices, optional fields, delete and historical bill preservation');
 await ok('product',{id:pkg,delete:true});pass('Repeated delete is safe');
 await ok('logout',{});assert.equal((await request('bootstrap')).status,401);pass('Sign out revokes session');
 console.log(JSON.stringify({passed:checks},null,2));
}finally{await sql.end();await server.stop();await db.close()}
