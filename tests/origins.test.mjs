import {test} from 'node:test';
import assert from 'node:assert/strict';
import {allowedOrigin} from '../supabase/functions/juicecraft-shop/origins.ts';
test('allows only exact shop origins',()=>{for(const origin of ['https://juicecraftshop.github.io','https://juicecraft.vercel.app',null])assert.equal(allowedOrigin(origin),true);for(const origin of ['https://evil.vercel.app','https://juicecraft.vercel.app.attacker.test','http://juicecraft.vercel.app','null',''])assert.equal(allowedOrigin(origin),false)});
