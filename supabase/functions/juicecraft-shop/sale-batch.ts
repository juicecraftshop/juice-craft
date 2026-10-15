import {sql} from './server.ts';
export function saleCommands(rows:any[],sale:string,date:string,time:string){
 const lines=JSON.stringify(rows.map(p=>({id:crypto.randomUUID(),sale,product:p.id,name:p.name+(p.variant?' · '+p.variant:''),brand:p.brand_name??'',category:p.category_name,kind:p.kind,price:p.price,cost:p.cost,qty:p.q})));
 const packaged=JSON.stringify(rows.filter(p=>p.kind==='packaged').map(p=>({id:crypto.randomUUID(),product:p.id,date,time,qty:p.q,cost:p.cost,sale})));
 // One statement writes receipt lines, stock and history in the existing transaction.
 return [sql(`WITH line_input AS (SELECT * FROM jsonb_to_recordset(?::text::jsonb) AS x(id text,sale text,product text,name text,brand text,category text,kind text,price bigint,cost double precision,qty integer)),
 stock_input AS (SELECT * FROM jsonb_to_recordset(?::text::jsonb) AS x(id text,product text,date text,time text,qty integer,cost double precision,sale text)),
 saved_lines AS (INSERT INTO lines(id,sale,product,name,brand,category,kind,price,cost,qty) SELECT id,sale,product,name,brand,category,kind,price,cost,qty FROM line_input RETURNING id),
 updated_stock AS (UPDATE products p SET qty=p.qty-x.qty FROM stock_input x WHERE p.id=x.product RETURNING p.id)
 INSERT INTO movements(id,product,date,time,type,qty,cost,note,sale) SELECT id,product,date,time,'sale',-qty,cost,'Sale',sale FROM stock_input`,lines,packaged)];
}
