import { parseApiNumber } from "./money";

/**
 * Client HTTP Malipo (documentation « Charges », « Idempotence », « Erreurs ») :
 *  POST /v1/charges (en-tête Idempotency-Key)  ·  GET /v1/charges/{id}
 * Authentification : Authorization: Bearer <clé secrète>. La clé n'est jamais journalisée.
 */
export class MalipoApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
  ) {
    super(message);
    this.name = "MalipoApiError";
  }
  /** Refus définitif de la requête : aucune transaction n'a été créée chez Malipo. */
  get isRejection() {
    return (
      this.status >= 400 &&
      this.status < 500 &&
      this.status !== 408 &&
      this.status !== 409 &&
      this.status !== 429
    );
  }
}

/** Charge normalisée (champs inconnus ignorés, valeurs absentes = null). */
export interface MalipoCharge {
  id: string;
  status: string;
  amount: number | null;
  currency: string | null;
  failureReason: string | null;
  feeAmount: number | null;
  netAmount: number | null;
  metadataPaymentId: string | null;
}

export interface ChargeRequest {
  amount: number;
  currency: "USD" | "CDF";
  phone: string;
  network: string;
  description: string;
  metadata: Record<string, string>;
}

type FetchLike = typeof fetch;

export function parseCharge(json: unknown): MalipoCharge | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : null;
  const status = typeof o.status === "string" ? o.status.toLowerCase() : null;
  if (!id || !status) return null;
  const meta = o.metadata && typeof o.metadata === "object" ? (o.metadata as Record<string, unknown>) : null;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    id,
    status,
    amount: parseApiNumber(o.amount),
    currency: str(o.currency)?.toUpperCase() ?? null,
    failureReason: str(o.failure_reason) ?? str(o.failure_code) ?? null,
    feeAmount: parseApiNumber(o.fee_amount),
    netAmount: parseApiNumber(o.net_amount),
    metadataPaymentId: meta ? str(meta.payment_id) : null,
  };
}

export class MalipoClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly timeoutMs = 20_000,
  ) {}

  private async request(method: "GET" | "POST", path: string, body?: unknown, idempotencyKey?: string) {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: "application/json",
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
      cache: "no-store",
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      const err = (json as { error?: { code?: string; message?: string } } | null)?.error;
      throw new MalipoApiError(
        err?.message?.slice(0, 200) || `HTTP ${res.status}`,
        res.status,
        err?.code ?? null,
      );
    }
    return json;
  }

  async createCharge(params: ChargeRequest, idempotencyKey: string): Promise<MalipoCharge> {
    const json = await this.request("POST", "/charges", params, idempotencyKey);
    const charge = parseCharge(json);
    if (!charge) throw new MalipoApiError("Réponse de création illisible", 502, "invalid_response");
    return charge;
  }

  async retrieveCharge(chargeId: string): Promise<MalipoCharge> {
    const json = await this.request("GET", `/charges/${encodeURIComponent(chargeId)}`);
    const charge = parseCharge(json);
    if (!charge) throw new MalipoApiError("Réponse de lecture illisible", 502, "invalid_response");
    return charge;
  }
}
