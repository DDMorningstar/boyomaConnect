import { CircleCheck, CircleAlert, CircleX, Gauge } from "lucide-react";
import { Card, CardHeader, EmptyState } from "@/components/admin/ui";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Seuils officiels des Core Web Vitals (75e centile) : [bon jusqu'à, mauvais au-delà]. */
const THRESHOLDS: Record<string, { label: string; good: number; poor: number; unit: "ms" | "" }> = {
  LCP: { label: "Affichage du contenu principal (LCP)", good: 2500, poor: 4000, unit: "ms" },
  INP: { label: "Réactivité aux appuis (INP)", good: 200, poor: 500, unit: "ms" },
  CLS: { label: "Stabilité visuelle (CLS)", good: 0.1, poor: 0.25, unit: "" },
  FCP: { label: "Premier affichage (FCP)", good: 1800, poor: 3000, unit: "ms" },
  TTFB: { label: "Réponse du serveur (TTFB)", good: 800, poor: 1800, unit: "ms" },
};

interface Row {
  metric: string;
  route: string;
  samples: number;
  p75: number;
  good_share: number;
}

const fmt = (metric: string, v: number) =>
  metric === "CLS" ? v.toFixed(2) : v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v)} ms`;

/** Vitesse réelle mesurée chez les visiteurs (7 jours), au 75e centile comme Google. */
export async function VitalsCard() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("web_vitals_summary", { p_days: 7 });
  if (error) return null;
  const rows = (data as Row[] | null) ?? [];
  const global = Object.keys(THRESHOLDS)
    .map((m) => rows.find((r) => r.metric === m && r.route === "Toutes les pages"))
    .filter((r): r is Row => Boolean(r));
  const pages = rows.filter((r) => r.metric === "LCP" && r.route !== "Toutes les pages");

  return (
    <Card className="mt-6">
      <CardHeader title="Vitesse réelle chez les visiteurs — 7 jours" />
      {global.length === 0 ? (
        <EmptyState
          icon={Gauge}
          title="Pas encore de mesure"
          text="Les mesures arrivent au fil des visites (environ 3 visites sur 10, anonymes)."
        />
      ) : (
        <div className="space-y-4 p-5">
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {global.map((r) => {
              const t = THRESHOLDS[r.metric]!;
              const status = r.p75 <= t.good ? "good" : r.p75 > t.poor ? "poor" : "mid";
              const Icon = status === "good" ? CircleCheck : status === "poor" ? CircleX : CircleAlert;
              return (
                <li key={r.metric} className="border-line rounded-2xl border p-4">
                  <p className="text-muted text-xs">{t.label}</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums">{fmt(r.metric, r.p75)}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs">
                    <Icon
                      className={`size-4 ${status === "good" ? "text-success" : status === "poor" ? "text-danger" : "text-warning"}`}
                      aria-hidden="true"
                    />
                    {status === "good" ? "Bon" : status === "poor" ? "Lent" : "À améliorer"} ·{" "}
                    {Math.round(r.good_share * 100)} % de bonnes visites · {r.samples} mesures
                  </p>
                </li>
              );
            })}
          </ul>
          {pages.length > 0 && (
            <table className="w-full text-sm">
              <caption className="text-muted mb-2 text-left text-xs">
                Affichage du contenu principal (LCP, 75e centile) par type de page
              </caption>
              <thead>
                <tr className="text-muted text-left text-xs">
                  <th className="py-1 font-medium">Page</th>
                  <th className="py-1 text-right font-medium">LCP</th>
                  <th className="py-1 text-right font-medium">Mesures</th>
                </tr>
              </thead>
              <tbody>
                {pages.map((r) => (
                  <tr key={r.route} className="border-line border-t">
                    <td className="py-1.5">{r.route}</td>
                    <td className="py-1.5 text-right tabular-nums">{fmt("LCP", r.p75)}</td>
                    <td className="text-muted py-1.5 text-right tabular-nums">{r.samples}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </Card>
  );
}
