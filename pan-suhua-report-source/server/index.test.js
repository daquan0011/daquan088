import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { createApp } from "./index.js";
import { generatePromptImage, IMAGE_TIMEOUT_MS, UpstreamImageError } from "./image-api.js";

const originalEnvironment = {
  XIAOJI_API_KEY: process.env.XIAOJI_API_KEY,
  XIAOJI_BASE_URL: process.env.XIAOJI_BASE_URL,
  XIAOJI_IMAGE_MODEL: process.env.XIAOJI_IMAGE_MODEL,
  WECHAT_ID: process.env.WECHAT_ID,
};

let inputPng;
let generatedPng;
const validAnswers = {
  bowelRhythm: "规律",
  bowelEase: "大多轻松",
  gutComfort: "舒适",
  postMealGut: "餐后舒适",
  complexionSelfReport: "气色正常",
  complexionPattern: "整体稳定",
  sleep: "睡眠不足",
  stress: "压力较高",
  mood: "平稳",
};

beforeAll(async () => {
  inputPng = await sharp({
    create: { width: 2000, height: 1200, channels: 3, background: "#8aa06b" },
  }).png().toBuffer();
  generatedPng = await sharp({
    create: { width: 24, height: 16, channels: 3, background: "#d9c5a2" },
  }).png().toBuffer();
});

afterAll(() => {
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

async function withServer(app, callback) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const { port } = server.address();
  try {
    return await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function analyzeForm(overrides = {}) {
  const form = new FormData();
  form.append("photo", overrides.photo ?? new Blob([inputPng], { type: "image/png" }), "portrait.png");
  form.append("answers", overrides.answers ?? JSON.stringify(validAnswers));
  form.append("consent", overrides.consent ?? "true");
  return form;
}

describe("Suhua image API", () => {
  it("reports whether the server has an API key without exposing it", async () => {
    process.env.XIAOJI_API_KEY = "health-secret";
    await withServer(createApp(), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/health`);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toContain("no-store");
      const text = await response.text();
      expect(JSON.parse(text)).toEqual({ ok: true });
      expect(text).not.toContain("health-secret");
    });
  });

  it("sanitizes the photo and returns the documented contract from b64_json", async () => {
    process.env.XIAOJI_API_KEY = "server-only-secret";
    process.env.XIAOJI_BASE_URL = "https://xiaoji.baziapi.site/v1/";
    delete process.env.XIAOJI_IMAGE_MODEL;
    delete process.env.WECHAT_ID;
    let upstreamCalled = false;

    const upstreamFetch = async (url, init) => {
      upstreamCalled = true;
      expect(url.toString()).toBe("https://xiaoji.baziapi.site/v1/images/edits");
      expect(init.headers.Authorization).toBe("Bearer server-only-secret");
      expect(init.signal).toBeInstanceOf(AbortSignal);
      expect(init.body.get("model")).toBe("gpt-image-2");
      expect(init.body.get("size")).toBe("1024x1024");
      expect(init.body.get("quality")).toBe("medium");
      const prompt = init.body.get("prompt");
      expect(prompt).toContain("保留人物身份、年龄、肤色和体型");
      expect(prompt).toContain("不得进行或暗示面相分析、健康诊断或医疗分析");
      expect(prompt).toContain("不要出现任何文字");

      const uploaded = Buffer.from(await init.body.get("image").arrayBuffer());
      const metadata = await sharp(uploaded).metadata();
      expect(metadata.format).toBe("jpeg");
      expect(metadata.width).toBe(1600);
      expect(metadata.height).toBe(960);
      expect(metadata.exif).toBeUndefined();

      return Response.json({ data: [{ b64_json: generatedPng.toString("base64") }] });
    };

    await withServer(createApp({ fetchImpl: upstreamFetch }), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/analyze`, { method: "POST", body: analyzeForm() });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.ok).toBe(true);
      expect(body.image).toMatch(/^data:image\/jpeg;base64,/);
      expect(body.advice).toEqual({
        praise: expect.any(String),
        suggestions: expect.arrayContaining([expect.any(String)]),
        cta: expect.stringContaining("食养"),
        disclaimer: expect.stringContaining("自述状态"),
      });
      expect(body.advice.suggestions).toHaveLength(3);
      expect(body.contact).toEqual({
        wechatId: "pansun28",
        qrUrl: "/pansun28-wechat.png",
        label: "扫码获取微信号",
      });
      expect(JSON.stringify(body)).not.toContain("server-only-secret");
    });
    expect(upstreamCalled).toBe(true);
  });

  it("uses a valid WECHAT_ID environment override", async () => {
    process.env.XIAOJI_API_KEY = "contact-secret";
    process.env.WECHAT_ID = "Professor_Pan-28";

    await withServer(createApp({
      fetchImpl: async () => Response.json({ data: [{ b64_json: generatedPng.toString("base64") }] }),
    }), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/analyze`, { method: "POST", body: analyzeForm() });
      expect(response.status).toBe(200);
      expect((await response.json()).contact).toEqual({
        wechatId: "Professor_Pan-28",
        qrUrl: "/pansun28-wechat.png",
        label: "扫码获取微信号",
      });
    });
  });

  it("falls back to the default contact for a malicious WECHAT_ID", async () => {
    process.env.XIAOJI_API_KEY = "contact-secret";
    process.env.WECHAT_ID = '"><script src="//evil.test"></script>';

    await withServer(createApp({
      fetchImpl: async () => Response.json({ data: [{ b64_json: generatedPng.toString("base64") }] }),
    }), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/analyze`, { method: "POST", body: analyzeForm() });
      const text = await response.text();
      expect(response.status).toBe(200);
      expect(JSON.parse(text).contact).toEqual({
        wechatId: "pansun28",
        qrUrl: "/pansun28-wechat.png",
        label: "扫码获取微信号",
      });
      expect(text).not.toContain("evil.test");
    });
  });

  it("downloads an upstream URL and embeds it as a data URL", async () => {
    process.env.XIAOJI_API_KEY = "url-secret";
    process.env.XIAOJI_BASE_URL = "https://xiaoji.baziapi.site";
    process.env.XIAOJI_IMAGE_MODEL = "custom-image-model";
    let requestCount = 0;
    const upstreamFetch = async (url, init) => {
      requestCount += 1;
      if (requestCount === 1) {
        expect(url.toString()).toBe("https://xiaoji.baziapi.site/v1/images/edits");
        expect(init.body.get("model")).toBe("custom-image-model");
        return Response.json({ data: [{ url: "https://cdn.example.test/result.png" }] });
      }
      expect(url.toString()).toBe("https://cdn.example.test/result.png");
      expect(init.redirect).toBe("follow");
      return new Response(generatedPng, { headers: { "content-type": "application/octet-stream" } });
    };

    await withServer(createApp({ fetchImpl: upstreamFetch }), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/analyze`, { method: "POST", body: analyzeForm() });
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.image).toMatch(/^data:image\/jpeg;base64,/);
    });
    expect(requestCount).toBe(2);
  });

  it("supports text-to-image generations with optional http reference images", async () => {
    process.env.XIAOJI_API_KEY = "generation-secret";
    process.env.XIAOJI_BASE_URL = "https://xiaoji.baziapi.site/v1";
    process.env.XIAOJI_IMAGE_MODEL = "custom-image-model";

    const image = await generatePromptImage("Create a clean food wellness visual without text.", {
      referenceImageUrls: ["https://cdn.example.test/reference.jpg"],
      fetchImpl: async (url, init) => {
        expect(url.toString()).toBe("https://xiaoji.baziapi.site/v1/images/generations");
        expect(init.headers.Authorization).toBe("Bearer generation-secret");
        expect(init.headers["Content-Type"]).toBe("application/json");
        const body = JSON.parse(init.body);
        expect(body).toEqual({
          model: "custom-image-model",
          prompt: "Create a clean food wellness visual without text.",
          size: "1024x1024",
          quality: "medium",
          response_format: "b64_json",
          reference_images: ["https://cdn.example.test/reference.jpg"],
        });
        return Response.json({ data: [{ b64_json: generatedPng.toString("base64") }] });
      },
    });

    expect(image).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("rejects non-url reference images for generations", async () => {
    process.env.XIAOJI_API_KEY = "generation-secret";
    await expect(generatePromptImage("Create a visual.", {
      referenceImageUrls: ["data:image/jpeg;base64,abc"],
      fetchImpl: async () => { throw new Error("must not call upstream"); },
    })).rejects.toBeInstanceOf(UpstreamImageError);
  });

  it("rejects processing unless consent is JSON true", async () => {
    process.env.XIAOJI_API_KEY = "unused-secret";
    let upstreamCalled = false;
    await withServer(createApp({ fetchImpl: async () => { upstreamCalled = true; } }), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/analyze`, {
        method: "POST",
        body: analyzeForm({ consent: "false" }),
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: { code: "CONSENT_REQUIRED", message: expect.any(String) },
      });
    });
    expect(upstreamCalled).toBe(false);
  });

  it("rejects invalid photos and missing answer keys before calling upstream", async () => {
    process.env.XIAOJI_API_KEY = "unused-secret";
    const upstreamFetch = async () => { throw new Error("must not be called"); };
    await withServer(createApp({ fetchImpl: upstreamFetch }), async (baseUrl) => {
      const badAnswers = await fetch(`${baseUrl}/api/analyze`, {
        method: "POST",
        body: analyzeForm({ answers: JSON.stringify({ ...validAnswers, mood: undefined }) }),
      });
      expect(badAnswers.status).toBe(400);
      expect((await badAnswers.json()).error.code).toBe("INVALID_ANSWERS");

      const badPhoto = await fetch(`${baseUrl}/api/analyze`, {
        method: "POST",
        body: analyzeForm({ photo: new Blob(["not an image"], { type: "image/png" }) }),
      });
      expect(badPhoto.status).toBe(400);
      expect((await badPhoto.json()).error.code).toBe("INVALID_PHOTO");
    });
  });

  it.each([
    ["an extra key", { ...validAnswers, extra: "not allowed" }],
    ["a non-string value", { ...validAnswers, stress: 3 }],
    ["an array", Object.values(validAnswers)],
  ])("rejects answers with %s", async (_case, answers) => {
    process.env.XIAOJI_API_KEY = "unused-secret";
    await withServer(createApp({
      fetchImpl: async () => { throw new Error("must not be called"); },
    }), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/analyze`, {
        method: "POST",
        body: analyzeForm({ answers: JSON.stringify(answers) }),
      });
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_ANSWERS");
    });
  });

  it("rejects prototype-pollution keys without modifying object prototypes", async () => {
    process.env.XIAOJI_API_KEY = "unused-secret";
    const pollutedAnswers = JSON.stringify(validAnswers).replace(
      /}$/, ',"__proto__":{"polluted":true}}',
    );

    await withServer(createApp({
      fetchImpl: async () => { throw new Error("must not be called"); },
    }), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/analyze`, {
        method: "POST",
        body: analyzeForm({ answers: pollutedAnswers }),
      });
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_ANSWERS");
      expect({}.polluted).toBeUndefined();
    });
  });

  it("does not expose API keys or upstream details in failures", async () => {
    process.env.XIAOJI_API_KEY = "never-return-this-key";
    await withServer(createApp({
      fetchImpl: async () => new Response("vendor database stack trace", { status: 500 }),
    }), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/analyze`, { method: "POST", body: analyzeForm() });
      const text = await response.text();
      expect(response.status).toBe(502);
      expect(text).not.toContain("never-return-this-key");
      expect(text).not.toContain("vendor database stack trace");
      expect(JSON.parse(text).error.code).toBe("IMAGE_GENERATION_FAILED");
    });
  });

  it("uses the required 125 second image timeout", () => {
    expect(IMAGE_TIMEOUT_MS).toBe(125_000);
  });
});
