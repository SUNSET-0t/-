import test from 'node:test';
import assert from 'node:assert/strict';
import {
    PROVIDERS, STAGES, DEFAULT_GENERATION_OPTIONS, getProvider, resolveEndpoint,
    createChannelMetadata, modelCacheScope, normalizeModelPage, resolveStageRoute,
} from '../connections/providers.mjs';

test('catalog separates native protocols and has no fixed model IDs', () => {
    assert.notEqual(getProvider('google-ai-studio').protocol, getProvider('openai').protocol);
    assert.notEqual(getProvider('anthropic').protocol, getProvider('openai').protocol);
    assert.equal(getProvider('google-vertex').endpointMode, 'project-location');
    assert(PROVIDERS.every(item => !Object.hasOwn(item, 'models')));
    assert(Object.isFrozen(PROVIDERS[0]));
});

test('official URLs are fixed even if an imported config tries to override one', () => {
    assert.equal(resolveEndpoint({providerId:'openai'}).modelListUrl,'https://api.openai.com/v1/models');
    assert.equal(resolveEndpoint({providerId:'google-ai-studio'}).modelListUrl,'https://generativelanguage.googleapis.com/v1beta/models');
    assert.throws(() => resolveEndpoint({providerId:'google-ai-studio',baseUrl:'https://relay.example/v1'}));
    assert.equal(resolveEndpoint({providerId:'openai',baseUrl:'https://api.openai.com/v1/'}).baseUrl,'https://api.openai.com/v1');
    assert.throws(() => getProvider('unknown-provider'));
});

test('custom endpoints are deliberate and reject secrets in URLs', () => {
    assert.equal(resolveEndpoint({providerId:'custom-openai',baseUrl:'https://relay.example/v1/'}).modelListUrl,'https://relay.example/v1/models');
    assert.equal(resolveEndpoint({providerId:'custom-openai',baseUrl:'http://127.0.0.1:8000/v1'}).baseUrl,'http://127.0.0.1:8000/v1');
    for (const baseUrl of ['javascript:alert(1)','https://user:password@relay.example/v1','https://relay.example/v1?key=secret','https://relay.example/v1#secret','http://relay.example/v1','https://relay.example/v1/chat/completions']) {
        assert.throws(() => resolveEndpoint({providerId:'custom-openai',baseUrl}));
    }
});

test('Vertex URL is built from validated project and location, not an AI Studio URL', () => {
    assert.equal(resolveEndpoint({providerId:'google-vertex',projectId:'demo-project',location:'global'}).baseUrl,
        'https://aiplatform.googleapis.com/v1/projects/demo-project/locations/global/publishers/google');
    assert.equal(resolveEndpoint({providerId:'google-vertex',projectId:'demo-project',location:'us-central1'}).baseUrl,
        'https://us-central1-aiplatform.googleapis.com/v1/projects/demo-project/locations/us-central1/publishers/google');
    for (const location of ['evil.example/path','../../x','']) {
        assert.throws(() => resolveEndpoint({providerId:'google-vertex',projectId:'demo-project',location}));
    }
});

test('metadata never accepts keys and a key revision invalidates model cache', () => {
    const input = {id:'chan1',providerId:'openai',name:'常规'};
    const metadata = createChannelMetadata(input);
    assert.deepEqual(input,{id:'chan1',providerId:'openai',name:'常规'});
    for (const key of ['apiKey','api_key','key','token','accessToken','authorization','headers','credentials']) {
        assert.throws(() => createChannelMetadata({...input,[key]:'NOT-A-REAL-KEY'}));
    }
    assert.notEqual(modelCacheScope(metadata),modelCacheScope({...metadata,credentialRevision:1}));
    assert.equal(JSON.stringify(metadata).includes('NOT-A-REAL-KEY'),false);
});

test('model normalization preserves only actual IDs and unknown capabilities remain unknown', () => {
    const page = normalizeModelPage('openai',{data:[{id:'example-a'},{id:'example-a'},{id:'example-b'}]});
    assert.deepEqual(page.models.map(x => x.id),['example-a','example-b']);
    assert.equal(page.models[0].textGeneration,null);
    assert.equal(page.models[0].inferenceVerified,false);
    assert.deepEqual(normalizeModelPage('openai',{data:[]}).models,[]);
    assert.throws(() => normalizeModelPage('openai',{error:{message:'Unauthorized'}}));
    assert.throws(() => normalizeModelPage('openai',{data:[{}]}));
});

test('native Gemini pagination and explicit generation capabilities remain distinct', () => {
    const result = normalizeModelPage('google-ai-studio',{
        models:[{name:'models/example-text',supportedGenerationMethods:['generateContent']},
        {name:'models/example-embedding',supportedGenerationMethods:['embedContent']}],nextPageToken:'next-page',
    });
    assert.equal(result.models[0].id,'models/example-text');
    assert.equal(result.models[0].textGeneration,true);
    assert.equal(result.models[1].textGeneration,false);
    assert.equal(result.nextCursor,'next-page');
});

test('Anthropic pagination fails clearly if incomplete; unknown discovery is not guessed', () => {
    assert.equal(normalizeModelPage('anthropic',{data:[{id:'example'}],has_more:true,last_id:'example'}).nextCursor,'example');
    assert.throws(() => normalizeModelPage('anthropic',{data:[],has_more:true}));
    assert.equal(resolveEndpoint({providerId:'volcengine-ark-beijing'}).modelListUrl,null);
    assert.equal(resolveEndpoint({providerId:'volcengine-ark-beijing'}).requiresDiscoveryAdapter,true);
});

test('four stages each select a single explicit channel/model; no silent fallback', () => {
    const channels = [createChannelMetadata({id:'chan1',providerId:'openai'})];
    const routes = Object.fromEntries(STAGES.map(s => [s.id,{channelId:'chan1',modelId:'example-a'}]));
    for (const {id} of STAGES) assert.equal(resolveStageRoute(id,routes,channels).plannedGenerationRequests,1);
    assert.throws(() => resolveStageRoute('regular',{},channels));
    assert.throws(() => resolveStageRoute('regular',{regular:{channelId:'missing',modelId:'example'}},channels));
    assert.throws(() => resolveStageRoute('not-a-stage',routes,channels));
    assert.equal(DEFAULT_GENERATION_OPTIONS.temperature,null);
    assert.equal(DEFAULT_GENERATION_OPTIONS.reasoning,'provider-default');
    assert.equal(DEFAULT_GENERATION_OPTIONS.stream,false);
});
