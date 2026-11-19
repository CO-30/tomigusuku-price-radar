import { useRef, useState } from "react";
import { Product } from "./types";
import { recognizeImage } from "./ocr/recognize";
import { Capture, loadCaptures, saveCaptures, wordsToProducts } from "./captures";
import { yen } from "./data";

interface Props {
  today: string;
  onCaptured: () => void;
}

type Phase = "idle" | "working" | "done";

// 画像を長辺1600pxに縮小しOCR精度と速度のバランスを取る + サムネイルを作る
async function prepImage(file: File): Promise<{ canvas: HTMLCanvasElement; thumb: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const long = Math.max(img.width, img.height);
    const scale = long > 1600 ? 1600 / long : 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const tc = document.createElement("canvas");
    const ts = 240 / Math.max(canvas.width, canvas.height);
    tc.width = Math.round(canvas.width * ts);
    tc.height = Math.round(canvas.height * ts);
    tc.getContext("2d")!.drawImage(canvas, 0, 0, tc.width, tc.height);
    return { canvas, thumb: tc.toDataURL("image/jpeg", 0.6) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function Camera({ today, onCaptured }: Props) {
  // カメラ直結用と、写真ライブラリ（スクショを含む）用を分ける。
  // capture 属性を付けた input は iOS でカメラ固定になり、保存済みスクショを
  // 選べない。公式チラシを開いてスクショ→選ぶ、という導線のために必須。
  const camRef = useRef<HTMLInputElement>(null);
  const libRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<Product[] | null>(null);
  const [captures, setCaptures] = useState<Capture[]>(() =>
    loadCaptures().filter((c) => c.date === today)
  );

  const onFiles = async (e: React.ChangeEvent<HTMLInputElement>, origin: string) => {
    const files = Array.from(e.target.files ?? []);
    const input = e.target;
    if (files.length === 0) return;
    setPhase("working");
    setResult(null);
    const found: Product[] = [];
    let failed = 0;

    for (const [idx, file] of files.entries()) {
      const pos = files.length > 1 ? `（${idx + 1}/${files.length}枚目）` : "";
      try {
        setStatus(`画像を準備中…${pos}`);
        const { canvas, thumb } = await prepImage(file);
        setStatus(`文字を読み取り中…${pos}（初回は辞書を取得します）`);
        const words = await recognizeImage(canvas, (s, p) => {
          if (s === "recognizing text") setStatus(`解析中… ${Math.round(p * 100)}%${pos}`);
          else if (s.includes("loading") || s.includes("initial")) setStatus("日本語辞書を準備中…");
        });
        const products = wordsToProducts(words, "", today, thumb);
        const cap: Capture = { date: today, store: origin, thumb, products };
        saveCaptures([...loadCaptures(), cap]);
        found.push(...products);
      } catch {
        failed += 1;
      }
    }

    setCaptures(loadCaptures().filter((c) => c.date === today));
    input.value = "";

    if (found.length === 0 && failed === files.length) {
      setStatus("読み取りに失敗しました。明るく正面から撮り直すか、別の画像でお試しください。");
      setPhase("idle");
      return;
    }
    setStatus(failed > 0 ? `${failed}枚は読み取れませんでした。` : "");
    setResult(found);
    setPhase("done");
    onCaptured();
  };

  const removeCapture = (idx: number) => {
    const all = loadCaptures();
    const target = captures[idx];
    const next = all.filter((c) => c !== target && !(c.date === target.date && c.thumb === target.thumb));
    saveCaptures(next);
    setCaptures(next.filter((c) => c.date === today));
    onCaptured();
  };

  const totalFound = captures.reduce((s, c) => s + c.products.length, 0);
  const busy = phase === "working";

  return (
    <div className="page">
      <input
        ref={camRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => onFiles(e, "撮影")}
        style={{ display: "none" }}
      />
      <input
        ref={libRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => onFiles(e, "画像")}
        style={{ display: "none" }}
      />

      <button
        className="btn primary camera-btn"
        onClick={() => camRef.current?.click()}
        disabled={busy}
      >
        {busy ? "解析中…" : "📷 その場で撮る"}
      </button>
      <button
        className="btn camera-btn secondary"
        onClick={() => libRef.current?.click()}
        disabled={busy}
      >
        {busy ? "解析中…" : "🖼 スクショ・写真から選ぶ"}
      </button>

      <p className="note" style={{ textAlign: "center" }}>
        店頭のチラシはそのまま撮影。公式チラシは「チラシ ›」で開いて
        スクリーンショットを撮り、こちらから選べば同じように解析されます（複数枚まとめて可）。
      </p>

      {busy && <p className="note">{status}</p>}
      {phase === "idle" && status && <p className="note">{status}</p>}

      {result && (
        <div className="capture-result">
          <h3>
            {result.length > 0
              ? `${result.length}件を読み取りました`
              : "商品を読み取れませんでした"}
          </h3>
          {status && <p className="note">{status}</p>}
          {result.length === 0 && (
            <p className="note">
              価格が大きく写るように、1商品ずつ正面から撮ると精度が上がります。
              スクショの場合は、チラシを拡大してから撮ると読み取れることがあります。
            </p>
          )}
          {result.map((p, i) => (
            <div className="list-item" key={i}>
              <span>
                <b>{p.name}</b>
                {(p as Product & { needs_review?: boolean }).needs_review && (
                  <span className="nohit"> 要確認</span>
                )}
              </span>
              <span className="num">
                {p.unit_price != null ? `${yen(p.unit_price)}${p.unit_label}` : `${yen(p.price_incl)}円`}
              </span>
              <span />
            </div>
          ))}
        </div>
      )}

      {captures.length > 0 && (
        <>
          <h3 style={{ marginTop: 24 }}>
            今日の読み取り（{captures.length}枚・{totalFound}件）
          </h3>
          {captures.map((c, i) => (
            <div className="capture-row" key={i}>
              <img src={c.thumb} alt="読み取ったチラシ" className="capture-thumb" />
              <span>
                {c.store} <span className="note">{c.products.length}件</span>
              </span>
              <button className="iconbtn" onClick={() => removeCapture(i)} aria-label="削除">
                ✕
              </button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
