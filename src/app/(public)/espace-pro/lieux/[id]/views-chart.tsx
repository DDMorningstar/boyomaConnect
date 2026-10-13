"use client";
import { useState } from "react";
import type { DailyStat } from "@/features/owner/business";

const dayLabel = (iso: string) =>
  new Intl.DateTimeFormat("fr-CD", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${iso}T00:00:00Z`),
  );

/**
 * Vues quotidiennes de la fiche : une seule série (pas de légende, le titre la nomme), barres fines
 * ancrées à la ligne de base, survol = info-bulle avec les contacts du jour, table accessible.
 */
export function ViewsChart({ series }: { series: DailyStat[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...series.map((d) => d.views));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] ?? max;
  const W = 640;
  const H = 180;
  const padL = 32;
  const padB = 22;
  const plotW = W - padL;
  const plotH = H - padB - 8;
  const slot = plotW / series.length;
  const barW = Math.max(2, Math.min(18, slot - 2));
  const y = (v: number) => 8 + plotH - (v / top) * plotH;
  const labelEvery = Math.ceil(series.length / 7);
  const h = hover !== null ? series[hover] : undefined;

  return (
    <figure className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label="Vues de la fiche par jour"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W} y1={y(t)} y2={y(t)} className="stroke-line" strokeWidth={1} />
            <text x={padL - 6} y={y(t) + 4} textAnchor="end" className="fill-muted text-[11px] tabular-nums">
              {t}
            </text>
          </g>
        ))}
        {series.map((d, i) => {
          const x = padL + i * slot + (slot - barW) / 2;
          const bh = Math.max(d.views > 0 ? 2 : 0, 8 + plotH - y(d.views));
          return (
            <g key={d.day} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              {/* zone de survol plus large que la barre */}
              <rect x={padL + i * slot} y={0} width={slot} height={H - padB} fill="transparent" />
              {bh > 0 && (
                <path
                  d={roundedTop(x, 8 + plotH - bh, barW, bh, Math.min(4, barW / 2))}
                  className={hover === i ? "fill-brand-strong" : "fill-brand"}
                />
              )}
              {i % labelEvery === 0 && (
                <text x={x + barW / 2} y={H - 6} textAnchor="middle" className="fill-muted text-[11px]">
                  {dayLabel(d.day)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {h && hover !== null && (
        <div
          className="border-line bg-surface pointer-events-none absolute top-0 z-10 rounded-xl border px-3 py-2 text-xs shadow-[var(--shadow-float)]"
          style={{
            left: `${((padL + hover * slot + slot / 2) / W) * 100}%`,
            transform: `translateX(${hover > series.length / 2 ? "-105%" : "5%"})`,
          }}
        >
          <p className="font-semibold">{dayLabel(h.day)}</p>
          <p className="tabular-nums">
            <strong>{h.views}</strong> vue{h.views > 1 ? "s" : ""}
          </p>
          <p className="text-muted tabular-nums">
            {h.calls} appel{h.calls > 1 ? "s" : ""} · {h.whatsapp} WhatsApp · {h.directions} itinéraire
            {h.directions > 1 ? "s" : ""}
          </p>
        </div>
      )}
      <details className="mt-2 text-sm">
        <summary className="text-muted cursor-pointer text-xs">Voir le tableau des données</summary>
        <div className="mt-2 max-h-60 overflow-auto">
          <table className="w-full text-left text-xs tabular-nums">
            <thead className="text-muted">
              <tr>
                <th className="py-1 font-medium">Jour</th>
                <th className="font-medium">Vues</th>
                <th className="font-medium">Appels</th>
                <th className="font-medium">WhatsApp</th>
                <th className="font-medium">Itinéraires</th>
              </tr>
            </thead>
            <tbody>
              {series.map((d) => (
                <tr key={d.day} className="border-line border-t">
                  <td className="py-1">{dayLabel(d.day)}</td>
                  <td>{d.views}</td>
                  <td>{d.calls}</td>
                  <td>{d.whatsapp}</td>
                  <td>{d.directions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

function niceTicks(max: number) {
  const step =
    max <= 4
      ? 1
      : max <= 10
        ? 2
        : Math.pow(10, Math.floor(Math.log10(max / 2))) *
          (max / Math.pow(10, Math.floor(Math.log10(max))) > 5 ? 2 : 1);
  const s = Math.max(1, Math.ceil(max / 4 / step) * step);
  return [0, s, 2 * s, 3 * s, 4 * s].filter((t, i, a) => i === 0 || a[i - 1]! < max);
}

/** Barre à coins supérieurs arrondis, base droite sur la ligne de base. */
function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}
