/**
 * Petite pluie de confettis pour les moments forts (fiche complète, fiche validée, contribution envoyée).
 * Sans dépendance : un canevas temporaire, ~1,5 s, retiré ensuite. Désactivée si l'utilisateur
 * préfère réduire les animations ou si l'économiseur de données est actif.
 */
const COLORS = ["#2563eb", "#38bdf8", "#f59e0b", "#10b981", "#f43f5e", "#a855f7"];

export function celebrate() {
  if (typeof window === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  if (document.documentElement.dataset.saver === "on") return;

  const canvas = document.createElement("canvas");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = `position:fixed;inset:0;width:${w}px;height:${h}px;pointer-events:none;z-index:9999`;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas.remove();
  ctx.scale(dpr, dpr);

  const pieces = Array.from({ length: 90 }, (_, i) => {
    const fromLeft = i % 2 === 0;
    const angle = (fromLeft ? -60 : -120) * (Math.PI / 180) + (Math.random() - 0.5) * 0.7;
    const speed = 9 + Math.random() * 7;
    return {
      x: fromLeft ? 0 : w,
      y: h * 0.75,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 5 + Math.random() * 5,
      rot: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.3,
      color: COLORS[i % COLORS.length]!,
    };
  });

  const start = performance.now();
  const DURATION = 1600;
  const frame = (now: number) => {
    const t = now - start;
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = Math.max(0, 1 - Math.max(0, t - DURATION * 0.6) / (DURATION * 0.4));
    for (const p of pieces) {
      p.vy += 0.35;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.spin;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }
    if (t < DURATION) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}
