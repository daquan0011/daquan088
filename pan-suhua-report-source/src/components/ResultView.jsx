import { useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import {
  Check,
  Copy,
  Download,
  HeartHandshake,
  Leaf,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { buildVisualReport } from "../lib/report.js";

export default function ResultView({ result, answers, onRestart }) {
  const report = useMemo(() => buildVisualReport(answers), [answers]);
  const contact = result.contact;
  const cardRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [actionError, setActionError] = useState("");
  const needsMoodSupport = answers.mood === "持续低落";
  const usesUploadedPhoto = result.imageMode === "uploaded";

  async function copyWechat() {
    try {
      await navigator.clipboard.writeText(contact.wechatId);
      setCopied(true);
      setActionError("");
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setActionError(`复制失败，请手动复制微信号“${contact.wechatId}”。`);
    }
  }

  async function downloadReport() {
    setIsDownloading(true);
    setActionError("");
    try {
      const dataUrl = await toPng(cardRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#091313",
      });
      const link = document.createElement("a");
      link.download = "苏华食养六维状态报告.png";
      link.href = dataUrl;
      link.click();
    } catch {
      setActionError("报告图片生成失败，请稍后重试。");
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <section className="result-view">
      <header className="result-header">
        <div>
          <p className="eyebrow">REPORT COMPLETE · 九项自述六维汇总</p>
          <h1>你的食养状态光谱</h1>
        </div>
        <button className="icon-button" type="button" onClick={onRestart} title="重新生成" aria-label="重新生成">
          <RefreshCw size={19} />
        </button>
      </header>

      <div className="report-canvas" ref={cardRef}>
        <section className="report-hero">
          <div className="portrait-panel">
            <img src={result.image} alt={usesUploadedPhoto ? "用户上传的自拍影像" : "根据上传自拍生成的视觉肖像"} />
            <div className="portrait-shade" />
            <span className="portrait-label"><Leaf size={15} /> 苏华食养</span>
            <div className="portrait-caption">
              <small>{usesUploadedPhoto ? "UPLOADED PORTRAIT" : "GENERATED PORTRAIT"}</small>
              <strong>{usesUploadedPhoto ? "自拍影像" : "视觉肖像"}</strong>
              <p>仅作报告视觉呈现，不参与状态判断</p>
            </div>
          </div>

          <div className="spectrum-panel">
            <div className="report-brand"><Sparkles size={17} /><span>SELF-REPORTED SPECTRUM</span></div>
            <div className="overall-row">
              <div><strong>{report.overall}</strong><span>/ 100</span></div>
              <p>综合观察值<small>由九项本人自述汇总为六维</small></p>
            </div>
            <div className="radar-wrap" aria-label="六维本人自述雷达图">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={report.dimensions} outerRadius="66%">
                  <PolarGrid stroke="rgba(197, 224, 217, 0.2)" />
                  <PolarAngleAxis dataKey="label" tick={{ fill: "#dce9e5", fontSize: 12 }} />
                  <Radar
                    dataKey="score"
                    stroke="#72f0cc"
                    fill="#41cfa8"
                    fillOpacity={0.34}
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        <section className="dimension-section">
          <div className="section-heading">
            <span>01</span><div><small>六维状态</small><h2>本人自述数据条</h2></div>
          </div>
          <div className="dimension-grid">
            {report.dimensions.map((dimension) => (
              <article className="dimension-item" key={dimension.id}>
                <div className="dimension-top"><strong>{dimension.label}</strong><span>{dimension.score}</span></div>
                <div className="dimension-track"><span style={{ width: `${dimension.score}%`, backgroundColor: dimension.color }} /></div>
                <p>{dimension.note}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="analytics-section" aria-labelledby="analytics-title">
          <div className="section-heading analytics-heading">
            <span>02</span><div><small>数据分析</small><h2 id="analytics-title">六维自述分析仪表</h2></div>
          </div>
          <div className="analytics-grid">
            <article className="analysis-panel compass-panel">
              <div className="analysis-panel-title"><small>OVERALL COMPASS</small><h3>六维状态罗盘</h3></div>
              <div className="score-compass" style={{ "--score": `${report.overall * 3.6}deg` }}>
                <div className="score-compass-inner"><strong>{report.overall}</strong><span>综合观察值</span></div>
              </div>
              <div className="compass-legend">
                {report.dimensions.map((dimension) => (
                  <span key={dimension.id}><i style={{ backgroundColor: dimension.color }} />{dimension.label}<b>{dimension.score}</b></span>
                ))}
              </div>
            </article>

            <article className="analysis-panel comparison-panel">
              <div className="analysis-panel-title"><small>PERSONAL COMPARISON</small><h3>维度与个人均值对比</h3></div>
              <div className="comparison-chart" aria-label="六个自述维度与个人六维均值的竖向柱状对比图">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={report.analytics.comparison} margin={{ top: 18, right: 4, left: -20, bottom: 4 }}>
                    <CartesianGrid vertical={false} stroke="rgba(197, 224, 217, 0.12)" />
                    <XAxis dataKey="label" interval={0} tick={{ fill: "#9aada7", fontSize: 8 }} tickLine={false} axisLine={false} />
                    <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fill: "#70857f", fontSize: 8 }} tickLine={false} axisLine={false} />
                    <Bar dataKey="score" name="维度自述值" radius={[3, 3, 0, 0]} maxBarSize={18} isAnimationActive={false}>
                      {report.analytics.comparison.map((item) => <Cell key={item.label} fill={item.color} />)}
                    </Bar>
                    <Bar dataKey="average" name="个人六维均值" fill="#4cd5ad" fillOpacity={0.48} radius={[3, 3, 0, 0]} maxBarSize={12} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="chart-legend"><span><i className="legend-spectrum" />维度自述值</span><span><i className="legend-average" />个人六维均值</span></div>
            </article>

            <article className="analysis-panel metrics-panel">
              <div className="analysis-panel-title"><small>DATA SUMMARY</small><h3>状态分布指标</h3></div>
              <div className="metric-list">
                <div className="metric-primary"><span>六维均衡度</span><strong>{report.analytics.balance}<small>/100</small></strong><div><i style={{ width: `${report.analytics.balance}%` }} /></div></div>
                <div className="metric-pair"><span><small>稳定项</small><strong>{report.analytics.steadyCount}<i>/6</i></strong></span><span><small>关注项</small><strong>{report.analytics.attentionCount}<i>/6</i></strong></span></div>
                <div className="metric-focus"><span>当前相对优势</span><strong>{report.analytics.strongest}</strong></div>
                <div className="metric-focus is-focus"><span>建议优先关注</span><strong>{report.analytics.focus}</strong></div>
              </div>
              <p className="analysis-note">均衡度反映六个汇总维度的分布差异；对比基准为你本人的六维均值，不是医学标准。</p>
            </article>
          </div>
        </section>

        <section className="insight-section">
          <div className="praise-panel">
            <span className="section-number">03 · 今日寄语</span>
            <blockquote>{report.praise}</blockquote>
            <p>{result.praise}</p>
          </div>
          <div className="suggestion-panel">
            <div className="section-heading compact">
              <span>04</span><div><small>日常起点</small><h2>给你的食养建议</h2></div>
            </div>
            <div className="suggestion-list">
              {report.suggestions.map((suggestion, index) => (
                <div className="suggestion" key={`${suggestion}-${index}`}>
                  <span>{String(index + 1).padStart(2, "0")}</span><p>{suggestion}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {needsMoodSupport && (
          <aside className="support-alert" role="note">
            <HeartHandshake size={24} />
            <div><strong>请把专业支持放在优先位置</strong><p>你自述近期情绪持续低落。请尽快联系心理或医疗专业人员，也可以请可信任的人陪伴。食养建议不能替代专业支持。</p></div>
          </aside>
        )}

        <section className="contact-section">
          <div className="contact-copy">
            <MessageCircle size={24} />
            <div><small>进一步交流</small><h2>微信 {contact.wechatId}</h2><p>{result.cta}</p></div>
          </div>
          <div className="qr-block">
            <img src={contact.qrUrl} alt={`微信号 ${contact.wechatId} 的二维码图片`} crossOrigin="anonymous" />
            <div><strong>{contact.label}</strong><span>也可复制：{contact.wechatId}</span></div>
          </div>
        </section>

        <footer className="report-disclaimer">
          <ShieldCheck size={17} />
          <p>{report.disclaimer} 报告仅依据本人自述，照片不用于健康推断。</p>
        </footer>
      </div>

      <div className="result-actions">
        <button className="button button-primary" type="button" onClick={downloadReport} disabled={isDownloading}>
          <Download size={18} /> {isDownloading ? "正在生成图片" : "下载完整报告"}
        </button>
        <button className="button button-secondary" type="button" onClick={copyWechat}>
          {copied ? <Check size={18} /> : <Copy size={18} />}
          {copied ? "已复制微信号" : `复制微信号 ${contact.wechatId}`}
        </button>
      </div>
      {actionError && <p className="error-message" role="alert">{actionError}</p>}
      <p className="result-footnote">二维码用于获取微信号，不保证能够直接添加好友。</p>
    </section>
  );
}
