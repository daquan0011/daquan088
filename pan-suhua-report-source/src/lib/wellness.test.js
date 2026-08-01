import { describe, expect, it } from "vitest";
import {
  DEFAULT_SELECTION,
  PRIVATE_MESSAGE_CTA,
  PUBLIC_DISCLAIMER,
  SELF_REPORT_OPTIONS,
  UI_LABELS,
  WELLNESS_DIMENSIONS,
  generateLocalPreview
} from "./wellness.js";

describe("wellness content", () => {
  it("uses complete defaults for empty or invalid input", () => {
    expect(generateLocalPreview().selection).toEqual(DEFAULT_SELECTION);
    expect(generateLocalPreview(null).selection).toEqual(DEFAULT_SELECTION);
    expect(
      generateLocalPreview({
        dailyRhythm: "unknown",
        mealPattern: undefined,
        movement: null,
        moodPace: 1
      }).selection
    ).toEqual(DEFAULT_SELECTION);
  });

  it("defines four dimensions with at least three self-report options each", () => {
    expect(WELLNESS_DIMENSIONS).toHaveLength(4);
    expect(Object.keys(SELF_REPORT_OPTIONS)).toEqual(
      WELLNESS_DIMENSIONS.map((dimension) => dimension.id)
    );

    for (const dimension of WELLNESS_DIMENSIONS) {
      expect(dimension.options.length).toBeGreaterThanOrEqual(3);
      expect(new Set(dimension.options.map((option) => option.id)).size).toBe(
        dimension.options.length
      );
    }
  });

  it("supports every four-dimensional combination with three concrete suggestions", () => {
    const [rhythms, meals, movements, moods] = WELLNESS_DIMENSIONS.map(
      (dimension) => dimension.options
    );

    for (const dailyRhythm of rhythms) {
      for (const mealPattern of meals) {
        for (const movement of movements) {
          for (const moodPace of moods) {
            const selection = {
              dailyRhythm: dailyRhythm.id,
              mealPattern: mealPattern.id,
              movement: movement.id,
              moodPace: moodPace.id
            };
            const preview = generateLocalPreview(selection);

            expect(preview.selection).toEqual(selection);
            expect(preview.suggestions).toHaveLength(3);
            expect(preview.suggestions.every((item) => item.length > 20)).toBe(true);
            expect(preview.cta).toContain("潘教授");
            expect(preview.cta).toContain("“食养”");
          }
        }
      }
    }
  });

  it("keeps all public copy within the content boundary", () => {
    const prohibited = [
      "疾" + "病",
      "治" + "疗",
      "治" + "愈",
      "疗" + "效",
      "诊" + "断",
      "患" + "者",
      "医" + "生",
      "药" + "物",
      "排" + "毒",
      "清" + "肠",
      "免疫" + "力",
      "保" + "证",
      "一定" + "会",
      "百分" + "之百"
    ];
    const optionCopy = WELLNESS_DIMENSIONS.flatMap((dimension) => [
      dimension.label,
      dimension.prompt,
      ...dimension.options.map((option) => option.label)
    ]);
    const generatedCopy = WELLNESS_DIMENSIONS.reduce(
      (combinations, dimension) =>
        combinations.flatMap((selection) =>
          dimension.options.map((option) => ({
            ...selection,
            [dimension.id]: option.id
          }))
        ),
      [{}]
    ).map((selection) => generateLocalPreview(selection).text);
    const publicCopy = [
      ...Object.values(UI_LABELS),
      ...optionCopy,
      PUBLIC_DISCLAIMER,
      PRIVATE_MESSAGE_CTA,
      ...generatedCopy
    ].join("\n");

    for (const term of prohibited) {
      expect(publicCopy).not.toContain(term);
    }
    expect(PUBLIC_DISCLAIMER).toContain("主动选择");
    expect(PUBLIC_DISCLAIMER).toContain("不会从面部信息判断身体情况");
  });

  it("returns stable output without mutating the input", () => {
    const selection = {
      dailyRhythm: "late",
      mealPattern: "rushed",
      movement: "seated",
      moodPace: "full"
    };
    const snapshot = { ...selection };

    expect(generateLocalPreview(selection)).toEqual(generateLocalPreview(selection));
    expect(selection).toEqual(snapshot);
    expect(Object.isFrozen(generateLocalPreview(selection))).toBe(true);
  });
});
