import { Check, ImagePlus, RefreshCw, UploadCloud } from "lucide-react";
import { useRef, useState } from "react";

export default function UploadField({ file, previewUrl, onSelect }) {
  const inputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    onSelect(event.dataTransfer.files?.[0]);
  }

  return (
    <section className="upload-section" aria-labelledby="upload-title">
      <div
        className={`upload-zone ${isDragging ? "is-dragging" : ""} ${file ? "has-file" : ""}`}
        onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setIsDragging(false); }}
        onDrop={handleDrop}
      >
        {previewUrl ? (
          <div className="photo-preview">
            <img src={previewUrl} alt="已选择的正面照预览" />
            <div className="preview-info">
              <span><ImagePlus size={18} /> 照片已选择</span>
              <strong>{file.name}</strong>
              <button className="button button-secondary" type="button" onClick={() => inputRef.current?.click()}>
                <RefreshCw size={17} /> 重新选择
              </button>
            </div>
          </div>
        ) : (
          <button className="upload-prompt" type="button" onClick={() => inputRef.current?.click()}>
            <span className="upload-icon"><UploadCloud size={30} /></span>
            <strong id="upload-title">拖拽照片到这里，或点击选择</strong>
            <span>支持 JPG、PNG、WebP，最大 10MB</span>
          </button>
        )}
        <input
          ref={inputRef}
          className="visually-hidden"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => {
            onSelect(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </div>
      <div className="upload-guidance" aria-label="拍摄建议">
        <span><Check size={17} /> 正面自然光</span>
        <span><Check size={17} /> 面部无遮挡</span>
        <span><Check size={17} /> 仅上传本人照片</span>
      </div>
    </section>
  );
}
