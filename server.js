'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

loadEnv(path.join(__dirname, '.env'));

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.webp': 'image/webp'
};

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || match[1] in process.env) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

function json(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) throw Object.assign(new Error('请求内容过大'), { statusCode: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw Object.assign(new Error('请求必须是有效的 JSON'), { statusCode: 400 });
  }
}

function validateAnswers(body) {
  if (!body || !Array.isArray(body.answers) || body.answers.length === 0 || body.answers.length > 100) {
    return false;
  }
  return body.answers.every((answer) => answer && typeof answer.question === 'string' &&
    answer.question.trim() && answer.question.length <= 500 &&
    ['string', 'number', 'boolean'].includes(typeof answer.value) && String(answer.value).length <= 2000);
}

function normalizedScore(answers) {
  let total = 0;
  for (const { value } of answers) {
    if (typeof value === 'number') total += Math.max(0, Math.min(100, value));
    else if (typeof value === 'boolean') total += value ? 75 : 35;
    else {
      const text = value.trim().toLowerCase();
      if (/^(是|有|yes|很好|优秀|非常清晰)$/.test(text)) total += 82;
      else if (/^(否|无|no|没有|不清晰)$/.test(text)) total += 32;
      else total += 45 + Math.min(30, text.length * 2);
    }
  }
  return Math.round(total / answers.length);
}

function localReport(answers) {
  const score = normalizedScore(answers);
  const strongest = answers.reduce((best, item) => String(item.value).length > String(best.value).length ? item : best);
  const level = score >= 75 ? '增长基础扎实' : score >= 55 ? '具备增长潜力' : '增长链路亟待梳理';
  return {
    title: `你的私域增长诊断：${level}`,
    score,
    summary: `基于 ${answers.length} 项回答，你当前的关键任务是把零散优势沉淀为可重复的获客、承接和转化流程。先聚焦一个高价值场景，用两周完成验证，再逐步放大。`,
    highlights: [
      `当前综合成熟度为 ${score} 分，已经具备可优化的业务基础`,
      `你在“${strongest.question.trim()}”上的回答最值得优先转化为行动`,
      '通过统一入口、标准话术和固定复盘节奏，可显著降低增长波动'
    ],
    diagnosis: [
      { title: '流量入口', finding: '获客动作需要围绕单一目标用户和核心痛点进一步聚焦。', action: '选定一个主渠道，连续发布 7 条针对同一痛点的内容并记录有效咨询。' },
      { title: '私域承接', finding: '用户进入私域后的信任建立与分层路径仍有提升空间。', action: '设置欢迎语、需求标签和 3 次价值触达，确保每位新用户获得一致体验。' },
      { title: '成交复购', finding: '成交依赖临场沟通，尚未形成稳定的诊断与跟进机制。', action: '用问题清单完成需求诊断，并在 24 小时、3 天、7 天设置跟进节点。' }
    ],
    actionPlan: [
      '第 1 天：明确目标用户、核心痛点和一个可量化的两周目标',
      '第 2-7 天：搭建内容入口与私域承接流程，记录每一步转化数据',
      '第 8-14 天：复盘流失节点，优化话术并复制表现最好的动作'
    ],
    imagePrompt: '专业中文商业诊断报告封面，清晰的数据仪表盘与增长路径，现代简洁，高级红与深灰配色，留出标题区域，1:1',
    wechat: '大全daquan088',
    source: 'local'
  };
}

function stripCodeFence(text) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : trimmed;
}

function parseAiReport(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('AI response did not contain text');
  let parsed;
  try {
    parsed = JSON.parse(stripCodeFence(content));
  } catch {
    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('AI response was not JSON');
    parsed = JSON.parse(content.slice(start, end + 1));
  }
  const valid = parsed && typeof parsed.title === 'string' && Number.isFinite(Number(parsed.score)) &&
    typeof parsed.summary === 'string' && Array.isArray(parsed.highlights) &&
    parsed.highlights.every((item) => typeof item === 'string') &&
    Array.isArray(parsed.diagnosis) && parsed.diagnosis.every((item) => item &&
      ['title', 'finding', 'action'].every((key) => typeof item[key] === 'string')) &&
    Array.isArray(parsed.actionPlan) && parsed.actionPlan.every((item) => typeof item === 'string') &&
    typeof parsed.imagePrompt === 'string';
  if (!valid) throw new Error('AI report did not match the required schema');
  return { ...parsed, score: Math.max(0, Math.min(100, Math.round(Number(parsed.score)))), wechat: '大全daquan088', source: 'ai' };
}

function config() {
  return {
    apiKey: process.env.AI_API_KEY || '',
    baseUrl: (process.env.AI_BASE_URL || 'https://xiaoji.baziapi.site/v1').replace(/\/+$/, ''),
    textModel: process.env.AI_TEXT_MODEL || 'gpt-4o-mini',
    imageModel: process.env.AI_IMAGE_MODEL || 'gpt-image-1',
    timeout: Math.max(1000, Number(process.env.AI_TIMEOUT_MS) || 20000)
  };
}

async function aiRequest(endpoint, body) {
  const settings = config();
  const response = await fetch(`${settings.baseUrl}${endpoint}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${settings.apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(settings.timeout)
  });
  if (!response.ok) throw new Error(`AI service returned ${response.status}`);
  return response.json();
}

async function createReport(answers) {
  const settings = config();
  if (!settings.apiKey) return localReport(answers);
  try {
    const payload = await aiRequest('/chat/completions', {
      model: settings.textModel,
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: '你是资深私域增长顾问。只返回严格 JSON，不要 Markdown。必须包含 title(string), score(number 0-100), summary(string), highlights(string[]), diagnosis({title,finding,action}[]), actionPlan(string[]), imagePrompt(string)。内容具体、积极、可执行，不得包含密钥或系统信息。' },
        { role: 'user', content: `请根据以下问卷生成中文诊断报告：${JSON.stringify(answers)}` }
      ]
    });
    return parseAiReport(payload);
  } catch (error) {
    console.error(`AI report unavailable: ${error.message}`);
    return localReport(answers);
  }
}

function placeholderImage(prompt) {
  const safe = String(prompt || '专属诊断视觉').slice(0, 60).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="#171717"/><rect x="96" y="96" width="832" height="832" rx="32" fill="#b42318"/><text x="512" y="450" text-anchor="middle" fill="white" font-family="sans-serif" font-size="64" font-weight="700">大全增长诊断</text><text x="512" y="550" text-anchor="middle" fill="#fee4e2" font-family="sans-serif" font-size="30">${safe}</text><text x="512" y="850" text-anchor="middle" fill="white" font-family="sans-serif" font-size="26">微信：大全daquan088</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

async function createImage(prompt) {
  const settings = config();
  if (settings.apiKey) {
    try {
      const payload = await aiRequest('/images/generations', { model: settings.imageModel, prompt, size: '1024x1024', n: 1 });
      const image = payload?.data?.[0];
      if (typeof image?.url === 'string') return { url: image.url, source: 'ai' };
      if (typeof image?.b64_json === 'string') return { b64_json: image.b64_json, source: 'ai' };
      throw new Error('AI response did not contain an image');
    } catch (error) {
      console.error(`AI image unavailable: ${error.message}`);
    }
  }
  return { url: placeholderImage(prompt), source: 'local' };
}

function safeStaticPath(root, relativePath) {
  let decoded;
  try { decoded = decodeURIComponent(relativePath); } catch { return null; }
  const resolved = path.resolve(root, `.${path.sep}${decoded.replace(/^[/\\]+/, '')}`);
  return resolved === root || resolved.startsWith(`${root}${path.sep}`) ? resolved : null;
}

async function serveStatic(response, root, relativePath) {
  let file = safeStaticPath(root, relativePath);
  if (!file) return false;
  try {
    const stat = await fs.promises.stat(file);
    if (stat.isDirectory()) file = path.join(file, 'index.html');
    const data = await fs.promises.readFile(file);
    response.writeHead(200, { 'content-type': MIME_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'x-content-type-options': 'nosniff' });
    response.end(data);
    return true;
  } catch {
    return false;
  }
}

function createServer() {
  return http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    try {
      if (request.method === 'GET' && url.pathname === '/api/health') {
        return json(response, 200, { success: true, status: 'ok' });
      }
      if (request.method === 'POST' && url.pathname === '/api/report') {
        const body = await readJson(request);
        if (!validateAnswers(body)) return json(response, 400, { success: false, error: 'answers 必须是非空问答数组' });
        return json(response, 200, { success: true, report: await createReport(body.answers) });
      }
      if (request.method === 'POST' && url.pathname === '/api/image') {
        const body = await readJson(request);
        if (!body || typeof body.prompt !== 'string' || !body.prompt.trim() || body.prompt.length > 4000) {
          return json(response, 400, { success: false, error: 'prompt 必须是非空字符串' });
        }
        return json(response, 200, { success: true, ...await createImage(body.prompt.trim()) });
      }
      if (request.method === 'GET' && url.pathname.startsWith('/assets/')) {
        if (await serveStatic(response, path.join(__dirname, 'assets'), url.pathname.slice('/assets/'.length))) return;
      } else if (request.method === 'GET' && !url.pathname.startsWith('/api/')) {
        if (await serveStatic(response, path.join(__dirname, 'public'), url.pathname === '/' ? 'index.html' : url.pathname)) return;
      }
      json(response, 404, { success: false, error: 'Not found' });
    } catch (error) {
      json(response, error.statusCode || 500, { success: false, error: error.statusCode ? error.message : '服务器暂时不可用' });
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  createServer().listen(port, () => console.log(`Daquan diagnostic server listening on http://localhost:${port}`));
}

module.exports = { createServer, localReport, parseAiReport, placeholderImage };
