import {one,today} from './server.ts';
export async function bootstrapData(){const result=await one(`SELECT json_build_object('products',COALESCE((SELECT json_agg(p) FROM (SELECT p.*,c.name category_name,b.name brand_name FROM products p LEFT JOIN masters c ON c.id=p.category LEFT JOIN masters b ON b.id=p.brand ORDER BY p.name) p),'[]'::json),'masters',COALESCE((SELECT json_agg(m) FROM (SELECT * FROM masters ORDER BY name) m),'[]'::json),'settings',(SELECT row_to_json(s) FROM settings s WHERE id=1),'mustChange',(SELECT changed=0 FROM admin WHERE id=1)) data`);return {...result.data,today:today()}}
export async function billData(id:string){const row=await one(`SELECT json_build_object('sale',row_to_json(s),'lines',COALESCE((SELECT json_agg(l) FROM lines l WHERE l.sale=s.id),'[]'::json)) data FROM sales s WHERE s.id=?`,id);return row?{...row.data.sale,shop:JSON.parse(row.data.sale.shop),lines:row.data.lines}:null}

// Return only rows affected by a write, using indexed product IDs or bill lines.
export async function changedProducts(action:string,body:any,id:string){
 const filter=action==='sale'?"p.id IN (SELECT product FROM lines WHERE sale=?)":"p.id=?";
 const row=await one(`SELECT COALESCE(json_agg(p),'[]'::json) data FROM (SELECT p.*,c.name category_name,b.name brand_name FROM products p LEFT JOIN masters c ON c.id=p.category LEFT JOIN masters b ON b.id=p.brand WHERE ${filter}) p`,action==='sale'||action==='product'?id:body.product);
 return row.data;
}
