import test from 'node:test';import assert from 'node:assert/strict';
import {modelRequest,parseModelPage} from '../server/protocol.mjs';
test('SiliconFlow discovery uses the documented chat filter and actual returned IDs',()=>{
    const url=new URL(modelRequest({providerId:'siliconflow'}));
    assert.equal(url.origin,'https://api.siliconflow.cn');
    assert.equal(url.pathname,'/v1/models');
    assert.equal(url.searchParams.get('sub_type'),'chat');
    const page=parseModelPage({providerId:'siliconflow'},{data:[{id:'test-vendor/example-model'}]});
    assert.deepEqual(page.models.map(x=>x.id),['test-vendor/example-model']);
    assert.equal(page.models[0].inferenceVerified,false);
});
