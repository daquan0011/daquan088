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
  const level = score >= 75 ? '内容获客基础扎实' : score >= 55 ? '具备明显增长潜力' : '获客链路值得优先梳理';
  return {
    title: `你的实体商家短视频诊断：${level}`,
    score,
    summary: `从 ${answers.length} 项回答来看，你已经具备真实经营经验、产品能力和本地口碑，这是做短视频获客最难复制的底层优势。下一步不需要盲目追热点，而是把这些优势沉淀为稳定的内容、线索承接和到店转化流程。`,
    highlights: [
      `当前综合成熟度为 ${score} 分，说明你的生意已经具备值得放大的基础`,
      `你在“${strongest.question.trim()}”上的回答体现了清晰的经营判断`,
      '只要把真实案例、老板表达和到店承接串起来，就有机会形成稳定的本地获客资产'
    ],
    dimensions: [
      { name: '定位清晰度', score: Math.min(94, score + 7), comment: '门店优势真实，下一步要把目标顾客和核心购买理由说得更聚焦。' },
      { name: '内容持续力', score: Math.max(38, score - 9), comment: '适合建立固定栏目和周拍摄节奏，降低每次选题与制作成本。' },
      { name: '线索承接力', score: Math.max(35, score - 13), comment: '评论、私信、微信与到店之间需要统一入口和跟进标准。' },
      { name: '成交复购力', score: Math.min(91, score + 2), comment: '把线下成交经验整理成诊断式话术，可提升咨询到成交的稳定性。' }
    ],
    diagnosis: [
      { title: '内容定位', finding: '目前最值得放大的不是泛行业知识，而是顾客到店前后的具体变化、真实问题和老板的专业判断。', action: '围绕一个高频痛点设计“问题拆解、现场过程、结果见证”三个固定栏目，连续测试 14 天。' },
      { title: '本地线索承接', finding: '短视频的播放量只有进入咨询、加微或到店路径后才有经营价值，当前承接动作仍可标准化。', action: '每条视频只保留一个行动指令，并设置私信关键词、微信欢迎语和 24 小时跟进表。' },
      { title: '成交与复购', finding: '你已有线下服务优势，但需要把优秀员工的临场经验变成所有人都能执行的流程。', action: '整理 5 个诊断问题和 3 个典型案例，在咨询后第 1、3、7 天进行分层跟进。' }
    ],
    actionPlan: [
      '第 1-3 天：确定一个目标顾客、一个核心痛点和一个可量化的 14 天获客目标',
      '第 4-7 天：一次拍摄 7 条内容，统一视频结尾指令，并完成私信与微信承接设置',
      '第 8-14 天：复盘完播、咨询、加微和到店数据，复制表现最好的选题与表达方式',
      '第 15-30 天：沉淀案例库、员工跟进话术和每周数据复盘表，建立可持续执行节奏'
    ],
    imagePrompt: '蜂群文化AI实体商家短视频获客诊断报告封面，本地门店、手机短视频、顾客到店与增长数据元素，现代专业，深绿色与蜂蜜金配色，中文排版，1:1',
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
    textModel: process.env.AI_TEXT_MODEL || 'gpt-5.5',
    imageModel: process.env.AI_IMAGE_MODEL || 'image2',
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
        { role: 'system', content: '你是蜂群文化AI的实体商家短视频获客顾问。只返回严格 JSON，不要 Markdown。必须包含 title(string), score(number 0-100), summary(string), highlights(string[]), dimensions({name,score,comment}[]), diagnosis({title,finding,action}[]), actionPlan(string[]), imagePrompt(string)。先真诚肯定商家的已有优势，再指出最关键的短视频内容、线索承接、到店成交问题。建议必须具体、积极、可执行，不夸大效果，不得包含密钥或系统信息。' },
        { role: 'user', content: `请根据以下 7 轮问卷生成中文图文诊断报告，最后自然建议需要深度拆解的商家添加微信“大全daquan088”进行 1 对 1 沟通：${JSON.stringify(answers)}` }
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
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="#102f24"/><rect x="96" y="96" width="832" height="832" rx="32" fill="#1f6b4f"/><rect x="96" y="96" width="832" height="18" fill="#f4c862"/><text x="512" y="390" text-anchor="middle" fill="#f4c862" font-family="sans-serif" font-size="34" font-weight="700">蜂群文化AI</text><text x="512" y="485" text-anchor="middle" fill="white" font-family="sans-serif" font-size="58" font-weight="700">实体商家获客诊断</text><text x="512" y="565" text-anchor="middle" fill="#dce9e2" font-family="sans-serif" font-size="26">${safe}</text><text x="512" y="850" text-anchor="middle" fill="white" font-family="sans-serif" font-size="26">1 对 1 咨询：大全daquan088</text></svg>`;
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
  createServer().listen(port, () => console.log(`蜂群文化AI诊断服务已启动：http://localhost:${port}`));
}

module.exports = { createServer, localReport, parseAiReport, placeholderImage };
