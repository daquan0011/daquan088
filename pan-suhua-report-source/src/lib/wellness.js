export const WELLNESS_DIMENSIONS = Object.freeze([
  Object.freeze({
    id: "dailyRhythm",
    label: "日常节奏",
    prompt: "最近一周，你的日常节奏更接近哪一种？",
    options: Object.freeze([
      Object.freeze({ id: "steady", label: "大体规律" }),
      Object.freeze({ id: "late", label: "常常偏晚" }),
      Object.freeze({ id: "changeable", label: "时常变化" })
    ])
  }),
  Object.freeze({
    id: "mealPattern",
    label: "用餐状态",
    prompt: "最近一周，你的用餐状态更接近哪一种？",
    options: Object.freeze([
      Object.freeze({ id: "unhurried", label: "从容按时" }),
      Object.freeze({ id: "rushed", label: "经常匆忙" }),
      Object.freeze({ id: "uneven", label: "有时不定" })
    ])
  }),
  Object.freeze({
    id: "movement",
    label: "活动状态",
    prompt: "最近一周，你的活动状态更接近哪一种？",
    options: Object.freeze([
      Object.freeze({ id: "light", label: "每天有轻活动" }),
      Object.freeze({ id: "seated", label: "坐着的时间较多" }),
      Object.freeze({ id: "busy", label: "来回奔忙较多" })
    ])
  }),
  Object.freeze({
    id: "moodPace",
    label: "心情节奏",
    prompt: "最近一周，你的心情节奏更接近哪一种？",
    options: Object.freeze([
      Object.freeze({ id: "relaxed", label: "轻松平稳" }),
      Object.freeze({ id: "full", label: "事情排得很满" }),
      Object.freeze({ id: "restless", label: "偶尔难放松" })
    ])
  })
]);

export const SELF_REPORT_OPTIONS = Object.freeze(
  Object.fromEntries(WELLNESS_DIMENSIONS.map(({ id, options }) => [id, options]))
);

export const DEFAULT_SELECTION = Object.freeze({
  dailyRhythm: "steady",
  mealPattern: "unhurried",
  movement: "light",
  moodPace: "relaxed"
});

export const UI_LABELS = Object.freeze({
  title: "苏华食养状态观察卡",
  selfReport: "近期状态自述",
  preview: "本地预览",
  suggestions: "给你的日常建议",
  generate: "生成观察卡",
  reset: "重新选择",
  disclaimer: "温馨说明",
  privateMessage: "进一步交流"
});

export const PUBLIC_DISCLAIMER =
  "照片只用于卡片展示，生活建议仅依据你主动选择的近期状态，不会从面部信息判断身体情况。本内容仅作日常食养与生活记录参考，请结合自己的实际感受灵活调整。";

export const PRIVATE_MESSAGE_CTA =
  "想获得更贴合日常节奏的食养交流，欢迎私信潘教授，并发送关键词“食养”。";

const PRAISE = "你的自述自然又亲和，也看得出你愿意认真关注自己。";

const RHYTHM_SUGGESTIONS = Object.freeze({
  steady: "继续保持大体固定的起居时间，今晚可提前十分钟放下屏幕，为休息留出安静过渡。",
  late: "今晚从比平时早十五分钟收尾开始，调暗灯光并把明早要用的物品提前放好。",
  changeable: "先选一个容易坚持的起床时间，连续三天尽量保持一致，再逐步整理晚间节奏。"
});

const MEAL_SUGGESTIONS = Object.freeze({
  unhurried: "延续从容用餐的习惯，每餐留出足够时间，搭配当季蔬菜、主食和适量豆制品。",
  rushed: "下一餐先预留二十分钟坐下来吃，准备一份主食、一份蔬菜和一种易取用的豆制品。",
  uneven: "明天先固定一顿最容易安排的正餐，并提前备好简单食材，避免临时随意应付。"
});

const MOVEMENT_PARTS = Object.freeze({
  light: "保留每天的轻活动，饭后舒缓走十分钟",
  seated: "每坐五十分钟就起身活动三到五分钟",
  busy: "奔忙间留两次五分钟的慢走或舒展"
});

const MOOD_PARTS = Object.freeze({
  relaxed: "再用三次缓慢呼吸感受当下",
  full: "并在日程中明确留出十分钟空档",
  restless: "睡前写下三件已完成的小事，让思绪慢慢收拢"
});

function normalizeSelection(selection) {
  const source = selection && typeof selection === "object" ? selection : {};

  return Object.fromEntries(
    WELLNESS_DIMENSIONS.map(({ id, options }) => {
      const selected = options.some((option) => option.id === source[id])
        ? source[id]
        : DEFAULT_SELECTION[id];
      return [id, selected];
    })
  );
}

export function generateLocalPreview(selection = DEFAULT_SELECTION) {
  const normalized = normalizeSelection(selection);
  const suggestions = [
    RHYTHM_SUGGESTIONS[normalized.dailyRhythm],
    MEAL_SUGGESTIONS[normalized.mealPattern],
    `${MOVEMENT_PARTS[normalized.movement]}，${MOOD_PARTS[normalized.moodPace]}。`
  ];
  const text = [
    PRAISE,
    ...suggestions.map((suggestion, index) => `${index + 1}. ${suggestion}`),
    PRIVATE_MESSAGE_CTA,
    PUBLIC_DISCLAIMER
  ].join("\n");

  return Object.freeze({
    selection: Object.freeze(normalized),
    praise: PRAISE,
    suggestions: Object.freeze(suggestions),
    cta: PRIVATE_MESSAGE_CTA,
    disclaimer: PUBLIC_DISCLAIMER,
    text
  });
}

export const generateWellnessPreview = generateLocalPreview;
