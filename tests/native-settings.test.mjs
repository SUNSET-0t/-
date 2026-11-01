import test from 'node:test';import assert from 'node:assert/strict';
import {inspectRoutes,sharedRoutes,currentChoice} from '../native/settings-model.mjs';

test('one explicit choice produces four references, not four requests',()=>{
 const routes=sharedRoutes('channel','model-a');assert.equal(Object.keys(routes).length,4);
 assert.deepEqual(inspectRoutes(routes),{kind:'shared',route:{channelId:'channel',modelId:'model-a',manual:false},complete:true});
 routes.prepare.modelId='other';assert.equal(routes.regular.modelId,'model-a');
});
test('empty configuration is not fabricated',()=>{assert.equal(inspectRoutes({}).kind,'empty');assert.equal(currentChoice({channels:[],routes:{}}),null);assert.throws(()=>sharedRoutes('','model'));assert.throws(()=>sharedRoutes('channel',''));});
test('legacy split and partial routes are inspected without overwriting',()=>{
 const routes={regular:{channelId:'a',modelId:'m1',manual:true},complex:{channelId:'b',modelId:'m2'}};const before=structuredClone(routes);
 const info=inspectRoutes(routes);assert.equal(info.kind,'split');assert.equal(info.complete,false);assert.deepEqual(routes,before);
 const result=currentChoice({channels:[{id:'a'},{id:'b'}],routes});assert.equal(result.channelId,'a');assert.equal(result.modelId,'m1');assert.deepEqual(routes,before);
});
test('existing saved auxiliary route is preferred and orphan IDs are not silently made valid',()=>{
 const state={channels:[{id:'a',defaultModel:'default',models:[]},{id:'b',models:[]}],routes:{regular:{channelId:'b',modelId:'chosen'}}};
 assert.equal(currentChoice(state).channelId,'b');assert.equal(currentChoice(state,{channelId:'a',modelId:'draft'}).modelId,'draft');
 const missing={...state,routes:{regular:{channelId:'deleted',modelId:'x'}}};assert.equal(currentChoice(missing).channelId,'a');assert.equal(missing.routes.regular.channelId,'deleted');
});
test('partial legacy common config is recognized but not auto-completed',()=>{const r={regular:{channelId:'a',modelId:'m'}};const before=structuredClone(r);assert.equal(inspectRoutes(r).kind,'shared');assert.equal(inspectRoutes(r).complete,false);assert.deepEqual(r,before);});
