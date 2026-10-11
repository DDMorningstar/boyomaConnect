"use client";
import { useEffect, useMemo, useRef, useState } from "react";

export interface Point {
  day: string;
  value: number;
}

const fmtDay = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("fr-FR", { ...opts, timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

/**
 * Courbe d'une série dans le temps : trait 2 px, aire légère, grille discrète, curseur + info-bulle
 * au survol / toucher. Une seule série : pas de légende, le titre la nomme. Tableau des valeurs
 * fourni aux lecteurs d'écran.
 */
export function ActivityChart({ data, label }: { data: Point[]; label: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  const height = 220;
  const pad = { top: 16, right: 12, bottom: 28, left: 36 };

  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver(([e]) => {
      if (e) setWidth(Math.max(280, Math.round(e.contentRect.width)));
    });
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  const { path, area, xs, ys, ticks, max } = useMemo(() => {
    const maxV = Math.max(1, ...data.map((d) => d.value));
    // Graduations « rondes » : 0, ½, max arrondi.
    const step = Math.pow(10, Math.floor(Math.log10(maxV)));
    const niceMax = Math.ceil(maxV / step) * step;
    const iw = width - pad.left - pad.right;
    const ih = height - pad.top - pad.bottom;
    const x = (i: number) => pad.left + (data.length <= 1 ? iw / 2 : (i / (data.length - 1)) * iw);
    const y = (v: number) => pad.top + ih - (v / niceMax) * ih;
    const xsArr = data.map((_, i) => x(i));
    const ysArr = data.map((d) => y(d.value));
    const line = xsArr
      .map((px, i) => `${i ? "L" : "M"}${px.toFixed(1)},${(ysArr[i] ?? 0).toFixed(1)}`)
      .join("");
    const fill = `${line}L${xsArr.at(-1)?.toFixed(1)},${y(0)}L${xsArr[0]?.toFixed(1)},${y(0)}Z`;
    return {
      path: line,
      area: fill,
      xs: xsArr,
      ys: ysArr,
      max: niceMax,
      ticks: [0, niceMax / 2, niceMax].map((v) => ({ v, y: y(v) })),
    };
  }, [data, width, pad.left, pad.right, pad.top, pad.bottom]);

  function onMove(clientX: number) {
    const rect = wrap.current?.getBoundingClientRect();
    if (!rect || !xs.length) return;
    const px = clientX - rect.left;
    let best = 0;
    xs.forEach((x, i) => {
      if (Math.abs(x - px) < Math.abs((xs[best] ?? 0) - px)) best = i;
    });
    setHover(best);
  }

  const hovered = hover != null ? data[hover] : null;
  const labelEvery = Math.ceil(data.length / Math.max(2, Math.floor(width / 90)));

  return (
    <div ref={wrap} className="relative" style={{ ["--c" as string]: "var(--chart-1)" }}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`${label} sur ${data.length} jours`}
        className="block touch-none overflow-visible"
        onPointerMove={(e) => onMove(e.clientX)}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="activity-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--c)" stopOpacity="0.22" />
            <stop offset="1" stopColor="var(--c)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t.v}>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={t.y}
              y2={t.y}
              stroke="var(--line)"
              strokeDasharray="3 4"
            />
            <text
              x={pad.left - 8}
              y={t.y + 4}
              textAnchor="end"
              className="fill-[var(--muted)] text-[11px] tabular-nums"
            >
              {Math.round(t.v).toLocaleString("fr-FR")}
            </text>
          </g>
        ))}
        {data.map((d, i) =>
          i % labelEvery === 0 || i === data.length - 1 ? (
            <text
              key={d.day}
              x={xs[i]}
              y={height - 8}
              textAnchor="middle"
              className="fill-[var(--muted)] text-[11px]"
            >
              {fmtDay(d.day, { day: "numeric", month: "short" })}
            </text>
          ) : null,
        )}
        <path d={area} fill="url(#activity-fill)" className="motion-safe:animate-fade-in" />
        <path
          d={path}
          fill="none"
          stroke="var(--c)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          pathLength={1}
          className="motion-safe:[animation:draw_1.1s_ease-out_both] motion-safe:[stroke-dasharray:1]"
        />
        {hover != null && (
          <g>
            <line
              x1={xs[hover]}
              x2={xs[hover]}
              y1={pad.top}
              y2={height - pad.bottom}
              stroke="var(--muted)"
              strokeOpacity="0.5"
            />
            <circle
              cx={xs[hover]}
              cy={ys[hover]}
              r={5}
              fill="var(--c)"
              stroke="var(--surface)"
              strokeWidth={2}
            />
          </g>
        )}
      </svg>
      {hovered && hover != null && (
        <div
          className="border-line bg-surface pointer-events-none absolute top-2 z-10 rounded-xl border px-3 py-2 text-xs shadow-[var(--shadow-float)]"
          style={{ left: Math.min(Math.max((xs[hover] ?? 0) - 70, 0), width - 150) }}
        >
          <p className="text-muted">
            {fmtDay(hovered.day, { weekday: "long", day: "numeric", month: "long" })}
          </p>
          <p className="mt-0.5 font-semibold">
            <span className="mr-1.5 inline-block size-2 rounded-full bg-[var(--c)] align-middle" />
            {hovered.value.toLocaleString("fr-FR")} {label.toLowerCase()}
          </p>
        </div>
      )}
      <table className="sr-only">
        <caption>
          {label} par jour (échelle max. {max})
        </caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.day}>
              <th scope="row">{d.day}</th>
              <td>{d.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Barres horizontales (une teinte, magnitude) avec valeur écrite : classement lisible sans légende. */
export function BarList({ items }: { items: { label: string; value: number; href?: string }[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-3">
      {items.map((it, i) => (
        <li
          key={it.label}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm"
        >
          <span className="truncate font-medium">
            {it.href ? (
              <a href={it.href} className="hover:text-brand">
                {it.label}
              </a>
            ) : (
              it.label
            )}
          </span>
          <span className="text-muted tabular-nums">{it.value.toLocaleString("fr-FR")}</span>
          <span className="bg-surface-2 col-span-2 h-2 overflow-hidden rounded-full">
            <span
              className="block h-full origin-left rounded-full bg-[var(--chart-1)] motion-safe:animate-[grow_0.8s_ease-out_both]"
              style={{ width: `${(it.value / max) * 100}%`, animationDelay: `${i * 80}ms` }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}
