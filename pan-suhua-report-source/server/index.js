import "dotenv/config";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import multer from "multer";
import sharp from "sharp";
import { buildAdvice } from "./advice.js";
import { generateLifestyleImage, UpstreamImageError } from "./image-api.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp"]);
const DEFAULT_WECHAT_ID = "pansun28";
const WECHAT_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{5,19}$/;
const CONTACT_LABEL = "扫码获取微信号";
const ANSWER_KEYS = [
  "bowelRhythm",
  "bowelEase",
  "gutComfort",
  "postMealGut",
  "complexionSelfReport",
  "complexionPattern",
  "sleep",
  "stress",
  "mood",
];

class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PHOTO_BYTES, fieldSize: 64 * 1024, files: 1, fields: 2 },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      callback(new ApiError(400, "INVALID_PHOTO", "仅支持 JPG、PNG 或 WebP 图片。"));
      return;
    }
    callback(null, true);
  },
});

function parseJsonField(value, fieldName) {
  if (typeof value !== "string") {
    throw new ApiError(400, "INVALID_REQUEST", `${fieldName} 必须是 JSON 字符串。`);
  }
  try {
    return JSON.parse(value);
  } catch {
    throw new ApiError(400, "INVALID_REQUEST", `${fieldName} 不是有效的 JSON。`);
  }
}

function validateAnswers(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new ApiError(400, "INVALID_ANSWERS", "answers 必须是包含固定九项的对象。");
  }

  const keys = Object.keys(value);
  const hasExactKeys = keys.length === ANSWER_KEYS.length
    && ANSWER_KEYS.every((key) => Object.hasOwn(value, key));
  const hasStringValues = hasExactKeys && ANSWER_KEYS.every((key) => typeof value[key] === "string");
  if (!hasStringValues) {
    throw new ApiError(400, "INVALID_ANSWERS", "answers 必须包含固定九项且每项均为字符串。");
  }
  return value;
}

function buildContact() {
  const configuredId = process.env.WECHAT_ID?.trim();
  const wechatId = WECHAT_ID_PATTERN.test(configuredId || "") ? configuredId : DEFAULT_WECHAT_ID;

  return {
    wechatId,
    qrUrl: "/pansun28-wechat.png",
    label: CONTACT_LABEL,
  };
}

async function sanitizePhoto(file) {
  if (!file) {
    throw new ApiError(400, "PHOTO_REQUIRED", "请上传 photo 图片。");
  }

  try {
    const source = sharp(file.buffer, { failOn: "error", limitInputPixels: 40_000_000 });
    const metadata = await source.metadata();
    if (!ALLOWED_FORMATS.has(metadata.format)) {
      throw new Error("Unsupported image format");
    }
    return await source
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();
  } catch {
    throw new ApiError(400, "INVALID_PHOTO", "图片无法解码或格式不受支持。");
  }
}

export function createApp(options = {}) {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet({ crossOriginResourcePolicy: { policy: "same-origin" } }));
  app.use(express.json({ limit: "100kb" }));
  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use("/api", rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({ error: { code: "RATE_LIMITED", message: "请求过于频繁，请稍后重试。" } });
    },
  }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/analyze", upload.single("photo"), async (req, res, next) => {
    try {
      const consent = parseJsonField(req.body?.consent, "consent");
      if (consent !== true) {
        throw new ApiError(400, "CONSENT_REQUIRED", "需要明确同意后才能处理照片。");
      }

      const answers = validateAnswers(parseJsonField(req.body?.answers, "answers"));
      const photo = await sanitizePhoto(req.file);
      const image = await generateLifestyleImage(photo, {
        fetchImpl: options.fetchImpl,
      });

      res.json({ ok: true, image, advice: buildAdvice(answers), contact: buildContact() });
    } catch (error) {
      next(error);
    }
  });

  app.use("/api", (_req, _res, next) => {
    next(new ApiError(404, "NOT_FOUND", "接口不存在。"));
  });

  const distPath = resolve(__dirname, "../dist");
  if (process.env.NODE_ENV === "production" && existsSync(distPath)) {
    app.use(express.static(distPath, { index: false }));
    app.use((req, res, next) => {
      if (req.method === "GET" && req.accepts("html")) {
        return res.sendFile(resolve(distPath, "index.html"));
      }
      next();
    });
  }

  app.use((error, _req, res, _next) => {
    if (error instanceof multer.MulterError) {
      const isTooLarge = error.code === "LIMIT_FILE_SIZE";
      return res.status(400).json({
        error: {
          code: isTooLarge ? "PHOTO_TOO_LARGE" : "INVALID_UPLOAD",
          message: isTooLarge ? "图片不能超过 10MB。" : "图片上传不符合要求。",
        },
      });
    }

    if (error?.type === "entity.parse.failed") {
      return res.status(400).json({ error: { code: "INVALID_JSON", message: "请求体不是有效的 JSON。" } });
    }

    if (error?.type === "entity.too.large") {
      return res.status(413).json({ error: { code: "REQUEST_TOO_LARGE", message: "请求体过大。" } });
    }

    if (error instanceof ApiError) {
      return res.status(error.status).json({ error: { code: error.code, message: error.message } });
    }

    if (error instanceof UpstreamImageError) {
      return res.status(502).json({ error: { code: "IMAGE_GENERATION_FAILED", message: "图片生成暂时不可用，请稍后重试。" } });
    }

    return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "服务暂时不可用，请稍后重试。" } });
  });

  return app;
}

export const app = createApp();

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const port = Number(process.env.PORT || 8787);
  app.listen(port, "127.0.0.1", () => {
    console.log(`Suhua API listening on http://127.0.0.1:${port}`);
  });
}
