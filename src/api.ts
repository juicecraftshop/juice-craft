type Row=Record<string,any>;
const SHOP_API='https://esvtvszrkhpdeuiorkjz.supabase.co/functions/v1/juicecraft-shop';
const reads=new Map<string,{value:any;expires:number}>();
const pending=new Map<string,Promise<any>>();
let generation=0;
let owner:string|null=null;
export function clearReadCache(){generation++;reads.clear();pending.clear()}
export async function api(action:string,data?:Row):Promise<any>{
 const session=sessionStorage.getItem('jc_session');
 if(session!==owner){clearReadCache();owner=session}
 const write=data!==undefined;
 if(write)clearReadCache();
 const cacheable=!write&&!!session&&action!=='bootstrap'&&!action.startsWith('export');
 const key=action;
 const epoch=generation;
 if(cacheable){const hit=reads.get(key);if(hit&&hit.expires>Date.now())return hit.value;const flight=pending.get(key);if(flight)return flight}
 const request=(async()=>{
  try{
   const headers:Record<string,string>={};if(session)headers['X-Shop-Session']=session;if(write)headers['Content-Type']='application/json';
   const r=await fetch(write?SHOP_API:SHOP_API+'?action='+action,{method:write?'POST':'GET',headers,cache:'no-store',body:write?JSON.stringify({action,...data}):undefined});
   let j:any;try{j=await r.json()}catch{throw new Error('Connection interrupted. Your entry has not been cleared. Please try again.')}
   if(!r.ok){if(r.status===401&&action!=='login'){clearReadCache();sessionStorage.removeItem('jc_session');window.dispatchEvent(new Event('jc:logout'))}throw new Error(j.error??'Something went wrong. Please try again.')}
   if(action==='login'&&j.session)sessionStorage.setItem('jc_session',j.session);
   if(action==='logout')sessionStorage.removeItem('jc_session');
   if(cacheable&&epoch===generation&&session===sessionStorage.getItem('jc_session')){if(reads.size>=40)reads.delete(reads.keys().next().value!);reads.set(key,{value:j,expires:Date.now()+15000})}
   return j;
  }finally{if(write)clearReadCache();else if(epoch===generation)pending.delete(key)}
 })();
 if(cacheable)pending.set(key,request);
 return request;
}
