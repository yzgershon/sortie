const assert = require('node:assert/strict');
const N = require('../worker/notebook.mjs');
let checks = 0;
async function test(name, fn) { await fn(); checks++; console.log('PASS ' + name); }
const member = { active: true, role: 'cadet' }, token = { uid: 'cadet', email_verified: true, firebase: { sign_in_provider: 'google.com' }, auth_time: 100 };
const jpeg = Buffer.from([255,216,255,192,0,11,8,0,16,0,16,1,1,17,0,255,217]);
const image = 'data:image/jpeg;base64,' + jpeg.toString('base64');
const result = { sections: [{ kind: 'goals', heading: 'יעדים', items: [{ text: 'תכנון זמן', mark: 'unclear', uncertain: true }] }] };
async function request(overrides = {}, deps = {}) {
  const calls = [], headers = { Origin: 'https://yzgershon.github.io', 'Content-Type': 'application/json', Authorization: 'Bearer ' + 'x'.repeat(30), ...(overrides.headers || {}) };
  const req = { method: 'POST', body: { image }, ...overrides, get: name => headers[name] };
  const res = { code: 200, headers: {}, set(k,v) { this.headers[k] = v; return this; }, status(n) { this.code = n; return this; }, json(value) { this.body = value; return this; }, send(value) { this.body = value; return this; } };
  await N.handler({ verify: async () => token, member: async () => member, instructor: async () => 'owner', policy: async () => ({ enabled: true, model: 'gpt-6-luna' }), reserve: async () => { calls.push('reserve'); }, transcribe: async () => { calls.push('model'); return result; }, ...deps })(req,res);
  return { ...res, calls };
}
(async () => {
  await test('reader instructions preserve literal text and separate list counters', () => { assert(N.prompt.includes('Omit a leading list bullet')); assert(N.prompt.includes('do not normalize spelling')); });
  await test('explicit verified Google member required', () => {
    assert(N.authorized(token, member));
    for (const t of [{ ...token, email_verified: false }, { ...token, firebase: { sign_in_provider: 'password' } }, null]) assert(!N.authorized(t, member));
    assert(!N.authorized(token, { ...member, active: false })); assert(!N.authorized(token, { ...member, role: 'admin' }));
  });
  await test('revocation timestamp enforced', () => { assert(!N.authorized(token, { ...member, authNotBefore: 100 })); assert(N.authorized(token, { ...member, authNotBefore: 99 })); });
  await test('sole instructor UID enforced', () => { assert(!N.authorized(token, { active: true, role: 'instructor' }, 'owner')); assert(N.authorized({ ...token, uid: 'owner' }, { active: true, role: 'instructor' }, 'owner')); });
  await test('JPEG type and dimensions bounded', () => {
    assert.equal(N.validateImage({ image }), image);
    for (const body of [{ image: 'https://example.com/image' }, { image: image.replace('jpeg', 'svg+xml') }, { image, history: [] }, { image: 'data:image/jpeg;base64,YQ==' }]) assert.throws(() => N.validateImage(body));
    const big = Buffer.from(jpeg); big.writeUInt16BE(5000, 7); assert.throws(() => N.validateImage({ image: 'data:image/jpeg;base64,' + big.toString('base64') }));
  });
  await test('malformed and oversized model output rejected', () => {
    assert.deepEqual(N.validateResult(result), result); assert.throws(() => N.validateResult({ ...result, extra: true }));
    assert.throws(() => N.validateResult({ sections: [{ ...result.sections[0], items: Array(151).fill(result.sections[0].items[0]) }] }));
  });
  await test('quota bounds bursts, users, global day and month', () => {
    const now = Date.UTC(2026, 9, 14), first = N.quota({}, {}, now);
    assert.equal(first.user.daily, 1);
    for (const [u,g] of [[{ ...first.user, burst: 3 }, {}], [{ ...first.user, daily: 20 }, {}], [{}, { ...first.global, daily: 200 }], [{}, { ...first.global, monthly: 2000 }]]) assert.throws(() => N.quota(u,g,now), /TOO_MANY/);
    assert.equal(N.quota(first.user,first.global,now + 86400000).user.daily, 1);
  });
  await test('untrusted origin and absent token cannot call model', async () => {
    for (const headers of [{ Origin: 'https://evil.example' }, { Authorization: '' }]) { const r = await request({ headers }); assert([401,403].includes(r.code)); assert.deepEqual(r.calls, []); }
  });
  await test('token verified with server dependency before provider call', async () => { const r = await request({}, { verify: async () => { throw Error('secret token detail'); } }); assert.equal(r.code, 401); assert.deepEqual(r.body, { error: 'SIGN_IN' }); assert.deepEqual(r.calls, []); });
  await test('inactive enrollment fails closed', async () => { const r = await request({}, { member: async () => ({ ...member, active: false }) }); assert.equal(r.code, 403); assert.deepEqual(r.calls, []); });
  await test('policy disabled by default', async () => { const r = await request({}, { policy: async () => null }); assert.equal(r.code, 503); assert.deepEqual(r.calls, []); });
  await test('quota blocks model before spend', async () => { const r = await request({}, { reserve: async () => { throw Object.assign(Error(), { code: 'TOO_MANY', status: 429 }); } }); assert.equal(r.code, 429); assert.deepEqual(r.calls, []); });
  await test('preflight does not authenticate or spend', async () => { const r = await request({ method: 'OPTIONS' }); assert.equal(r.code, 204); assert.deepEqual(r.calls, []); });
  await test('success is noncacheable and contains only transcription', async () => { const r = await request(); assert.equal(r.code, 200); assert.equal(r.headers['Cache-Control'], 'no-store'); assert.deepEqual(r.body, result); assert.deepEqual(r.calls, ['reserve', 'model']); });
  await test('internal/provider failures never leak details', async () => { const r = await request({}, { transcribe: async () => { throw Error('SECRET request with private text'); } }); assert.deepEqual(r.body, { error: 'FAILED' }); });
  await test('Responses request contains image only, strict schema and store false', async () => {
    let requestBody;
    const r = await N.transcribe(image, { key: 'test-key', model: 'test-model', fetchImpl: async (url, init) => {
      assert.equal(url, 'https://api.openai.com/v1/responses'); requestBody = JSON.parse(init.body);
      return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(result) }] }] }));
    } });
    assert.deepEqual(r, result); assert.equal(requestBody.store, false); assert.equal(requestBody.text.format.strict, true); assert.equal(requestBody.input[0].content.length, 1); assert.equal(requestBody.input[0].content[0].image_url, image); assert.equal(requestBody.reasoning.effort,'max'); assert.equal(requestBody.input[0].content[0].detail,'original'); assert.equal(requestBody.max_output_tokens,32000);
  });
  await test('incomplete or refused response cannot partially populate a form', async () => {
    for (const output of [{ status: 'incomplete' }, { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }] }]) await assert.rejects(N.transcribe(image, { key: 'x', model: 'x', fetchImpl: async () => new Response(JSON.stringify(output)) }), /INVALID_RESULT/);
  });
  console.log(checks + ' notebook server checks passed (mocked provider; no live OCR)');
})().catch(err => { console.error(err); process.exitCode = 1; });
