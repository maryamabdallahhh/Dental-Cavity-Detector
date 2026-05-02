"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import styles from "./DentalDetector.module.css";

//   Types  

interface Detection {
  // Class name — every field alias seen in the wild
  class_name?: string;
  class?: string;
  name?: string;
  label?: string;
  category?: string;
  class_label?: string;
  Label?: string;
  Category?: string;
  // Class ID (integer 0-3) as fallback when no string name present
  class_id?: number;
  id?: number;
  // Confidence
  confidence?: number;
  score?: number;
  prob?: number;
  probability?: number;
  // Bounding box (xyxy absolute pixels)
  box?: [number, number, number, number];
  bbox?: [number, number, number, number];
  box_coordinates?: [number, number, number, number];
  xyxy?: [number, number, number, number];
  coordinates?: [number, number, number, number];
  // Allow any other fields from the API
  [key: string]: unknown;
}

interface NaturalSize {
  width: number;
  height: number;
}

//   Constants  

 // cssVar is used for JSX inline styles only.
const CLASS_META: Record<
  string,
  { hex: string; bg: string; key: string }
> = {
  Cavity:          { hex: "#C0124D", bg: "var(--clr-cavity-bg)",   key: "cavity"   },
  Fillings:        { hex: "#21D0AF", bg: "var(--clr-filling-bg)",  key: "filling"  },
  "Impacted Tooth":{ hex: "#d97706", bg: "var(--clr-impacted-bg)", key: "impacted" },
  Implant:         { hex: "#6028A5", bg: "var(--clr-implant-bg)",  key: "implant"  },
};

// Map numeric class IDs from the model to their string names
const CLASS_ID_MAP: Record<number, string> = {
  0: "Cavity",
  1: "Fillings",
  2: "Impacted Tooth",
  3: "Implant",
};

// Case-insensitive lookup helper
function resolveClassName(raw: string): string {
  if (CLASS_META[raw]) return raw;
  const lower = raw.toLowerCase().trim();
  for (const key of Object.keys(CLASS_META)) {
    if (key.toLowerCase() === lower) return key;
  }
  // Partial match — e.g. "cavity" matches "Cavity", "impacted" matches "Impacted Tooth"
  for (const key of Object.keys(CLASS_META)) {
    if (key.toLowerCase().includes(lower) || lower.includes(key.toLowerCase())) return key;
  }
  return raw; // Return original if no match found
}

const CLASS_KEYS = ["cavity", "filling", "impacted", "implant"] as const;
const CLASS_LABELS: Record<(typeof CLASS_KEYS)[number], string> = {
  cavity: "Cavities",
  filling: "Fillings",
  impacted: "Impacted",
  implant: "Implants",
};

//   Helper  

function getDetectionMeta(d: Detection) {
  //   Resolve class name from any possible field  
  const rawName =
    d.class_name ?? d.class ?? d.name ?? d.label ??
    d.category ?? d.class_label ?? d.Label ?? d.Category;

  let name: string;
  if (rawName && typeof rawName === "string") {
    name = resolveClassName(rawName);
  } else {
    // Fall back to integer class ID
    const classId = d.class_id ?? d.id;
    name = (classId !== undefined && classId !== null)
      ? (CLASS_ID_MAP[classId as number] ?? `Class ${classId}`)
      : "Unknown";
  }

  //   Confidence  
  const confidence = d.confidence ?? d.score ?? d.prob ?? d.probability ?? 0;

  //   Bounding box  
  const box = (d.box ?? d.bbox ?? d.box_coordinates ?? d.xyxy ?? d.coordinates ?? [
    0, 0, 0, 0,
  ]) as [number, number, number, number];

  //   Meta (hex color for canvas, bg for JSX)  
  const meta = CLASS_META[name] ?? {
    hex: "#888888",
    bg: "var(--bg-muted)",
    key: "cavity",
  };

  return { name, confidence, box, meta };
}

// Debug helper — log the raw API response to the browser console
// so you can inspect the exact field names your API returns.
function logRawDetections(data: unknown) {
  console.group("[DentalDetector] Raw API response");
  console.log(JSON.stringify(data, null, 2));
  console.groupEnd();
}

//   Component  

export default function DentalDetector() {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState<NaturalSize | null>(null);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState<number>(-1);
  const [fileName, setFileName] = useState<string>("");
  const [fileSize, setFileSize] = useState<string>("");

  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentFileRef = useRef<File | null>(null);

  //   Draw bounding boxes with correct scaling    

  const drawBoxes = useCallback(
    (dets: Detection[], hIdx = -1) => {
      const img = imgRef.current;
      const canvas = canvasRef.current;
      if (!img || !canvas || !naturalSize) return;

      // Displayed size (after CSS / object-fit scaling)
      const displayW = img.offsetWidth;
      const displayH = img.offsetHeight;

      // Sync canvas pixel dimensions to displayed image size
      canvas.width = displayW;
      canvas.height = displayH;

      // Scale factors: original coords → display coords
      const scaleX = displayW / naturalSize.width;
      const scaleY = displayH / naturalSize.height;

      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, displayW, displayH);

      dets.forEach((d, i) => {
        const { name, confidence, box, meta } = getDetectionMeta(d);
        const isHighlighted = i === hIdx;

        const sx1 = box[0] * scaleX;
        const sy1 = box[1] * scaleY;
        const sx2 = box[2] * scaleX;
        const sy2 = box[3] * scaleY;
        const bw = sx2 - sx1;
        const bh = sy2 - sy1;

        ctx.globalAlpha = isHighlighted ? 1 : 0.8;

        // Fill highlight
        if (isHighlighted) {
          ctx.fillStyle = meta.hex + "25";
          ctx.fillRect(sx1, sy1, bw, bh);
        }

        // Bounding rect
        ctx.strokeStyle = meta.hex;
        ctx.lineWidth = isHighlighted ? 2.5 : 1.5;
        ctx.strokeRect(sx1, sy1, bw, bh);

        // Label
        const label = `${name} ${Math.round(confidence * 100)}%`;
        ctx.font = `${isHighlighted ? "600 " : ""}11px var(--font-mono, monospace)`;
        const tw = ctx.measureText(label).width + 10;
        const labelH = 18;
        const labelY = sy1 >= labelH + 2 ? sy1 - labelH : sy1 + bh + 2;

        ctx.fillStyle = meta.hex;
        ctx.globalAlpha = isHighlighted ? 1 : 0.9;
        roundedRect(ctx, sx1, labelY, tw, labelH, 3);
        ctx.fill();

        ctx.fillStyle = "#ffffff";
        ctx.globalAlpha = 1;
        ctx.fillText(label, sx1 + 5, labelY + 12);
      });

      ctx.globalAlpha = 1;
    },
    [naturalSize]
  );

  function roundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // Re-draw whenever detections, naturalSize, or highlight change
  useEffect(() => {
    if (detections.length > 0 && naturalSize) {
      drawBoxes(detections, highlightIdx);
    }
  }, [detections, naturalSize, highlightIdx, drawBoxes]);

  // Re-draw on window resize
  useEffect(() => {
    const onResize = () => {
      if (detections.length > 0 && naturalSize) drawBoxes(detections, highlightIdx);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [detections, naturalSize, highlightIdx, drawBoxes]);

  //   API call  

  const callAPI = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    setDetections([]);
    setHighlightIdx(-1);

    try {
      const formData = new FormData();
      formData.append("file", file);

      // Call our Next.js proxy — avoids CORS entirely
      const res = await fetch("/api/predict", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({ error: res.statusText }))) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      const data = await res.json();
      logRawDetections(data);  

      // Normalise response — handle various top-level array field names
      const dets: Detection[] =
        data.detections ?? data.predictions ?? data.results ??
        data.boxes ?? data.objects ?? data.items ??
        (Array.isArray(data) ? data : []);
      setDetections(dets);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err ?? "Unknown error");
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  //   File handling  

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) return;

      currentFileRef.current = file;
      setFileName(file.name);
      setFileSize((file.size / 1024).toFixed(1) + " KB");

      const url = URL.createObjectURL(file);
      setImageUrl(url);

      // Measure natural dimensions before API call
      const tempImg = new Image();
      tempImg.onload = () => {
        setNaturalSize({ width: tempImg.naturalWidth, height: tempImg.naturalHeight });
        URL.revokeObjectURL(url); // only need for measurement
      };
      tempImg.src = url;

      // Re-create a fresh object URL for the <img> element
      setImageUrl(URL.createObjectURL(file));

      callAPI(file);
    },
    [callAPI]
  );

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const onDragLeave = () => setIsDragging(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  //   Summary counts  

  const counts = detections.reduce(
    (acc, d) => {
      const { meta } = getDetectionMeta(d);
      if (meta.key in acc) acc[meta.key as keyof typeof acc]++;
      return acc;
    },
    { cavity: 0, filling: 0, impacted: 0, implant: 0 }
  );

 
  return (
    <div className={styles.page}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerIcon}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 2c0 0-1 3-1 6s1 5 1 5H6c-2.5 0-4 2-4 4s2 6 4 6h12c2 0 4-4 4-6s-1.5-4-4-4h-2s1-2 1-5-1-6-1-6" />
            <path d="M9 8c0 2 1.5 3 3 3s3-1 3-3" />
          </svg>
        </div>
        <div>
          <h1 className={styles.title}>Dental Cavity Detector</h1>
          {/* <p className={styles.subtitle}>YOLOv8m · mAP50 0.758 · Cavity · Fillings · Impacted Tooth · Implant</p> */}
        </div>
      </header>

      {/* Main grid */}
      <div className={styles.grid}>
        {/* Left — image panel */}
        <div className={styles.panel}>
          <div className={styles.panelTitle}>X-Ray Input</div>

          {!imageUrl ? (
            <div
              className={`${styles.dropzone} ${isDragging ? styles.dragging : ""}`}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.4">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              <p className={styles.dropText}>Drop a dental X-ray here</p>
              <button className={styles.browseBtn} type="button">
                Browse files
              </button>
              <p className={styles.dropHint}>JPEG · PNG · WEBP · up to 10 MB</p>
            </div>
          ) : (
            <div className={styles.imageWrapper}>
              {loading && <div className={styles.loadingBar} />}
              <div className={styles.imgContainer}>
                <img
                  ref={imgRef}
                  src={imageUrl}
                  alt="Dental X-ray"
                  className={styles.xrayImg}
                  onLoad={() => {
                    if (detections.length > 0) drawBoxes(detections, highlightIdx);
                  }}
                />
                <canvas ref={canvasRef} className={styles.boxCanvas} />
              </div>
              <div className={styles.imageMeta}>
                <span>{fileName}</span>
                {naturalSize && (
                  <span>{naturalSize.width} × {naturalSize.height}px</span>
                )}
                <span>{fileSize}</span>
                <button
                  className={styles.changeBtn}
                  onClick={() => fileInputRef.current?.click()}
                  type="button"
                >
                  Change
                </button>
              </div>
            </div>
          )}

          {/* Legend */}
          <div className={styles.legend}>
            {Object.entries(CLASS_META).map(([name, meta]) => (
              <div key={name} className={styles.legendItem}>
                <span
                  className={styles.legendDot}
                  style={{ background: meta.hex }}
                />
                {name}
              </div>
            ))}
          </div>
        </div>

        {/* Right — results panel */}
        <div className={styles.panel}>
          <div className={styles.panelTitle}>
            Detections
            {detections.length > 0 && (
              <span className={styles.detCount}>{detections.length}</span>
            )}
          </div>

          <div className={styles.resultsBody}>
            {loading && (
              <div className={styles.emptyState}>
                <div className={styles.spinner} />
                <span>Analyzing X-ray…</span>
              </div>
            )}

            {!loading && error && (
              <div className={styles.errorBox}>
                <strong>Error:</strong> {error}
                <button
                  className={styles.retryBtn}
                  onClick={() => currentFileRef.current && callAPI(currentFileRef.current)}
                  type="button"
                >
                  Retry
                </button>
              </div>
            )}

            {!loading && !error && !imageUrl && (
              <div className={styles.emptyState}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.3">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <span>Upload an X-ray to see results</span>
              </div>
            )}

            {!loading && !error && imageUrl && detections.length === 0 && (
              <div className={styles.emptyState}>
                <span>No dental conditions detected</span>
              </div>
            )}

            {!loading && detections.length > 0 && (
              <div className={styles.detectionList}>
                {detections.map((d, i) => {
                  const { name, confidence, box, meta } = getDetectionMeta(d);
                  return (
                    <div
                      key={i}
                      className={`${styles.detCard} ${highlightIdx === i ? styles.detCardActive : ""}`}
                      style={highlightIdx === i ? { borderColor: meta.hex, background: meta.bg } : {}}
                      onClick={() => setHighlightIdx(i === highlightIdx ? -1 : i)}
                    >
                      <span
                        className={styles.detDot}
                        style={{ background: meta.hex }}
                      />
                      <div className={styles.detInfo}>
                        <div className={styles.detName}>{name}</div>
                        <div className={styles.detCoords}>
                          [{box.map((v) => Math.round(v)).join(", ")}]
                        </div>
                        <div className={styles.confBarWrap}>
                          <div
                            className={styles.confBar}
                            style={{
                              width: `${Math.round(confidence * 100)}%`,
                              background: meta.hex,
                            }}
                          />
                        </div>
                      </div>
                      <div className={styles.detConf} style={{ color: meta.hex }}>
                        {Math.round(confidence * 100)}%
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Summary bar */}
          {detections.length > 0 && (
            <div className={styles.summaryBar}>
              {CLASS_KEYS.map((key) => {
                const metaEntry = Object.values(CLASS_META).find((m) => m.key === key)!;
                return (
                  <div key={key} className={styles.summaryItem}>
                    <div
                      className={styles.summaryCount}
                      style={{ color: metaEntry.hex }}
                    >
                      {counts[key]}
                    </div>
                    <div className={styles.summaryLabel}>{CLASS_LABELS[key]}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Disclaimer */}
      <p className={styles.disclaimer}>
        For clinical decision support only — not a substitute for professional dental diagnosis.
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}