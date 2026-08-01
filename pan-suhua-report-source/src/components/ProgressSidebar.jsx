import { Check, Leaf, LockKeyhole } from "lucide-react";

export default function ProgressSidebar({ steps, currentStep }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark"><Leaf size={22} /></span>
        <div>
          <strong>潘教授食养小助手</strong>
          <span>日常观察 · 温和陪伴</span>
        </div>
      </div>

      <nav className="step-nav" aria-label="生成步骤">
        {steps.map((item, index) => {
          const status = index < currentStep ? "complete" : index === currentStep ? "active" : "pending";
          return (
            <div className={`step-item is-${status}`} key={item.title} aria-current={status === "active" ? "step" : undefined}>
              <span className="step-number">{status === "complete" ? <Check size={16} /> : index + 1}</span>
              <span className="step-text">
                <strong>{item.title}</strong>
                <small>{item.description}</small>
              </span>
            </div>
          );
        })}
      </nav>

      <div className="sidebar-privacy">
        <LockKeyhole size={18} />
        <div>
          <strong>隐私与使用说明</strong>
          <p>照片不用于疾病诊断或健康推断。</p>
        </div>
      </div>
    </aside>
  );
}
