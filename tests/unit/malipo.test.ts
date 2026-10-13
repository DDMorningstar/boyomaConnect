import { describe, expect, it, vi } from "vitest";
import { maskPhone, normalizeCdPhone } from "@/features/payments/malipo/phone";
import { decimalToMinor, formatApiAmount, toApiAmount } from "@/features/payments/malipo/money";
import { signWebhook, verifyWebhookSignature } from "@/features/payments/malipo/signature";
import { parseMalipoConfig } from "@/features/payments/malipo/config";
import {
  MalipoApiError,
  MalipoClient,
  parseCharge,
  type MalipoCharge,
} from "@/features/payments/malipo/client";
import {
  handleWebhook,
  submitCharge,
  syncRow,
  type ChargeRow,
  type Deps,
  type MalipoDb,
} from "@/features/payments/malipo/service";

// Secret factice de test (jamais une vraie valeur).
const SECRET = "a".repeat(64);
const NOW = Date.parse("2026-10-13T12:00:00Z");

describe("numéros congolais", () => {
  it.each([
    ["0812345678", "+243812345678"],
    ["081 234 5678", "+243812345678"],
    ["+243 99-123-4567", "+243991234567"],
    ["243851234567", "+243851234567"],
    ["00243 89 123 4567", "+243891234567"],
    ["812345678", "+243812345678"],
  ])("%s → %s", (input, out) => expect(normalizeCdPhone(input)).toBe(out));

  it.each(["0712345678", "+24381234567", "+2438123456789", "abc", "", "+33612345678"])("refuse %s", (input) =>
    expect(normalizeCdPhone(input)).toBeNull(),
  );

  it("masque le numéro", () => expect(maskPhone("+243812345678")).toBe("+243 81•••••78"));
});

describe("montants (sans virgule flottante)", () => {
  it("convertit en plus petite unité", () => {
    expect(decimalToMinor("3.00")).toBe(300n);
    expect(decimalToMinor("10")).toBe(1000n);
    expect(decimalToMinor("0.1")).toBe(10n);
    expect(decimalToMinor(25)).toBe(2500n);
    expect(toApiAmount("10.00", "minor")).toBe(1000n);
    expect(toApiAmount("10.00", "major")).toBe(10n);
  });
  it("refuse les formats ambigus", () => {
    expect(() => decimalToMinor("3.001")).toThrow();
    expect(() => decimalToMinor("-3")).toThrow();
    expect(() => decimalToMinor("3,5")).toThrow();
    expect(() => toApiAmount("3.50", "major")).toThrow();
  });
  it("affiche un montant API", () => {
    expect(formatApiAmount(1000, "CDF", "minor")).toBe("10,00 CDF");
    expect(formatApiAmount(null, "USD", "minor")).toBe("—");
  });
});

describe("signature des webhooks", () => {
  const body = '{"id":"evt_1","type":"charge.succeeded"}';
  const ts = "2026-10-13T12:00:00Z";
  const sig = signWebhook(body, ts, SECRET);

  it("accepte une signature valide", () => {
    expect(verifyWebhookSignature(body, sig, ts, SECRET, NOW)).toEqual({ ok: true });
    expect(verifyWebhookSignature(body, sig.toUpperCase(), ts, SECRET, NOW).ok).toBe(true);
  });
  it("refuse un corps modifié, un autre secret, une signature tronquée", () => {
    expect(verifyWebhookSignature(body + " ", sig, ts, SECRET, NOW)).toEqual({
      ok: false,
      reason: "bad_signature",
    });
    expect(verifyWebhookSignature(body, sig, ts, "b".repeat(64), NOW).ok).toBe(false);
    expect(verifyWebhookSignature(body, sig.slice(0, 10), ts, SECRET, NOW).ok).toBe(false);
  });
  it("refuse un horodatage modifié, ancien ou futur (> 5 min)", () => {
    expect(verifyWebhookSignature(body, sig, "2026-10-13T12:00:01Z", SECRET, NOW).ok).toBe(false);
    expect(verifyWebhookSignature(body, sig, ts, SECRET, NOW + 5 * 60 * 1000 + 1)).toEqual({
      ok: false,
      reason: "expired",
    });
    expect(verifyWebhookSignature(body, sig, ts, SECRET, NOW - 6 * 60 * 1000)).toEqual({
      ok: false,
      reason: "expired",
    });
    expect(verifyWebhookSignature(body, sig, "pas-une-date", SECRET, NOW)).toEqual({
      ok: false,
      reason: "bad_timestamp",
    });
  });
  it("refuse sans en-têtes ni secret", () => {
    expect(verifyWebhookSignature(body, null, ts, SECRET, NOW)).toEqual({
      ok: false,
      reason: "missing_header",
    });
    expect(verifyWebhookSignature(body, sig, ts, null, NOW)).toEqual({ ok: false, reason: "no_secret" });
  });
});

describe("configuration", () => {
  it("sandbox avec clé de test", () => {
    const c = parseMalipoConfig({
      MALIPO_MODE: "sandbox",
      MALIPO_API_KEY: "sk_test_x",
      MALIPO_WEBHOOK_SECRET: SECRET,
    });
    expect(c.ready).toBe(true);
    expect(c.baseUrl).toBe("https://api.malipo.dev/v1");
    expect(c.webhookSecret).toBe(SECRET);
  });
  it("rejette les incohérences mode / préfixe", () => {
    expect(parseMalipoConfig({ MALIPO_MODE: "sandbox", MALIPO_API_KEY: "sk_live_x" }).ready).toBe(false);
    expect(parseMalipoConfig({ MALIPO_MODE: "live", MALIPO_API_KEY: "sk_test_x" }).ready).toBe(false);
  });
  it("le live exige une confirmation explicite", () => {
    expect(parseMalipoConfig({ MALIPO_MODE: "live", MALIPO_API_KEY: "sk_live_x" }).ready).toBe(false);
    expect(
      parseMalipoConfig({ MALIPO_MODE: "live", MALIPO_API_KEY: "sk_live_x", MALIPO_LIVE_CONFIRMED: "oui" })
        .ready,
    ).toBe(true);
  });
  it("valide l'URL, l'unité et le secret", () => {
    expect(
      parseMalipoConfig({ MALIPO_API_KEY: "sk_test_x", MALIPO_API_BASE_URL: "http://api.malipo.dev/v1" })
        .ready,
    ).toBe(false);
    expect(
      parseMalipoConfig({ MALIPO_API_KEY: "sk_test_x", MALIPO_API_BASE_URL: "https://api.malipo.dev/v1/" })
        .ready,
    ).toBe(false);
    expect(parseMalipoConfig({ MALIPO_API_KEY: "sk_test_x", MALIPO_AMOUNT_UNIT: "cents" }).ready).toBe(false);
    const c = parseMalipoConfig({ MALIPO_API_KEY: "sk_test_x", MALIPO_WEBHOOK_SECRET: "whsec_abc" });
    expect(c.webhookSecret).toBeNull();
    expect(c.webhookReason).toMatch(/64/);
    expect(parseMalipoConfig({}).reason).toMatch(/Clé API/);
  });
  it("ne divulgue pas la clé quand la configuration est invalide", () => {
    expect(parseMalipoConfig({ MALIPO_MODE: "live", MALIPO_API_KEY: "sk_test_secret" }).apiKey).toBeNull();
  });
});

describe("client HTTP", () => {
  it("appelle POST /v1/charges avec Bearer et Idempotency-Key", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        id: "ch_1",
        object: "charge",
        amount: 300,
        currency: "USD",
        status: "pending",
        metadata: { payment_id: "p1" },
      }),
    );
    const client = new MalipoClient(
      "sk_test_fake",
      "https://api.malipo.dev/v1",
      fetchMock as unknown as typeof fetch,
    );
    const charge = await client.createCharge(
      {
        amount: 300,
        currency: "USD",
        phone: "+243812345678",
        network: "ORANGE_MONEY",
        description: "x",
        metadata: {},
      },
      "key-1234567890123456",
    );
    expect(charge).toMatchObject({
      id: "ch_1",
      status: "pending",
      amount: 300,
      currency: "USD",
      metadataPaymentId: "p1",
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.malipo.dev/v1/charges");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk_test_fake");
    expect(headers["Idempotency-Key"]).toBe("key-1234567890123456");
  });
  it("lit GET /v1/charges/{id} et transforme les erreurs", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ error: { code: "invalid_api_key", message: "Clé invalide" } }, { status: 401 }),
    );
    const client = new MalipoClient(
      "sk_test_fake",
      "https://api.malipo.dev/v1",
      fetchMock as unknown as typeof fetch,
    );
    const err = await client.retrieveCharge("ch_1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MalipoApiError);
    expect((err as MalipoApiError).code).toBe("invalid_api_key");
    expect((err as MalipoApiError).isRejection).toBe(true);
    expect(String((err as Error).message)).not.toContain("sk_test_fake");
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(
      "https://api.malipo.dev/v1/charges/ch_1",
    );
  });
  it("un 503 ou 409 n'est pas un refus définitif", () => {
    expect(new MalipoApiError("x", 503, "service_unavailable").isRejection).toBe(false);
    expect(new MalipoApiError("x", 409, null).isRejection).toBe(false);
  });
  it("normalise la charge", () => {
    expect(parseCharge({ id: "ch", status: "SUCCEEDED", amount: "300", currency: "usd" })).toMatchObject({
      status: "succeeded",
      amount: 300,
      currency: "USD",
    });
    expect(parseCharge({ status: "pending" })).toBeNull();
  });
});

// ------------------------------------------------------------------ service (base et API simulées)
function row(over: Partial<ChargeRow> = {}): ChargeRow {
  return {
    id: "row1",
    payment_id: "pay1",
    invoice_id: "inv1",
    place_id: "place1",
    environment: "sandbox",
    charge_id: null,
    idempotency_key: "11111111-1111-4111-8111-111111111111",
    network: "ORANGE_MONEY",
    phone: "+243812345678",
    phone_masked: "+243 81•••••78",
    amount: "3.00",
    currency: "USD",
    api_amount: 300,
    status: "initiating",
    failure_reason: null,
    created_at: new Date(NOW - 1000).toISOString(),
    last_synced_at: null,
    ...over,
  };
}

function fakeDb(over: Partial<MalipoDb> = {}) {
  const events = new Map<string, { id: number; processed: boolean }>();
  const db: MalipoDb & {
    applied: { charge: MalipoCharge; source: string }[];
    finished: [number, string | null][];
  } = {
    applied: [],
    finished: [],
    recordCreation: vi.fn(async (_r, charge, error) => ({
      result: charge ? "applied" : error ? "error" : "unknown",
      status: charge?.status ?? (error ? "error" : "initiating"),
    })),
    async applyState(charge, source) {
      db.applied.push({ charge, source });
      return { result: "applied", status: charge.status };
    },
    async storeEvent(id) {
      const e = events.get(id);
      if (e) return { id: e.id, duplicate: true, processed: e.processed };
      const n = { id: events.size + 1, processed: false };
      events.set(id, n);
      return { id: n.id, duplicate: false, processed: false };
    },
    async finishEvent(id, error) {
      db.finished.push([id, error]);
      for (const e of events.values()) if (e.id === id && !error) e.processed = true;
    },
    bindCharge: vi.fn(async () => true),
    markSyncError: vi.fn(async () => undefined),
    reconcileCandidates: async () => [],
    invoiceNumber: async () => "BC-2026-000001",
    ...over,
  };
  return db;
}

function signed(event: unknown, ts = new Date(NOW).toISOString()) {
  const rawBody = JSON.stringify(event);
  return { rawBody, timestamp: ts, signature: signWebhook(rawBody, ts, SECRET), secret: SECRET };
}

const succeededEvent = {
  id: "evt_1",
  object: "event",
  type: "charge.succeeded",
  created_at: "2026-10-13T12:00:00Z",
  data: {
    object: {
      id: "ch_1",
      object: "charge",
      amount: 300,
      currency: "USD",
      status: "succeeded",
      phone: "+243812345678",
    },
  },
};

describe("webhook", () => {
  it("valide : journalisé puis état canonique lu via l'API", async () => {
    const db = fakeDb();
    const api = {
      createCharge: vi.fn(),
      retrieveCharge: vi.fn(async () => parseCharge(succeededEvent.data.object)!),
    };
    const r = await handleWebhook({ db, api, now: () => NOW }, signed(succeededEvent));
    expect(r.status).toBe(200);
    expect(api.retrieveCharge).toHaveBeenCalledWith("ch_1");
    expect(db.applied[0]).toMatchObject({ source: "api", charge: { status: "succeeded", amount: 300 } });
    expect(db.finished[0]).toEqual([1, null]);
  });

  it("signature invalide : 400, rien n'est stocké", async () => {
    const db = fakeDb();
    const storeSpy = vi.spyOn(db, "storeEvent");
    const input = { ...signed(succeededEvent), signature: "0".repeat(64) };
    const r = await handleWebhook({ db, api: null, now: () => NOW }, input);
    expect(r.status).toBe(400);
    expect(storeSpy).not.toHaveBeenCalled();
    expect(db.applied).toHaveLength(0);
  });

  it("horodatage trop ancien : 400", async () => {
    const db = fakeDb();
    const r = await handleWebhook(
      { db, api: null, now: () => NOW },
      signed(succeededEvent, new Date(NOW - 10 * 60 * 1000).toISOString()),
    );
    expect(r.status).toBe(400);
  });

  it("doublon déjà traité : ignoré", async () => {
    const db = fakeDb();
    const deps: Deps = { db, api: null, now: () => NOW };
    await handleWebhook(deps, signed(succeededEvent));
    const r = await handleWebhook(deps, signed(succeededEvent));
    expect(r.body).toMatchObject({ duplicate: true });
    expect(db.applied).toHaveLength(1);
  });

  it("API indisponible : l'événement signé cohérent est appliqué (source webhook), le masque du numéro est stocké", async () => {
    const db = fakeDb();
    const storeSpy = vi.spyOn(db, "storeEvent");
    const api = {
      createCharge: vi.fn(),
      retrieveCharge: vi.fn(async () => Promise.reject(new Error("timeout"))),
    };
    await handleWebhook({ db, api, now: () => NOW }, signed(succeededEvent));
    expect(db.applied[0]?.source).toBe("webhook");
    const stored = JSON.stringify(storeSpy.mock.calls[0]?.[2]);
    expect(stored).not.toContain("+243812345678");
  });

  it("type et statut divergents sans API : rien n'est appliqué", async () => {
    const db = fakeDb();
    const ev = { ...succeededEvent, data: { object: { ...succeededEvent.data.object, status: "pending" } } };
    const r = await handleWebhook({ db, api: null, now: () => NOW }, signed(ev));
    expect(r.body).toMatchObject({ pending_reconciliation: true });
    expect(db.applied).toHaveLength(0);
  });

  it("transaction inconnue avec nos métadonnées : rattachée puis appliquée", async () => {
    let calls = 0;
    const db = fakeDb({
      async applyState() {
        calls += 1;
        return calls === 1 ? { result: "unknown_charge" } : { result: "applied", status: "succeeded" };
      },
    });
    const ev = {
      ...succeededEvent,
      data: { object: { ...succeededEvent.data.object, metadata: { payment_id: "pay1" } } },
    };
    const r = await handleWebhook({ db, api: null, now: () => NOW }, signed(ev));
    expect(db.bindCharge).toHaveBeenCalledWith("pay1", "ch_1");
    expect(r.body).toMatchObject({ result: "applied" });
  });

  it("succès sans montant : jamais appliqué", async () => {
    const db = fakeDb();
    const ev = { ...succeededEvent, data: { object: { id: "ch_1", status: "succeeded" } } };
    await handleWebhook({ db, api: null, now: () => NOW }, signed(ev));
    expect(db.applied).toHaveLength(0);
  });

  it("événement non lié aux paiements : accusé de réception", async () => {
    const db = fakeDb();
    const r = await handleWebhook(
      { db, api: null, now: () => NOW },
      signed({ id: "evt_9", type: "payout.pending", data: { object: {} } }),
    );
    expect(r.status).toBe(200);
    expect(db.applied).toHaveLength(0);
  });

  it("secret absent : 503 (Malipo réessaiera)", async () => {
    const r = await handleWebhook(
      { db: fakeDb(), api: null, now: () => NOW },
      { ...signed(succeededEvent), secret: null },
    );
    expect(r.status).toBe(503);
  });
});

describe("création et rapprochement", () => {
  it("refus de validation (invalid_phone) : tentative close", async () => {
    const db = fakeDb();
    const api = {
      createCharge: vi.fn(async () => Promise.reject(new MalipoApiError("Numéro", 400, "invalid_phone"))),
      retrieveCharge: vi.fn(),
    };
    await submitCharge({ db, api, now: () => NOW }, row());
    expect(db.recordCreation).toHaveBeenCalledWith("row1", null, {
      code: "invalid_phone",
      message: "Numéro",
    });
  });

  it("délai dépassé : issue inconnue, conservée pour rapprochement", async () => {
    const db = fakeDb();
    const api = {
      createCharge: vi.fn(async () => Promise.reject(new Error("The operation was aborted due to timeout"))),
      retrieveCharge: vi.fn(),
    };
    const r = await submitCharge({ db, api, now: () => NOW }, row());
    expect(r.result).toBe("unknown");
    expect(db.markSyncError).toHaveBeenCalled();
  });

  it("le corps de création reprend le montant serveur et la clé d'idempotence", async () => {
    const db = fakeDb();
    const api = {
      createCharge: vi.fn(async () =>
        parseCharge({ id: "ch_2", status: "pending", amount: 300, currency: "USD" })!,
      ),
      retrieveCharge: vi.fn(),
    };
    await submitCharge({ db, api, now: () => NOW }, row());
    expect(api.createCharge).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 300,
        currency: "USD",
        phone: "+243812345678",
        network: "ORANGE_MONEY",
        metadata: expect.objectContaining({ payment_id: "pay1" }),
      }),
      "11111111-1111-4111-8111-111111111111",
    );
  });

  it("actualisation : lecture canonique de l'API", async () => {
    const db = fakeDb();
    const api = {
      createCharge: vi.fn(),
      retrieveCharge: vi.fn(async () =>
        parseCharge({
          id: "ch_1",
          status: "failed",
          amount: 300,
          currency: "USD",
          failure_reason: "insufficient_funds",
        })!,
      ),
    };
    await syncRow({ db, api, now: () => NOW }, row({ charge_id: "ch_1", status: "pending" }));
    expect(db.applied[0]).toMatchObject({
      source: "api",
      charge: { status: "failed", failureReason: "insufficient_funds" },
    });
  });

  it("sans réponse de Malipo depuis plus d'une heure : tentative close", async () => {
    const db = fakeDb();
    const api = { createCharge: vi.fn(), retrieveCharge: vi.fn() };
    await syncRow(
      { db, api, now: () => NOW },
      row({ created_at: new Date(NOW - 2 * 3600 * 1000).toISOString() }),
    );
    expect(api.createCharge).not.toHaveBeenCalled();
    expect(db.recordCreation).toHaveBeenCalledWith(
      "row1",
      null,
      expect.objectContaining({ code: "no_response" }),
    );
  });

  it("tentative récente jamais transmise : renvoi avec la même clé", async () => {
    const db = fakeDb();
    const api = {
      createCharge: vi.fn(async () =>
        parseCharge({ id: "ch_3", status: "pending", amount: 300, currency: "USD" })!,
      ),
      retrieveCharge: vi.fn(),
    };
    await syncRow(
      { db, api, now: () => NOW },
      row({ created_at: new Date(NOW - 2 * 60 * 1000).toISOString() }),
    );
    expect(api.createCharge).toHaveBeenCalledWith(expect.anything(), "11111111-1111-4111-8111-111111111111");
  });
});
