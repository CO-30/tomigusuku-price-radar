// 価格履歴スパークライン。単一系列のためレジェンドなし、現在値のみマーカー。
export function Spark({ points }: { points: [string, number][] }) {
  if (points.length < 2) return null;
  const vals = points.map((p) => p[1]).reverse(); // 古→新
  const w = 260;
  const h = 56;
  const pad = 6;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const x = (i: number) => pad + (i * (w - pad * 2)) / (vals.length - 1);
  const y = (v: number) => h - pad - ((v - min) * (h - pad * 2)) / span;
  const d = vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = vals[vals.length - 1];
  return (
    <svg width={w} height={h} role="img" aria-label={`価格推移 最安${min}円 最高${max}円`}>
      <path d={d} fill="none" stroke="#6b675e" strokeWidth="2" strokeLinecap="round" />
      <circle cx={x(vals.length - 1)} cy={y(last)} r="4" fill="#c8102e" stroke="#faf9f5" strokeWidth="2" />
    </svg>
  );
}
