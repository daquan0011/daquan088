'use strict';

const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createServer } = require('../server');

let server;
let baseUrl;

before(async () => {
  delete process.env.AI_API_KEY;
  server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test('health endpoint reports readiness', async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, status: 'ok' });
});

test('report endpoint returns a complete deterministic local fallback', async () => {
  const body = { answers: [{ question: '目前是否有稳定客源？', value: '否' }, { question: '每周内容数量', value: 4 }] };
  const first = await fetch(`${baseUrl}/api/report`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const second = await fetch(`${baseUrl}/api/report`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const firstJson = await first.json();
  const secondJson = await second.json();
  assert.equal(first.status, 200);
  assert.deepEqual(firstJson, secondJson);
  assert.equal(firstJson.success, true);
  assert.equal(firstJson.report.source, 'local');
  assert.equal(firstJson.report.wechat, '大全daquan088');
  assert.ok(firstJson.report.diagnosis.every((item) => item.title && item.finding && item.action));
});

test('report endpoint rejects invalid answers', async () => {
  const response = await fetch(`${baseUrl}/api/report`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ answers: [] }) });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).success, false);
});

test('image endpoint returns an inline fallback without AI configuration', async () => {
  const response = await fetch(`${baseUrl}/api/image`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: '增长诊断封面' })
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.source, 'local');
  assert.match(body.url, /^data:image\/svg\+xml;base64,/);
});

test('responses do not expose configured secrets', async () => {
  const secret = 'test-secret-that-must-never-leak';
  process.env.AI_API_KEY = secret;
  process.env.AI_BASE_URL = 'http://127.0.0.1:1/v1';
  process.env.AI_TIMEOUT_MS = '1000';
  const response = await fetch(`${baseUrl}/api/report`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ answers: [{ question: '目标', value: '增长' }] })
  });
  const text = await response.text();
  assert.equal(response.status, 200);
  assert.equal(text.includes(secret), false);
  assert.equal(JSON.parse(text).report.source, 'local');
  delete process.env.AI_API_KEY;
  delete process.env.AI_BASE_URL;
  delete process.env.AI_TIMEOUT_MS;
});
