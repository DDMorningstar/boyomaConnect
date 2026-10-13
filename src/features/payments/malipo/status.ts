/** Libellés et explications (côté client et serveur). */
export const NETWORKS = [
  { id: "VODACOM_MPESA", label: "Vodacom M-Pesa", short: "M-Pesa", color: "#E60000" },
  { id: "ORANGE_MONEY", label: "Orange Money", short: "Orange", color: "#FF7900" },
  { id: "AIRTEL_MONEY", label: "Airtel Money", short: "Airtel", color: "#ED1C24" },
] as const;
export type NetworkId = (typeof NETWORKS)[number]["id"];
export const isNetwork = (v: string): v is NetworkId => NETWORKS.some((n) => n.id === v);
export const networkLabel = (id: string) => NETWORKS.find((n) => n.id === id)?.label ?? id;

export type ChargeStatus =
  | "initiating"
  | "pending"
  | "processing"
  | "succeeded"
  | "failed"
  | "declined"
  | "expired"
  | "refunded"
  | "partially_refunded"
  | "error";

export const CHARGE_STATUSES: ChargeStatus[] = [
  "initiating",
  "pending",
  "processing",
  "succeeded",
  "failed",
  "declined",
  "expired",
  "refunded",
  "partially_refunded",
  "error",
];

export const STATUS_LABEL: Record<ChargeStatus, string> = {
  initiating: "Envoi en cours",
  pending: "En attente de validation",
  processing: "En cours de traitement",
  succeeded: "Réussi",
  failed: "Échoué",
  declined: "Refusé",
  expired: "Expiré",
  refunded: "Remboursé",
  partially_refunded: "Partiellement remboursé",
  error: "Non envoyé",
};

export const isInFlight = (s: string) => s === "initiating" || s === "pending" || s === "processing";
export const isFailure = (s: string) =>
  s === "failed" || s === "declined" || s === "expired" || s === "error";

const REASONS: Record<string, string> = {
  insufficient_funds: "Solde Mobile Money insuffisant. Rechargez votre compte puis réessayez.",
  declined: "La demande a été refusée ou annulée sur le téléphone.",
  timeout: "La demande n'a pas été validée à temps. Réessayez et validez rapidement sur votre téléphone.",
  network_unavailable: "Le réseau Mobile Money est momentanément indisponible. Réessayez plus tard.",
  invalid_pin: "Code PIN incorrect. Réessayez en saisissant le bon code.",
  sim_not_found: "Ce numéro n'est pas enregistré sur le réseau choisi. Vérifiez le numéro et l'opérateur.",
  expired: "La demande a expiré avant d'être validée. Vous pouvez réessayer.",
  invalid_phone: "Numéro de téléphone refusé. Vérifiez le numéro et l'opérateur.",
  invalid_network: "Opérateur non pris en charge.",
  invalid_amount: "Montant refusé par le service de paiement.",
  invalid_currency: "Devise refusée par le service de paiement.",
  invalid_api_key: "Le service de paiement est mal configuré. L'équipe a été informée.",
  authentication_required: "Le service de paiement est mal configuré. L'équipe a été informée.",
  no_response: "Aucune réponse du service de paiement. Aucun débit n'a été confirmé.",
};

/** Explication compréhensible d'un échec (code Malipo ou statut). */
export function failureMessage(status: string, reason: string | null | undefined): string {
  const key = (reason ?? "").trim().toLowerCase();
  if (REASONS[key]) return REASONS[key];
  if (REASONS[status]) return REASONS[status];
  if (status === "failed")
    return "Le paiement a échoué. Aucun abonnement n'a été activé ; vous pouvez réessayer.";
  if (status === "error") return "La demande de paiement n'a pas pu être envoyée. Vous pouvez réessayer.";
  return "Le paiement n'a pas abouti.";
}
