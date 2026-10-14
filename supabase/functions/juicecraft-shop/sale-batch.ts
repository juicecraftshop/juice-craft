import {sql} from './server.ts';
export function saleCommands(rows:any[],sale:string,date:string,time:string){
 const lines=JSON.stringify(rows.map(p=>({id:crypto.randomUUID(),sale,product:p.id,name:p.name+(p.variant?' · '+p.variant:''),brand:p.brand_name??'',category:p.category_name,kind:p.kind,price:p.price,cost:p.cost,qty:p.q})));
 const packaged=JSON.stringify(rows.filter(p=>p.kind==='packaged').map(p=>({id:crypto.randomUUID(),product:p.id,date,time,qty:p.q,cost:p.cost,sale})));
 return [
 sql(`INSERT INTO lines(id,sale,product,name,brand,category,kind,price,cost,qty) SELECT id,sale,product,name,brand,category,kind,price,cost,qty FROM jsonb_to_recordset(?::text::jsonb) AS x(id text,sale text,product text,name text,brand text,category text,kind text,price bigint,cost double precision,qty integer)`,lines),
 sql(`UPDATE products p SET qty=p.qty-x.qty FROM jsonb_to_recordset(?::text::jsonb) AS x(product text,qty integer) WHERE p.id=x.product`,packaged),
 sql(`INSERT INTO movements(id,product,date,time,type,qty,cost,note,sale) SELECT id,product,date,time,'sale',-qty,cost,'Sale',sale FROM jsonb_to_recordset(?::text::jsonb) AS x(id text,product text,date text,time text,qty integer,cost double precision,sale text)`,packaged)
 ];
}
