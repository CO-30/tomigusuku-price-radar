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

// チラシ1枚を丸ごと写した画像は、縮小すると価格の文字が潰れてOCRが読めない。
// 長辺2400pxを目標に（元より大きくはしすぎない範囲で）調整し、
// カラーかぶりに強いグレースケール化＋コントラスト伸長をかけてから渡す。
const OCR_TARGET = 2400;

// 端末のカラーフィルタが効いたスクショは特定チャンネルが潰れるため、
// 最も分散の大きいチャンネルを選び、2〜98パーセンタイルで伸長する。
function toContrastGray(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const im = ctx.getImageData(0, 0, w, h);
  const d = im.data;
  const n = w * h;
  const sum = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    sum[0] += d[i * 4];
    sum[1] += d[i * 4 + 1];
    sum[2] += d[i * 4 + 2];
  }
  const mean = sum.map((v) => v / n);
  const varc = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) {
      const diff = d[i * 4 + c] - mean[c];
      varc[c] += diff * diff;
    }
  }
  let ch = 0;
  if (varc[1] > varc[ch]) ch = 1;
  if (varc[2] > varc[ch]) ch = 2;

  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) hist[d[i * 4 + ch]]++;
  const lowCut = n * 0.02;
  const highCut = n * 0.98;
  let acc = 0;
  let lo = 0;
  let hi = 255;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc <= lowCut) lo = v;
    if (acc <= highCut) hi = v;
  }
  const span = Math.max(1, hi - lo);
  for (let i = 0; i < n; i++) {
    let v = ((d[i * 4 + ch] - lo) * 255) / span;
    v = v < 0 ? 0 : v > 255 ? 255 : v;
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
  }
  ctx.putImageData(im, 0, 0);
}

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
    // 小さい画像は最大2倍まで拡大、大きい画像も2400pxまでしか縮めない
    const scale = Math.min(2, OCR_TARGET / long);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // サムネイルは加工前のカラー画像から作る（利用者が見て判別できるように）
    const tc = document.createElement("canvas");
    const ts = 240 / Math.max(canvas.width, canvas.height);
    tc.width = Math.max(1, Math.round(canvas.width * ts));
    tc.height = Math.max(1, Math.round(canvas.height * ts));
    tc.getContext("2d")!.drawImage(canvas, 0, 0, tc.width, tc.height);
    const thumb = tc.toDataURL("image/jpeg", 0.6);

    toContrastGray(ctx, canvas.width, canvas.height);
    return { canvas, thumb };
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
      <p className="note" style={{ textAlign: "center" }}>
        <b>読み取りの限界:</b> チラシの大きな特価数字は装飾フォントのため、
        現状のOCRではほとんど読み取れません（実測：既知価格19件中3件）。
        小さな通常フォントの文字は読めます。読めなかった分は手入力してください。
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
