"use client";

// One screenshot slot (before / after): drop, choose or paste an image (TradingView's
// "Copy image" works), upload with progress, preview, replace, remove. The server writes
// public/shots/<id>-<slot>.<ext> and the trade's `shots` field together.

import { useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import s from "./edit.module.css";

interface Props {
  tradeId: number;
  slot: "before" | "after";
  label: string;
  hint: string;
  path: string | null;
  onChange: (path: string | null) => void;
}

const TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX = 10 * 1024 * 1024;

export function ShotSlot({ tradeId, slot, label, hint, path, onChange }: Props) {
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [version, setVersion] = useState(0); // busts the browser cache after a replace
  const input = useRef<HTMLInputElement>(null);
  const busy = progress !== null;

  function upload(file: File) {
    if (!TYPES.includes(file.type)) return setError("PNG, JPEG or WebP only.");
    if (file.size > MAX) return setError("The image is over 10 MB.");
    const body = new FormData();
    body.append("slot", slot);
    body.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/admin/trades/${tradeId}/shots`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let data: { path?: string; error?: string } = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300 && data.path) {
        setProgress(1);
        setTimeout(() => setProgress(null), 240);
        setVersion(Date.now());
        onChange(data.path);
      } else {
        setProgress(null);
        setError(data.error ?? "The upload failed.");
      }
    };
    xhr.onerror = () => {
      setProgress(null);
      setError("The local server did not answer.");
    };
    setError(null);
    setProgress(0);
    xhr.send(body);
  }

  async function remove() {
    if (!window.confirm("Remove this screenshot? The image file is deleted.")) return;
    setError(null);
    try {
      const res = await fetch(`/api/admin/trades/${tradeId}/shots?slot=${slot}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      onChange(null);
    } catch {
      setError("Could not remove the screenshot.");
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && !busy) upload(file);
  };
  const onPaste = (e: ClipboardEvent) => {
    const file = [...e.clipboardData.files].find((f) => TYPES.includes(f.type));
    if (file && !busy) {
      e.preventDefault();
      upload(file);
    }
  };

  return (
    <div className={s.fld}>
      <span className={s.lbl} id={`shot-${slot}`}>
        {label}
      </span>
      <div
        className={`${s.drop} ${over ? s.over : ""} ${path ? s.filled : ""}`}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) {
            e.preventDefault();
            setOver(true);
          }
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        onPaste={onPaste}
      >
        {path ? (
          <a href={path} target="_blank" rel="noopener" className={`plain ${s.preview}`} aria-label={`${label}: open the image`}>
            <img key={version} src={`${path}?v=${version}`} alt="" className="fade-in" />
          </a>
        ) : (
          <button type="button" className={s.dropBtn} onClick={() => input.current?.click()} disabled={busy} aria-describedby={`shot-${slot}`}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path d="M12 16V4M7 9l5-5 5 5M4 16v4h16v-4" />
            </svg>
            <span className={s.dropTitle}>{busy ? "Uploading…" : "Drop your TradingView screenshot"}</span>
            <span className="mono pencil" style={{ fontSize: 11 }}>
              {hint} · or paste it
            </span>
          </button>
        )}
        {busy && (
          <span className={s.progress} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((progress ?? 0) * 100)}>
            <span style={{ transform: `scaleX(${progress ?? 0})` }} />
          </span>
        )}
      </div>
      {path && (
        <div className={s.shotActions}>
          <button type="button" className={s.linkBtn} onClick={() => input.current?.click()} disabled={busy}>
            Replace
          </button>
          <button type="button" className={s.linkBtn} onClick={remove} disabled={busy}>
            Remove
          </button>
          <span className="mono pencil">{path}</span>
        </div>
      )}
      {error && <span className={`${s.errText} fade-in`}>{error}</span>}
      <input
        ref={input}
        type="file"
        accept={TYPES.join(",")}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
