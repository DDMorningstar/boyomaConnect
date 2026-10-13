import { describe, expect, it } from "vitest";
import { MalipoApiError, MalipoClient, type MalipoCharge } from "@/features/payments/malipo/client";
import { parseMalipoConfig } from "@/features/payments/malipo/config";
import { submitCharge, syncRow, type ChargeRow, type MalipoDb } from "@/features/payments/malipo/service";

/**
 * Intégration RÉELLE avec la Sandbox Malipo (aucun argent réel). Ignoré sauf si :
 *   MALIPO_INTEGRATION=1 et une clé sk_test_ dans MALIPO_API_KEY.
 * La base est simulée en mémoire : on valide le code du module contre l'API réelle.
 */
const cfg = parseMalipoConfig(process.env);
const enabled = process.env.MALIPO_INTEGRATION === "1" && cfg.ready && cfg.mode === "sandbox";

function memoryDb() {
  const log: { kind: string; charge?: MalipoCharge; error?: unknown; source?: string }[] = [];
  const db: MalipoDb = {
    async recordCreation(_id, charge, error) {
      log.push({ kind: "create", charge: charge ?? undefined, error });
      return { result: charge ? "applied" : error ? "error" : "unknown", status: charge?.status };
    },
    async applyState(charge, source) {
      log.push({ kind: "apply", charge, source });
      return { result: "applied", status: charge.status };
    },
    async storeEvent() {
      return { id: 1, duplicate: false, processed: false };
    },
    async finishEvent() {},
    async bindCharge() {
      return false;
    },
    async markSyncError(_id, message) {
      log.push({ kind: "sync_error", error: message });
    },
    async reconcileCandidates() {
      return [];
    },
    async invoiceNumber() {
      return "BC-TEST-SANDBOX";
    },
  };
  return { db, log };
}

function row(over: Partial<ChargeRow>): ChargeRow {
  return {
    id: "row-sandbox",
    payment_id: crypto.randomUUID(),
    invoice_id: crypto.randomUUID(),
    place_id: crypto.randomUUID(),
    environment: "sandbox",
    charge_id: null,
    idempotency_key: crypto.randomUUID(),
    network: "AIRTEL_MONEY",
    phone: "+243812345678",
    phone_masked: "+243 81•••••78",
    amount: "3.00",
    currency: "USD",
    api_amount: "3.00",
    status: "initiating",
    failure_reason: null,
    created_at: new Date().toISOString(),
    last_synced_at: null,
    ...over,
  };
}

describe.skipIf(!enabled)("Sandbox Malipo (intégration réelle)", () => {
  const api = new MalipoClient(cfg.apiKey!, cfg.baseUrl);

  it("création, rejeu idempotent, puis état final lu via l'API avec contrôle des métadonnées", async () => {
    const { db, log } = memoryDb();
    const r = row({});
    await submitCharge({ db, api }, r);
    const created = log.find((l) => l.kind === "create")?.charge;
    expect(created?.id).toMatch(/^ch_/);
    expect(created).toMatchObject({ amount: 3, currency: "USD", metadataPaymentId: r.payment_id });
    expect(["pending", "processing", "succeeded", "failed"]).toContain(created!.status);

    // Rejeu avec la même clé : même transaction (aucun second débit).
    await submitCharge({ db, api }, r);
    const second = log.filter((l) => l.kind === "create")[1]?.charge;
    expect(second?.id).toBe(created!.id);

    // Suivi jusqu'à l'état final (lecture canonique).
    let final: MalipoCharge | undefined;
    for (let i = 0; i < 20; i++) {
      await syncRow({ db, api }, { ...r, charge_id: created!.id, status: "pending" });
      final = log.filter((l) => l.kind === "apply").at(-1)?.charge;
      if (final && !["pending", "processing"].includes(final.status)) break;
      await new Promise((res) => setTimeout(res, 3000));
    }
    expect(["succeeded", "failed", "declined", "expired"]).toContain(final?.status);
    expect(final).toMatchObject({
      id: created!.id,
      amount: 3,
      currency: "USD",
      metadataPaymentId: r.payment_id,
    });
    if (final?.status === "succeeded") expect(final.feeAmount).toBeGreaterThan(0);
    console.log(
      `[sandbox] ${created!.id} → ${final?.status}${final?.failureReason ? ` (${final.failureReason})` : ""} · frais ${final?.feeAmount} · net ${final?.netAmount}`,
    );
  }, 90_000);

  it("numéro refusé par Malipo : tentative close comme refus définitif", async () => {
    const { db, log } = memoryDb();
    await submitCharge({ db, api }, row({ phone: "+2431" }));
    const entry = log.find((l) => l.kind === "create");
    expect(entry?.charge).toBeUndefined();
    expect(entry?.error).toMatchObject({ code: "invalid_phone" });
  }, 30_000);

  it("clé invalide : refus 401 sans divulgation de la clé", async () => {
    const bad = new MalipoClient("sk_test_invalide", cfg.baseUrl);
    const err = await bad.retrieveCharge("ch_inexistant").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MalipoApiError);
    expect((err as MalipoApiError).status).toBe(401);
    expect((err as Error).message).not.toContain(cfg.apiKey!);
  }, 30_000);

  it("transaction inconnue : 404", async () => {
    const err = await api.retrieveCharge("ch_inexistant").catch((e: unknown) => e);
    expect((err as MalipoApiError).status).toBe(404);
  }, 30_000);
});
