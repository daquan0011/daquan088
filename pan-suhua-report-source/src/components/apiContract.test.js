import { describe, expect, it } from "vitest";
import { createAnalyzeFormData, createFallbackResult, isStaticDeployment, parseAnalyzeResponse } from "../App";

describe("analyze API contract", () => {
  it("creates the expected multipart fields", () => {
    const photo = new Blob(["photo"], { type: "image/jpeg" });
    const answers = {
      bowelRhythm: "规律顺畅",
      bowelEase: "大多轻松，不需久蹲",
      gutComfort: "大多舒适",
      postMealGut: "餐后大多舒适",
      complexionSelfReport: "自觉气色明亮",
      complexionPattern: "整体较稳定",
      sleep: "精神比较充足",
      stress: "轻松平稳",
      mood: "情绪活力较好",
    };
    const formData = createAnalyzeFormData(photo, answers);

    expect(JSON.parse(formData.get("answers"))).toEqual(answers);
    expect(JSON.parse(formData.get("consent"))).toBe(true);
    expect(formData.get("photo")).toBeInstanceOf(Blob);
    expect([...formData.keys()]).toEqual(["photo", "answers", "consent"]);
  });

  it("normalizes a successful response", () => {
    const payload = {
      ok: true,
      image: "data:image/png;base64,abc",
      advice: {
        praise: "你正在认真照顾自己的日常。",
        suggestions: ["按时吃饭", "早点休息", "散步十分钟"],
        cta: "私信关键词“食养”",
        disclaimer: "内容仅作生活方式参考。",
      },
      contact: {
        wechatId: "pansun28",
        qrUrl: "/pansun28-wechat.png",
        label: "扫码获取微信号",
      },
    };

    expect(parseAnalyzeResponse(payload)).toEqual({
      image: payload.image,
      imageMode: "generated",
      ...payload.advice,
      contact: payload.contact,
    });
  });

  it("creates a complete local report when the portrait service is unavailable", () => {
    const result = createFallbackResult("blob:selfie");

    expect(result.image).toBe("blob:selfie");
    expect(result.imageMode).toBe("uploaded");
    expect(result.contact.wechatId).toBe("pansun28");
    expect(result.cta).toContain("潘教授");
  });

  it("detects GitHub Pages as a static deployment", () => {
    expect(isStaticDeployment("daquan0011.github.io")).toBe(true);
    expect(isStaticDeployment("127.0.0.1")).toBe(false);
  });

  it("rejects incomplete responses", () => {
    expect(() => parseAnalyzeResponse({ ok: true, image: "x", advice: {} })).toThrow("数据不完整");
  });
});
