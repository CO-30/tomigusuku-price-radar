// ブラウザ内OCR（Tesseract.js, 日本語）。撮影画像→座標付き単語列。
// 初回のみ言語データ(約数MB)をCDNから取得し、以降はブラウザにキャッシュされる。
import { createWorker, type Worker } from "tesseract.js";
import { Word } from "./parse";

let workerPromise: Promise<Worker> | null = null;

function getWorker(onStatus?: (s: string, p: number) => void): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker("jpn", 1, {
      logger: (m: { status: string; progress: number }) => {
        if (onStatus) onStatus(m.status, m.progress);
      },
    });
  }
  return workerPromise;
}

// 画像をOCRして単語列を返す。前処理として長辺2000pxへ拡大する。
export async function recognizeImage(
  source: Blob | HTMLCanvasElement | HTMLImageElement,
  onStatus?: (s: string, p: number) => void,
): Promise<Word[]> {
  const worker = await getWorker(onStatus);
  const { data } = await worker.recognize(source);
  const words: Word[] = [];
  // tesseract.js v5 は data.words に bbox を持つ
  const raw = (data as { words?: Array<{ text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }> }).words || [];
  for (const w of raw) {
    const t = (w.text || "").trim();
    if (!t) continue;
    const b = w.bbox;
    words.push({
      text: t,
      x: b.x0,
      y: b.y0,
      w: Math.max(1, b.x1 - b.x0),
      h: Math.max(1, b.y1 - b.y0),
      conf: w.confidence,
    });
  }
  return words;
}

export async function terminateOcr(): Promise<void> {
  if (workerPromise) {
    const w = await workerPromise;
    await w.terminate();
    workerPromise = null;
  }
}
