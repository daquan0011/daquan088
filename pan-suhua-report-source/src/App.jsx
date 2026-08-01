import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, LoaderCircle, ShieldCheck } from "lucide-react";
import LoadingExperience, { ANALYSIS_TIMEOUT_MS, MIN_LOADING_MS, progressAt } from "./components/LoadingExperience";
import ProgressSidebar from "./components/ProgressSidebar";
import StatusForm, { STATUS_GROUPS } from "./components/StatusForm";
import UploadField from "./components/UploadField";

const EMPTY_STATES = Object.fromEntries(STATUS_GROUPS.map((group) => [group.id, ""]));
const ACCEPTED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const loadResultView = () => import("./components/ResultView");
const ResultView = lazy(loadResultView);

const STEP_COPY = [
  { title: "上传自拍", description: "用于生成视觉肖像" },
  { title: "九项自述", description: "记录最近一周感受" },
  { title: "确认生成", description: "确认信息使用边界" },
  { title: "状态报告", description: "查看六维观察结果" },
];

export function createAnalyzeFormData(photo, answers) {
  const formData = new FormData();
  formData.append("photo", photo);
  formData.append("answers", JSON.stringify(answers));
  formData.append("consent", JSON.stringify(true));
  return formData;
}

export function parseAnalyzeResponse(payload) {
  const advice = payload?.advice;
  const contact = payload?.contact;
  if (
    payload?.ok !== true
    || typeof payload.image !== "string"
    || typeof advice?.praise !== "string"
    || !Array.isArray(advice?.suggestions)
    || typeof advice?.cta !== "string"
    || typeof advice?.disclaimer !== "string"
    || typeof contact?.wechatId !== "string"
    || typeof contact?.qrUrl !== "string"
    || typeof contact?.label !== "string"
  ) {
    throw new Error("服务返回的数据不完整，请重新生成。");
  }
  return { image: payload.image, imageMode: "generated", ...advice, contact };
}

export function createFallbackResult(previewUrl) {
  return {
    image: previewUrl,
    imageMode: "uploaded",
    praise: "你愿意停下来观察自己的日常状态，本身就是很好的开始。",
    suggestions: [],
    cta: "如需结合日常饮食与生活节律进一步交流，可添加潘教授微信进行一对一沟通。",
    disclaimer: "内容仅作日常食养与生活方式参考。",
    contact: {
      wechatId: "pansun28",
      qrUrl: `${import.meta.env.BASE_URL}pansun28-wechat.png`,
      label: "扫码获取微信号",
    },
  };
}

export function isStaticDeployment(hostname = window.location.hostname) {
  return hostname.endsWith(".github.io");
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export default function App() {
  const [step, setStep] = useState(0);
  const [photo, setPhoto] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [states, setStates] = useState(EMPTY_STATES);
  const [consented, setConsented] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState(1);
  const [result, setResult] = useState(null);
  const previewRef = useRef("");

  useEffect(() => () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
  }, []);

  const completedStates = useMemo(
    () => STATUS_GROUPS.filter((group) => states[group.id]).length,
    [states],
  );

  function selectPhoto(file) {
    setError("");
    if (!file) return;
    if (!ACCEPTED_PHOTO_TYPES.has(file.type)) {
      setError("请选择 JPG、PNG 或 WebP 图片。");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("照片大小不能超过 10MB，请压缩后重试。");
      return;
    }
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    const nextUrl = URL.createObjectURL(file);
    previewRef.current = nextUrl;
    setPreviewUrl(nextUrl);
    setPhoto(file);
  }

  function updateState(groupId, value) {
    setError("");
    setStates((current) => ({ ...current, [groupId]: value }));
  }

  function moveNext() {
    setError("");
    if (step === 0 && !photo) {
      setError("请先上传一张本人自拍照。");
      return;
    }
    if (step === 1 && completedStates !== STATUS_GROUPS.length) {
      setError("请完成全部九项本人自述后继续。");
      return;
    }
    setStep((current) => Math.min(current + 1, 2));
  }

  async function submitAnalysis() {
    if (!consented || isSubmitting) {
      if (!consented) setError("请确认信息使用说明后再生成报告。");
      return;
    }

    setError("");
    setIsSubmitting(true);
    setProgress(1);
    void loadResultView();
    const startedAt = performance.now();
    const progressTimer = window.setInterval(() => {
      setProgress(progressAt(performance.now() - startedAt));
    }, 80);

    try {
      let parsedResult;
      const controller = new AbortController();
      let requestTimeout;
      try {
        if (isStaticDeployment()) {
          parsedResult = createFallbackResult(previewUrl);
        } else {
          const response = await Promise.race([
            fetch("/api/analyze", {
              method: "POST",
              body: createAnalyzeFormData(photo, states),
              signal: controller.signal,
            }),
            new Promise((_, reject) => {
              requestTimeout = window.setTimeout(() => {
                controller.abort();
                const timeoutError = new Error("图像服务响应超时");
                timeoutError.name = "AbortError";
                reject(timeoutError);
              }, ANALYSIS_TIMEOUT_MS);
            }),
          ]);
          const payload = await response.json().catch(() => null);
          if (!response.ok) {
            if (response.status === 429 || response.status >= 500) {
              parsedResult = createFallbackResult(previewUrl);
            } else {
              const apiMessage = typeof payload?.error === "string" ? payload.error : payload?.error?.message;
              throw new Error(apiMessage || payload?.message || "生成失败，请稍后重试。");
            }
          } else {
            parsedResult = parseAnalyzeResponse(payload);
          }
        }
      } catch (requestError) {
        if (requestError.name === "AbortError" || requestError instanceof TypeError) {
          parsedResult = createFallbackResult(previewUrl);
        } else {
          throw requestError;
        }
      } finally {
        window.clearTimeout(requestTimeout);
      }
      const remaining = Math.max(0, MIN_LOADING_MS - (performance.now() - startedAt));
      await wait(remaining);
      window.clearInterval(progressTimer);
      setProgress(100);
      await wait(480);
      setResult(parsedResult);
      setStep(3);
    } catch (requestError) {
      setError(requestError.message || "网络连接异常，请检查后重试。");
    } finally {
      window.clearInterval(progressTimer);
      setIsSubmitting(false);
    }
  }

  function startOver() {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = "";
    setPhoto(null);
    setPreviewUrl("");
    setStates(EMPTY_STATES);
    setConsented(false);
    setResult(null);
    setProgress(1);
    setError("");
    setStep(0);
  }

  return (
    <div className="app-shell">
      <ProgressSidebar steps={STEP_COPY} currentStep={step} />
      <main className="workspace">
        <div className={`workspace-inner ${step === 3 ? "result-workspace" : ""}`}>
          {step < 3 && (
            <header className="page-header">
              <p className="eyebrow">苏华食养 · 状态光谱</p>
              <h1>{STEP_COPY[step].title}</h1>
              <p>
                {step === 0 && "照片仅用于生成报告中的视觉肖像，不用于任何健康推断。"}
                {step === 1 && "用九项本人自述记录近期节奏，并汇总为六个观察维度。"}
                {step === 2 && "确认照片和自述的使用边界，生成你的六维状态报告。"}
              </p>
            </header>
          )}

          {step === 0 && <UploadField file={photo} previewUrl={previewUrl} onSelect={selectPhoto} />}
          {step === 1 && <StatusForm values={states} onChange={updateState} />}

          {step === 2 && (
            <section className="confirm-panel" aria-labelledby="confirm-title">
              <div className="confirm-summary">
                <img src={previewUrl} alt="待生成视觉肖像的自拍预览" />
                <div>
                  <span className="summary-kicker"><Check size={16} /> 九项自述已就绪</span>
                  <h2 id="confirm-title">确认报告信息边界</h2>
                  <p>报告仅依据本人自述生成；照片只用于生成视觉肖像，不参与健康推断。</p>
                </div>
              </div>
              <label className={`consent-row ${consented ? "is-checked" : ""}`}>
                <input
                  type="checkbox"
                  checked={consented}
                  onChange={(event) => { setConsented(event.target.checked); setError(""); }}
                  disabled={isSubmitting}
                />
                <span className="custom-checkbox" aria-hidden="true"><Check size={15} /></span>
                <span>我已了解：气色、肠道、睡眠、压力与情绪等内容均为我的主动自述，不是照片识别或诊断。</span>
              </label>
              <div className="privacy-note">
                <ShieldCheck size={19} />
                <p>请勿上传他人照片。本报告仅作日常食养与生活记录参考，不替代专业支持。</p>
              </div>
            </section>
          )}

          {step === 3 && result && (
            <Suspense fallback={<div className="report-module-loading" role="status">正在打开报告</div>}>
              <ResultView result={result} answers={states} onRestart={startOver} />
            </Suspense>
          )}
          {isSubmitting && <LoadingExperience progress={progress} />}
          {error && <p className="error-message" role="alert">{error}</p>}

          {step < 3 && (
            <footer className="form-actions">
              {step > 0 ? (
                <button className="button button-secondary" type="button" onClick={() => { setError(""); setStep(step - 1); }} disabled={isSubmitting}>
                  <ArrowLeft size={18} /> 上一步
                </button>
              ) : <span />}
              {step < 2 ? (
                <button className="button button-primary" type="button" onClick={moveNext}>
                  下一步 <ArrowRight size={18} />
                </button>
              ) : (
                <button className="button button-primary" type="button" onClick={submitAnalysis} disabled={!consented || isSubmitting}>
                  {isSubmitting ? <LoaderCircle className="spin" size={18} /> : <Check size={18} />}
                  生成状态报告
                </button>
              )}
            </footer>
          )}
        </div>
      </main>
    </div>
  );
}
