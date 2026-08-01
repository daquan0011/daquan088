import sharp from "sharp";

const DEFAULT_BASE_URL = "https://xiaoji.baziapi.site";
const DEFAULT_MODEL = "gpt-image-2";
export const IMAGE_TIMEOUT_MS = 125_000;
const MAX_GENERATED_BYTES = 25 * 1024 * 1024;
const MAX_API_RESPONSE_BYTES = Math.ceil(MAX_GENERATED_BYTES * 4 / 3) + 1024 * 1024;
const MAX_PROMPT_CHARS = 2000;
const MAX_REFERENCE_IMAGES = 4;

const IMAGE_PROMPT = [
  "基于上传照片生成一张自然光下、真实克制的食养生活方式肖像。",
  "必须保留人物身份、年龄、肤色和体型，不美化或改变人物的关键外貌特征。",
  "场景可自然融入家常、均衡的食物与舒适生活环境，画面温暖但不过度摆拍。",
  "不得进行或暗示面相分析、健康诊断或医疗分析。",
  "画面中不要出现任何文字、标签、印章、医学标注、图表或水印。",
].join("\n");

export class UpstreamImageError extends Error {
  constructor() {
    super("Image service failed");
    this.name = "UpstreamImageError";
  }
}

function endpointFrom(baseUrl, kind = "edits") {
  let url;
  try {
    url = new URL(baseUrl || DEFAULT_BASE_URL);
  } catch {
    throw new UpstreamImageError();
  }

  if (url.protocol !== "https:") {
    throw new UpstreamImageError();
  }

  const pathname = url.pathname.replace(/\/+$/, "");
  const target = kind === "generations" ? "generations" : "edits";
  if (pathname.endsWith(`/v1/images/${target}`)) {
    url.pathname = pathname;
  } else if (pathname.endsWith("/v1")) {
    url.pathname = `${pathname}/images/${target}`;
  } else {
    url.pathname = `${pathname}/v1/images/${target}`;
  }
  url.search = "";
  url.hash = "";
  return url;
}

async function readLimitedBody(response, maxBytes = MAX_GENERATED_BYTES) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new UpstreamImageError();
  }

  if (!response.body) {
    throw new UpstreamImageError();
  }

  const chunks = [];
  let total = 0;
  for await (const chunk of response.body) {
    total += chunk.byteLength;
    if (total > maxBytes) {
      throw new UpstreamImageError();
    }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function decodeBase64(value) {
  if (typeof value !== "string" || value.length > Math.ceil(MAX_GENERATED_BYTES * 4 / 3) + 8) {
    throw new UpstreamImageError();
  }

  const normalized = value.replace(/\s/g, "");
  if (!normalized || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    throw new UpstreamImageError();
  }

  const image = Buffer.from(normalized, "base64");
  if (!image.length || image.length > MAX_GENERATED_BYTES) {
    throw new UpstreamImageError();
  }
  return image;
}

async function downloadImage(urlValue, fetchImpl, signal) {
  let url;
  try {
    url = new URL(urlValue);
  } catch {
    throw new UpstreamImageError();
  }
  if (url.protocol !== "https:") {
    throw new UpstreamImageError();
  }

  let response;
  try {
    response = await fetchImpl(url, { signal, redirect: "follow" });
  } catch {
    throw new UpstreamImageError();
  }
  const contentType = response.headers.get("content-type")?.toLowerCase().split(";", 1)[0].trim();
  if (!response.ok || (!contentType?.startsWith("image/") && contentType !== "application/octet-stream")) {
    throw new UpstreamImageError();
  }
  return readLimitedBody(response);
}

async function toJpegDataUrl(buffer) {
  try {
    const jpeg = await sharp(buffer, { failOn: "error", limitInputPixels: 64_000_000 })
      .rotate()
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  } catch {
    throw new UpstreamImageError();
  }
}

async function imageFromPayload(payload, fetchImpl, signal) {
  const result = payload?.data?.[0];
  const generated = result?.b64_json
    ? decodeBase64(result.b64_json)
    : result?.url
      ? await downloadImage(result.url, fetchImpl, signal)
      : null;

  if (!generated) {
    throw new UpstreamImageError();
  }
  return await toJpegDataUrl(generated);
}

function validateReferenceImageUrls(referenceImageUrls) {
  if (referenceImageUrls === undefined) {
    return undefined;
  }
  if (!Array.isArray(referenceImageUrls) || referenceImageUrls.length > MAX_REFERENCE_IMAGES) {
    throw new UpstreamImageError();
  }

  return referenceImageUrls.map((urlValue) => {
    let url;
    try {
      url = new URL(urlValue);
    } catch {
      throw new UpstreamImageError();
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new UpstreamImageError();
    }
    return url.toString();
  });
}

export async function generatePromptImage(prompt, options = {}) {
  const apiKey = process.env.XIAOJI_API_KEY;
  if (!apiKey || typeof prompt !== "string" || !prompt.trim() || prompt.length > MAX_PROMPT_CHARS) {
    throw new UpstreamImageError();
  }

  const fetchImpl = options.fetchImpl || fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);

  try {
    const requestBody = {
      model: process.env.XIAOJI_IMAGE_MODEL || DEFAULT_MODEL,
      prompt,
      size: "1024x1024",
      quality: "medium",
      response_format: "b64_json",
    };
    const referenceImages = validateReferenceImageUrls(options.referenceImageUrls);
    if (referenceImages?.length) {
      requestBody.reference_images = referenceImages;
    }

    let response;
    try {
      response = await fetchImpl(endpointFrom(process.env.XIAOJI_BASE_URL, "generations"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } catch {
      throw new UpstreamImageError();
    }

    if (!response.ok) {
      throw new UpstreamImageError();
    }

    let payload;
    try {
      payload = JSON.parse((await readLimitedBody(response, MAX_API_RESPONSE_BYTES)).toString("utf8"));
    } catch {
      throw new UpstreamImageError();
    }

    return await imageFromPayload(payload, fetchImpl, controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateLifestyleImage(inputJpeg, options = {}) {
  const apiKey = process.env.XIAOJI_API_KEY;
  if (!apiKey) {
    throw new UpstreamImageError();
  }

  const fetchImpl = options.fetchImpl || fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);

  try {
    const form = new FormData();
    form.append("model", process.env.XIAOJI_IMAGE_MODEL || DEFAULT_MODEL);
    form.append("size", "1024x1024");
    form.append("quality", "medium");
    form.append("prompt", IMAGE_PROMPT);
    form.append("image", new Blob([inputJpeg], { type: "image/jpeg" }), "photo.jpg");

    let response;
    try {
      response = await fetchImpl(endpointFrom(process.env.XIAOJI_BASE_URL), {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: controller.signal,
      });
    } catch {
      throw new UpstreamImageError();
    }

    if (!response.ok) {
      throw new UpstreamImageError();
    }

    let payload;
    try {
      payload = JSON.parse((await readLimitedBody(response, MAX_API_RESPONSE_BYTES)).toString("utf8"));
    } catch {
      throw new UpstreamImageError();
    }

    return await imageFromPayload(payload, fetchImpl, controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}
