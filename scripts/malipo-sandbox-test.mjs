#!/usr/bin/env node
/**
 * Tests d'intégration Malipo — SANDBOX UNIQUEMENT (décision D33).
 *
 * Usage (la clé n'est jamais affichée) :
 *   node --env-file=.env.local scripts/malipo-sandbox-test.mjs +243XXXXXXXXX [ORANGE_MONEY|VODACOM_MPESA|AIRTEL_MONEY]
 *
 * - Refuse toute clé qui n'est pas sk_test_ (aucun paiement réel possible).
 * - Crée des transactions de test aux montants spéciaux de la documentation (CDF) et suit leur statut
 *   via GET /v1/charges/{id} pendant 60 s au plus.
 * - Vérifie aussi le refus d'une clé invalide et d'un numéro invalide.
 * N'écrit rien dans la base Boyoma : il valide la passerelle elle-même (montants, statuts, erreurs).
 */
import { randomUUID } from "node:crypto";

const BASE = (process.env.MALIPO_API_BASE_URL || "https://api.malipo.dev/v1").replace(/\/$/, "");
const KEY = (process.env.MALIPO_API_KEY || "").trim();
const phone = process.argv[2];
const network = process.argv[3] || "ORANGE_MONEY";

if (!KEY.startsWith("sk_test_")) {
  console.error("Refusé : ce script n'accepte qu'une clé Sandbox (sk_test_…). Aucune requête envoyée.");
  process.exit(2);
}
if (!/^\+243[89]\d{8}$/.test(phone ?? "")) {
  console.error("Indiquez un numéro au format +243XXXXXXXXX (ex. +243812345678).");
  process.exit(2);
}

async function call(method, path, body, key = KEY) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(method === "POST" ? { "Idempotency-Key": randomUUID() } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TERMINAL = new Set(["succeeded", "failed", "declined", "expired", "refunded"]);

const scenarios = [
  [100, "succès simulé (~90 %)"],
  [200, "fonds insuffisants"],
  [300, "refus du client"],
  [400, "délai dépassé"],
  [500, "réseau indisponible"],
  [600, "code PIN invalide"],
];

console.log(`Sandbox Malipo · ${BASE} · ${network} · ${phone.slice(0, 6)}•••••${phone.slice(-2)}\n`);

// 1. Clé invalide
const bad = await call("GET", "/charges/ch_inexistant", null, "sk_test_invalide");
console.log(`Clé invalide → HTTP ${bad.status} ${JSON.stringify(bad.json?.error?.code ?? bad.json)}`);

// 2. Numéro invalide
const badPhone = await call("POST", "/charges", { amount: 100, currency: "CDF", phone: "+24312", network });
console.log(
  `Numéro invalide → HTTP ${badPhone.status} ${JSON.stringify(badPhone.json?.error?.code ?? badPhone.json)}`,
);

// 3. Scénarios de test
for (const [amount, label] of scenarios) {
  const created = await call("POST", "/charges", {
    amount,
    currency: "CDF",
    phone,
    network,
    description: `Test Boyoma Connect ${amount}`,
    metadata: { test: "boyoma", scenario: String(amount) },
  });
  if (created.status >= 400 || !created.json?.id) {
    console.log(
      `${amount} CDF (${label}) → création refusée HTTP ${created.status} ${JSON.stringify(created.json)}`,
    );
    continue;
  }
  const c = created.json;
  console.log(
    `${amount} CDF (${label}) → ${c.id} · statut initial ${c.status} · montant renvoyé ${c.amount} ${c.currency}`,
  );
  let last = c;
  for (let i = 0; i < 20 && !TERMINAL.has(last.status); i++) {
    await sleep(3000);
    const r = await call("GET", `/charges/${encodeURIComponent(c.id)}`);
    if (r.status === 200 && r.json?.status) last = r.json;
  }
  console.log(
    `   → statut final : ${last.status}${last.failure_reason ? ` (${last.failure_reason})` : ""}` +
      `${last.fee_amount != null ? ` · frais ${last.fee_amount}` : ""}${last.net_amount != null ? ` · net ${last.net_amount}` : ""}`,
  );
}

console.log(
  "\nÀ vérifier dans le tableau de bord Malipo (Sandbox > Payments) : la transaction « 100 » doit afficher 1,00 CDF" +
    " si l'API attend la plus petite unité (MALIPO_AMOUNT_UNIT=minor), ou 100 CDF sinon (MALIPO_AMOUNT_UNIT=major).",
);
