import {one} from './server.ts';
// One database round trip for the dashboard; daily aggregates also feed period totals.
export async function dashboardData(from:string,end:string){
 const row=await one(`WITH s AS (SELECT * FROM sales WHERE date BETWEEN ? AND ?),
 l AS (SELECT date,-qty*cost amount FROM movements WHERE date BETWEEN ? AND ? AND type IN ('wastage','adjustment') AND qty<0),
 e AS (SELECT date,amount FROM expenses WHERE date BETWEEN ? AND ?)
 SELECT json_build_object(
 'days',COALESCE((SELECT json_agg(x) FROM (SELECT date,SUM(total) revenue,SUM(packaged-cost) margin,SUM(prepared) prepared,SUM(units) units,COUNT(*) bills FROM s WHERE status='completed' GROUP BY date) x),'[]'::json),
 'losses',COALESCE((SELECT json_agg(x) FROM (SELECT date,SUM(amount) total FROM l GROUP BY date) x),'[]'::json),
 'expenses',COALESCE((SELECT json_agg(x) FROM (SELECT date,SUM(amount) total FROM e GROUP BY date) x),'[]'::json),
 'sales',COALESCE((SELECT json_agg(x) FROM (SELECT * FROM s ORDER BY date DESC,time DESC LIMIT 5) x),'[]'::json),
 'items',COALESCE((SELECT json_agg(x) FROM (SELECT li.name,li.brand,li.category,SUM(li.qty) qty,SUM(li.qty*li.price) revenue FROM lines li JOIN s ON s.id=li.sale WHERE s.status='completed' GROUP BY li.product,li.name,li.brand,li.category ORDER BY revenue DESC LIMIT 4) x),'[]'::json),
 'stock',(SELECT json_build_object('value',COALESCE(SUM(qty*cost),0),'count',COUNT(*)) FROM products WHERE kind='packaged' AND active=1)
 ) data`,from,end,from,end,from,end);
 return row.data;
}
export function summarize(days:any[],losses:any[],expenses:any[],date?:string){
 const sum=(rows:any[],key:string)=>rows.filter(r=>!date||r.date===date).reduce((v,r)=>v+Number(r[key]??0),0);
 const margin=sum(days,'margin'),waste=Math.round(sum(losses,'total')),exp=sum(expenses,'total');
 // Match the report's rounding of combined loss, rather than rounding each day.
 return {revenue:sum(days,'revenue'),margin,prepared:sum(days,'prepared'),units:sum(days,'units'),bills:sum(days,'bills'),waste,expenses:exp,net:Math.round(margin-sum(losses,'total')-exp)};
}
export function bucketRows(rows:any[],monthly:boolean){
 if(!monthly)return rows;
 const buckets=new Map<string,any>();
 for(const row of rows){const date=row.date.slice(0,7),value=buckets.get(date)??{date};for(const key of Object.keys(row))if(key!=='date')value[key]=(value[key]??0)+Number(row[key]??0);buckets.set(date,value)}
 return [...buckets.values()];
}
