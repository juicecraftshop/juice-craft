import {test} from 'node:test';
import assert from 'node:assert/strict';
import {summarize,bucketRows} from '../supabase/functions/juicecraft-shop/dashboard.ts';
test('dashboard keeps prepared revenue separate and subtracts losses and expenses',()=>{
 const days=[{date:'2026-10-12',revenue:2000,margin:300,prepared:500,units:4,bills:2},{date:'2026-10-13',revenue:1000,margin:200,prepared:300,units:2,bills:1}];
 const losses=[{date:'2026-10-12',total:10.25},{date:'2026-10-13',total:20.25}],expenses=[{date:'2026-10-13',total:100}];
 assert.deepEqual(summarize(days,losses,expenses),{revenue:3000,margin:500,prepared:800,units:6,bills:3,waste:31,expenses:100,net:370});
 assert.equal(summarize(days,losses,expenses,'2026-10-13').net,80);
 assert.equal(summarize([],[],[]).net,0);
 const months=bucketRows(days,true);assert.equal(months.length,1);assert.equal(months[0].date,'2026-10');assert.equal(months[0].revenue,3000);assert.equal(months[0].bills,3);
});
