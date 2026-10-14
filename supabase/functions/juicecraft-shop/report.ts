import {one,date} from './server.ts';
// One round trip, one consistent snapshot; retain the existing response contract.
export async function getReport(from:string,to:string,offset=0){
 date(from);date(to);if(from>to)throw new Error('Start date must be before the end date.');
 const row=await one(`WITH s AS (SELECT * FROM sales WHERE date BETWEEN ? AND ?),
 totals AS (SELECT COALESCE(SUM(total),0) revenue,COALESCE(SUM(packaged-cost),0) margin,COALESCE(SUM(prepared),0) prepared,COALESCE(SUM(units),0) units,COUNT(*) bills FROM s WHERE status='completed')
 SELECT json_build_object(
 'totals',(SELECT row_to_json(t) FROM totals t),
 'waste',(SELECT COALESCE(SUM(-qty*cost),0) FROM movements WHERE type IN ('wastage','adjustment') AND qty<0 AND date BETWEEN ? AND ?),
 'expenses',(SELECT COALESCE(SUM(amount),0) FROM expenses WHERE date BETWEEN ? AND ?),
 'sales',COALESCE((SELECT json_agg(x) FROM (SELECT * FROM sales WHERE date BETWEEN ? AND ? ORDER BY date DESC,time DESC LIMIT 50 OFFSET ?) x),'[]'::json),
 'count',(SELECT COUNT(*) FROM s),
 'items',COALESCE((SELECT json_agg(x) FROM (SELECT l.name,l.brand,l.category,SUM(l.qty) qty,SUM(l.qty*l.price) revenue FROM lines l JOIN s ON s.id=l.sale WHERE s.status='completed' GROUP BY l.product,l.name,l.brand,l.category ORDER BY revenue DESC LIMIT 100) x),'[]'::json),
 'payments',COALESCE((SELECT json_agg(x) FROM (SELECT payment,SUM(total) total FROM s WHERE status='completed' GROUP BY payment) x),'[]'::json)
 ) data`,from,to,from,to,from,to,from,to,offset);
 const {waste,expenses,...data}=row.data;
 return {...data,totals:{...data.totals,waste:Math.round(waste),expenses,net:Math.round(data.totals.margin-waste-expenses)}};
}
