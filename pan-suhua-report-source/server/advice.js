const CATEGORY_DEFINITIONS = [
  {
    id: "sleep",
    aliases: ["sleep", "rest", "睡眠", "休息", "入睡", "作息"],
    suggestion: "今晚尽量在相近的时间放下屏幕、准备入睡，给身体留出安稳而充足的休息时间。",
  },
  {
    id: "digestion",
    aliases: ["food", "diet", "appetite", "digestion", "饮食", "食欲", "消化", "胃口"],
    suggestion: "三餐尽量定时，选择熟软、清淡且种类丰富的日常食物，吃饭时放慢一些。",
  },
  {
    id: "energy",
    aliases: ["energy", "activity", "exercise", "vitality", "精力", "体力", "活动", "运动", "疲劳"],
    suggestion: "按当下体力安排十到二十分钟轻松步行或舒展，以不勉强、能持续为准。",
  },
  {
    id: "mood",
    aliases: ["mood", "stress", "emotion", "情绪", "压力", "心情", "放松"],
    suggestion: "每天给自己留一小段不被打扰的放松时间，慢慢吃饭，也留意当下的饥饱感。",
  },
];

const CONCERN_WORDS = [
  "差",
  "少",
  "不足",
  "不规律",
  "困难",
  "疲",
  "累",
  "低",
  "紧张",
  "焦虑",
  "压力",
  "poor",
  "low",
  "tired",
  "irregular",
  "stressed",
];

function answerEntries(answers) {
  if (Array.isArray(answers)) {
    return answers.map((value, index) => [CATEGORY_DEFINITIONS[index]?.id || String(index), value]);
  }

  return Object.entries(answers);
}

function categoryScore(category, entries) {
  let matched = false;
  let concern = false;

  for (const [key, value] of entries) {
    const text = `${key} ${typeof value === "string" ? value : JSON.stringify(value)}`.toLowerCase();
    if (category.aliases.some((alias) => text.includes(alias))) {
      matched = true;
      concern ||= CONCERN_WORDS.some((word) => text.includes(word));
    }
  }

  return concern ? 2 : matched ? 1 : 0;
}

export function buildAdvice(answers) {
  const entries = answerEntries(answers);
  const ranked = CATEGORY_DEFINITIONS.map((category, index) => ({
    ...category,
    index,
    score: categoryScore(category, entries),
  })).sort((a, b) => b.score - a.score || a.index - b.index);

  return {
    praise: "愿意认真记录并照顾自己近期的生活状态，这份觉察本身就很珍贵。",
    suggestions: ranked.slice(0, 3).map(({ suggestion }) => suggestion),
    cta: "想获得更贴近日常的食养交流，可私信潘教授并发送关键词“食养”。",
    disclaimer: "以上内容仅依据你的自述状态提供一般性生活方式参考，不涉及面相或医疗分析，不能替代专业医疗建议。",
  };
}
