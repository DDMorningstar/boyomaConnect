"use client";
import { useReportWebVitals } from "next/web-vitals";
import { VITALS_METRICS, VITALS_SAMPLE_RATE, vitalsRoute } from "@/features/vitals/routes";

// Tirage une fois par chargement : 30 % des visites mesurées, toutes métriques de cette visite.
const sampled = typeof window !== "undefined" && Math.random() < VITALS_SAMPLE_RATE;

type Connection = { effectiveType?: string };

/**
 * Mesure de vitesse réelle (Core Web Vitals) : quelques centaines d'octets envoyés en fin de
 * mesure, anonymes (type de page, qualité de connexion), pour suivre l'expérience sur les
 * téléphones et réseaux réels de Kisangani.
 */
export function WebVitals() {
  useReportWebVitals((m) => {
    if (!sampled || !(VITALS_METRICS as readonly string[]).includes(m.name)) return;
    const route = vitalsRoute(window.location.pathname);
    if (!route) return;
    const connection = (navigator as Navigator & { connection?: Connection }).connection?.effectiveType;
    const body = JSON.stringify({
      metric: m.name,
      value: Math.round(m.name === "CLS" ? m.value * 1000 : m.value),
      rating: m.rating,
      route,
      connection: connection ?? null,
      data_saver: document.documentElement.dataset.saver === "on",
    });
    try {
      if (!navigator.sendBeacon?.("/api/vitals", new Blob([body], { type: "application/json" }))) {
        void fetch("/api/vitals", {
          method: "POST",
          body,
          keepalive: true,
          headers: { "content-type": "application/json" },
        });
      }
    } catch {
      // Mesure facultative : aucune gêne pour le visiteur en cas d'échec.
    }
  });
  return null;
}
