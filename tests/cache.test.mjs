import assert from 'node:assert/strict';
import {test} from 'node:test';
import vm from 'node:vm';
import fs from 'node:fs';
import {api,clearReadCache} from '../src/api.ts';
const storage=new Map([['jc_session','admin-test']]);
globalThis.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
globalThis.sessionStorage={getItem:()=>null,removeItem:()=>{}};
let signedOut=0;globalThis.window={dispatchEvent:()=>signedOut++};
test('cache reuses reads, deduplicates, expires, invalidates writes and isolates sessions',async()=>{
 let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({value:calls})};
 clearReadCache();await Promise.all([api('dashboard'),api('dashboard')]);assert.equal(calls,1);
 await api('dashboard');assert.equal(calls,1);
 const clock=Date.now;Date.now=()=>clock()+16000;await api('dashboard');assert.equal(calls,2);Date.now=clock;
 await api('sale',{cart:[]});await api('dashboard');assert.equal(calls,4);
 await api('bootstrap');await api('bootstrap');assert.equal(calls,6);
 storage.set('jc_session','other-admin');await api('dashboard');assert.equal(calls,7);
 globalThis.fetch=async()=>Response.json({error:'Please sign in.'},{status:401});
 await assert.rejects(api('bootstrap'));assert.equal(storage.has('jc_session'),false);assert.equal(signedOut,1);
 storage.set('jc_session','new-session');globalThis.fetch=async()=>{calls++;return Response.json({value:calls})};await api('dashboard');assert.equal(calls,8);
});
test('reads started before a write cannot repopulate the cache',async()=>{
 clearReadCache();let release,calls=0;
 globalThis.fetch=async(_url,init)=>{calls++;if(calls===1)return new Promise(r=>release=()=>r(Response.json({old:true})));return Response.json({ok:true})};
 const old=api('report');await api('stock',{qty:1});release();await old;await api('report');assert.equal(calls,3);
});
test('service worker caches public hashed assets only; auth, HTML and posts are excluded',async()=>{
 const handlers={};const memory=new Map();let calls=0;
 const context={URL,Response,self:{location:{href:'https://example.com/juice-craft/sw.js'},addEventListener:(n,f)=>handlers[n]=f,skipWaiting(){},clients:{claim(){}}},caches:{open:async()=>({match:async r=>memory.get(r.url),put:async(r,v)=>memory.set(r.url,v),keys:async()=>[],delete:async()=>{}})},fetch:async()=>{calls++;return {ok:true,type:'basic',clone:()=>({cached:true})}}};
 vm.runInNewContext(fs.readFileSync(new URL('../public/sw.js',import.meta.url),'utf8'),context);
 for(const [url,method] of [['https://example.com/juice-craft/','GET'],['https://db.supabase.co/functions/v1/shop','GET'],['https://example.com/juice-craft/assets/app-123.js','POST']]){
  let intercepted=false;handlers.fetch({request:{url,method},respondWith:()=>intercepted=true});assert.equal(intercepted,false);
 }
 const request={url:'https://example.com/juice-craft/assets/app-123.js',method:'GET'};
 async function visit(){let response;const tasks=[];handlers.fetch({request,respondWith:p=>response=p,waitUntil:p=>tasks.push(p)});await response;await Promise.all(tasks)}
 await visit();await visit();assert.equal(calls,1);
});

test('login persists across reopening and logout removes the saved session',async()=>{
 globalThis.fetch=async()=>Response.json({ok:true,session:'persistent-admin'});
 await api('login',{username:'admin',password:'test'});assert.equal(localStorage.getItem('jc_session'),'persistent-admin');
 clearReadCache();let token;globalThis.fetch=async(_url,init)=>{token=init.headers['X-Shop-Session'];return Response.json({ok:true})};
 await api('bootstrap');assert.equal(token,'persistent-admin');
 await api('logout',{});assert.equal(localStorage.getItem('jc_session'),null);
});
test('successful writes provide fresh inventory and receipt without follow-up fetches',async()=>{
 storage.set('jc_session','save-test');clearReadCache();let calls=0;
 const bootstrap={products:[{id:'p',qty:7}]},bill={id:'receipt-1',lines:[{qty:3}]};
 globalThis.fetch=async()=>{calls++;return Response.json({ok:true,bootstrap,bill})};
 await api('sale',{cart:[]});assert.deepEqual(await api('bootstrap'),bootstrap);assert.deepEqual(await api('bill&id=receipt-1'),bill);assert.equal(calls,1);
 await api('bootstrap');assert.equal(calls,2); // snapshot is consumed once
 globalThis.fetch=async()=>Response.json({error:'Save failed',bootstrap},{status:503});await assert.rejects(api('stock',{}));
 let requested=false;globalThis.fetch=async()=>{requested=true;return Response.json({products:[]})};await api('bootstrap');assert.equal(requested,true);
});

test('incremental save merges changed items and opens receipt without catalogue reload',async()=>{
 storage.set('jc_session','incremental-test');clearReadCache();let calls=0;
 globalThis.fetch=async(url,init)=>{
  calls++;const parsed=new URL(url);assert.equal(parsed.searchParams.get('forceFunctionRegion'),'ap-northeast-1');
  if(init.method==='POST'){assert.equal(parsed.searchParams.get('incremental'),'1');return Response.json({ok:true,products:[{id:'p',name:'Ice cream',qty:7}],bill:{id:'delta-bill',lines:[{qty:3}]}})}
  return Response.json({products:[{id:'p',name:'Ice cream',qty:10},{id:'q',name:'Juice',qty:0}],masters:[],settings:{name:'Shop'}});
 };
 await api('bootstrap');await api('sale',{cart:[{id:'p',qty:3}]});const boot=await api('bootstrap');
 assert.equal(boot.products.find(p=>p.id==='p').qty,7);assert.equal(boot.products.find(p=>p.id==='q').qty,0);
 assert.equal((await api('bill&id=delta-bill')).id,'delta-bill');assert.equal(calls,2);
});

test('item save merges only affected rows and deletion needs no catalogue request',async()=>{
 storage.set('jc_session','item-delta');clearReadCache();let calls=0;
 globalThis.fetch=async()=>{calls++;return Response.json({products:[{id:'p',name:'Item',active:1},{id:'q',name:'Other',active:1}],masters:[]})};await api('bootstrap');
 globalThis.fetch=async()=>{calls++;return Response.json({ok:true,products:[{id:'p',name:'Item',active:-1}],masters:[{id:'c',name:'Uncategorized'}]})};await api('product',{id:'p',delete:true});const boot=await api('bootstrap');assert.equal(calls,2);assert.deepEqual(boot.products.map(p=>p.id),['q']);assert.equal(boot.masters[0].id,'c');
});
