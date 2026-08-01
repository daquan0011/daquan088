import { describe, expect, it } from "vitest";
import { buildVisualReport } from "./report.js";

const OPTIONS = Object.freeze({
  bowelRhythm: ["规律顺畅", "偶尔不够规律", "排便不够规律"],
  gutComfort: ["大多舒适", "偶有胀闷", "经常感觉不舒适"],
  complexionSelfReport: ["自觉气色明亮", "自觉气色偶尔偏暗", "自觉气色偏暗或偏黄"],
  sleep: ["精神比较充足", "有时仍觉疲惫", "常常睡不够或难入睡"],
  stress: ["轻松平稳", "偶有紧绷", "持续紧张"],
  mood: ["情绪活力较好", "偶有低落或提不起劲", "持续低落"]
});

const SUPPLEMENT_OPTIONS = Object.freeze({
  bowelEase: ["大多轻松，不需久蹲", "偶尔费力或有排不尽感", "经常费力、久蹲或有排不尽感"],
  postMealGut: ["餐后大多舒适", "偶尔出现胀气或咕噜感", "经常出现胀气、咕噜或不适"],
  complexionPattern: ["整体较稳定", "作息不规律后偶尔偏暗", "持续自觉偏暗或偏黄"]
});

const SUPPLEMENT_BY_DIMENSION = Object.freeze({
  bowelRhythm: "bowelEase",
  gutComfort: "postMealGut",
  complexionSelfReport: "complexionPattern"
});

const ALL_OPTIONS = Object.freeze({ ...OPTIONS, ...SUPPLEMENT_OPTIONS });

const answersAt = (index) =>
  Object.freeze(Object.fromEntries(Object.entries(ALL_OPTIONS).map(([id, options]) => [id, options[index]])));

const BEST_ANSWERS = answersAt(0);
const MIDDLE_ANSWERS = answersAt(1);
const LOW_ANSWERS = answersAt(2);

describe("buildVisualReport", () => {
  it("returns the complete six-dimension visual report contract", () => {
    const report = buildVisualReport(BEST_ANSWERS);

    expect(Object.keys(report)).toEqual([
      "overall",
      "dimensions",
      "praise",
      "highlights",
      "suggestions",
      "analytics",
      "disclaimer"
    ]);
    expect(report.dimensions.map(({ id }) => id)).toEqual(Object.keys(OPTIONS));
    expect(report.dimensions).toHaveLength(6);
    expect(report.suggestions).toHaveLength(6);
    expect(report.highlights.length).toBeGreaterThan(0);
    expect(report.analytics.comparison).toHaveLength(6);
    expect(report.analytics.balance).toBe(100);
    expect(report.analytics.steadyCount).toBe(6);
    expect(report.analytics.strongest).toBe("六维较均衡");
    expect(report.analytics.focus).toBe("保持整体节奏");

    for (const dimension of report.dimensions) {
      expect(Object.keys(dimension)).toEqual(["id", "label", "score", "color", "note"]);
      expect(dimension.label).not.toBe("");
      expect(dimension.color).toMatch(/^#[0-9A-F]{6}$/i);
      expect(dimension.note).not.toBe("");
    }
  });

  it("derives comparison and balance analytics only from self-reported dimensions", () => {
    const report = buildVisualReport({
      ...MIDDLE_ANSWERS,
      bowelRhythm: BEST_ANSWERS.bowelRhythm,
      bowelEase: BEST_ANSWERS.bowelEase,
      mood: LOW_ANSWERS.mood
    });

    expect(report.analytics.balance).toBe(54);
    expect(report.analytics.steadyCount).toBe(1);
    expect(report.analytics.attentionCount).toBe(1);
    expect(report.analytics.strongest).toBe("排便节奏");
    expect(report.analytics.focus).toBe("情绪活力");
    expect(report.analytics.comparison.every(({ average }) => average === report.overall)).toBe(true);
  });

  it("covers every selectable state with a distinct ordered score", () => {
    for (const [id, options] of Object.entries(OPTIONS)) {
      const scores = options.map((option) => {
        const supplementId = SUPPLEMENT_BY_DIMENSION[id];
        const report = buildVisualReport({
          ...MIDDLE_ANSWERS,
          [id]: option,
          ...(supplementId ? { [supplementId]: SUPPLEMENT_OPTIONS[supplementId][options.indexOf(option)] } : {})
        });
        return report.dimensions.find((dimension) => dimension.id === id).score;
      });

      expect(scores).toEqual([90, 68, 44]);
      expect(new Set(scores).size).toBe(options.length);
    }
  });

  it("uses the three follow-up answers in their related report dimensions", () => {
    const cases = [
      ["bowelEase", "bowelRhythm"],
      ["postMealGut", "gutComfort"],
      ["complexionPattern", "complexionSelfReport"]
    ];

    for (const [answerId, dimensionId] of cases) {
      const scores = SUPPLEMENT_OPTIONS[answerId].map((option) =>
        buildVisualReport({ ...MIDDLE_ANSWERS, [answerId]: option })
          .dimensions.find(({ id }) => id === dimensionId).score
      );
      expect(scores).toEqual([79, 68, 56]);
    }
  });

  it("uses neutral defaults for missing, malformed, and unknown values", () => {
    const expected = buildVisualReport(MIDDLE_ANSWERS);

    for (const input of [
      undefined,
      null,
      false,
      1,
      "",
      [],
      {},
      {
        bowelRhythm: "unknown",
        gutComfort: undefined,
        complexionSelfReport: null,
        sleep: 123,
        stress: false,
        mood: {}
      }
    ]) {
      expect(buildVisualReport(input)).toEqual(expected);
    }
  });

  it("keeps every score and overall at deterministic radar chart boundaries", () => {
    const reports = [
      buildVisualReport(BEST_ANSWERS),
      buildVisualReport(MIDDLE_ANSWERS),
      buildVisualReport(LOW_ANSWERS)
    ];

    expect(reports.map(({ overall }) => overall)).toEqual([90, 68, 44]);
    for (const report of reports) {
      expect(report.overall).toBeGreaterThanOrEqual(0);
      expect(report.overall).toBeLessThanOrEqual(100);
      for (const { score } of report.dimensions) {
        expect(Number.isInteger(score)).toBe(true);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }
    }
  });

  it("responds to related self-reports without turning them into conclusions", () => {
    const report = buildVisualReport({
      ...MIDDLE_ANSWERS,
      bowelRhythm: "便秘",
      complexionSelfReport: "脸黄",
      stress: "焦虑",
      mood: "抑郁"
    });
    const copy = JSON.stringify(report);

    expect(report.dimensions.find(({ id }) => id === "bowelRhythm").note).toContain("排便不够规律");
    expect(report.dimensions.find(({ id }) => id === "complexionSelfReport").note).toContain("自述");
    expect(report.dimensions.find(({ id }) => id === "complexionSelfReport").note).toContain("偏黄");
    expect(report.dimensions.find(({ id }) => id === "stress").note).toContain("持续紧张");
    expect(report.dimensions.find(({ id }) => id === "mood").note).toContain("持续低落");
    expect(copy).not.toContain("便秘");
    expect(copy).not.toContain("脸黄");
    expect(copy).not.toContain("焦虑");
    expect(copy).not.toContain("抑郁");
  });

  it("directs the most serious mood self-report to professional support", () => {
    const report = buildVisualReport({ ...MIDDLE_ANSWERS, mood: "持续低落" });
    const moodSuggestion = report.suggestions[5];

    expect(moodSuggestion).toContain("心理或医疗专业支持");
    expect(moodSuggestion).toContain("食养建议不能替代专业支持");
  });

  it("is deterministic, ignores photo data, and does not mutate input", () => {
    const answers = {
      ...LOW_ANSWERS,
      photo: "data:image/png;base64,not-used",
      imageAnalysis: { arbitrary: "content" }
    };
    const snapshot = structuredClone(answers);

    expect(buildVisualReport(answers)).toEqual(buildVisualReport(answers));
    expect(buildVisualReport(answers)).toEqual(buildVisualReport(LOW_ANSWERS));
    expect(answers).toEqual(snapshot);
    expect(Object.isFrozen(buildVisualReport(answers))).toBe(true);
  });

  it("keeps generated copy clear of diagnoses, promises, and photo inference", () => {
    const prohibited = [
      "诊断",
      "治愈",
      "疗效",
      "调理完成度",
      "疾病",
      "体质",
      "脏腑",
      "面相",
      "照片显示",
      "照片表明",
      "焦虑症",
      "抑郁症"
    ];
    const generatedCopy = Object.entries(OPTIONS)
      .flatMap(([id, options]) =>
        options.map((option) => JSON.stringify(buildVisualReport({ ...MIDDLE_ANSWERS, [id]: option })))
      )
      .join("\n");

    for (const term of prohibited) {
      expect(generatedCopy).not.toContain(term);
    }
    expect(buildVisualReport(BEST_ANSWERS).disclaimer).toContain("主动选择");
    expect(buildVisualReport(BEST_ANSWERS).disclaimer).toContain("九项近期自述");
    expect(buildVisualReport(BEST_ANSWERS).disclaimer).toContain("照片只用于视觉展示");
    expect(buildVisualReport(BEST_ANSWERS).disclaimer).toContain("不参与任何状态判断");
  });
});
