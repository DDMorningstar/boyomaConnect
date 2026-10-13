"use client";
import { startTransition, useActionState, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  TriangleAlert,
  WifiOff,
  XCircle,
} from "lucide-react";
import { inputClass, labelClass } from "@/components/forms/form-message";
import {
  refreshMobileMoneyPayment,
  startMobileMoneyPayment,
  type PayState,
  type PaymentView,
} from "@/features/payments/malipo/actions";
import {
  NETWORKS,
  STATUS_LABEL,
  isFailure,
  isInFlight,
  networkLabel,
  type ChargeStatus,
} from "@/features/payments/malipo/status";

const POLL_MS = 3000;
const POLL_LIMIT_MS = 3 * 60 * 1000;

/**
 * Paiement Mobile Money : opérateur choisi par l'utilisateur (jamais déduit du numéro), montant
 * fixé par le serveur, attente avec actualisation sécurisée. Le succès n'est affiché que lorsque
 * le serveur l'a confirmé ; hors ligne, aucun statut n'est supposé.
 */
export function MobileMoneyCheckout({
  placeId,
  plan,
  amountLabel,
  environment,
  initial,
}: {
  placeId: string;
  plan: { key: string; name: string };
  amountLabel: string;
  environment: "sandbox" | "live";
  initial: PaymentView | null;
}) {
  const router = useRouter();
  const [state, start, starting] = useActionState<PayState, FormData>(startMobileMoneyPayment, null);
  const [view, setView] = useState<PaymentView | null>(initial);
  const [network, setNetwork] = useState<string>(initial?.network ?? "");
  const [online, setOnline] = useState(true);
  const [checking, setChecking] = useState(false);
  const [pollStarted, setPollStarted] = useState<number | null>(
    initial && isInFlight(initial.status) ? Date.now() : null,
  );
  const [now, setNow] = useState(() => Date.now());
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const submitted = useRef(false);

  // Résultat de l'initialisation (serveur).
  useEffect(() => {
    if (state?.view) {
      setView(state.view);
      if (isInFlight(state.view.status)) setPollStarted(Date.now());
    }
    submitted.current = false;
  }, [state]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!view || !navigator.onLine) return;
    setChecking(true);
    try {
      const r = await refreshMobileMoneyPayment(view.rowId);
      if (r?.view) {
        setView(r.view);
        setRefreshError(null);
        if (!isInFlight(r.view.status)) router.refresh();
      } else if (r?.error) setRefreshError(r.error);
    } catch {
      setRefreshError("Vérification impossible pour le moment.");
    } finally {
      setChecking(false);
      setNow(Date.now());
    }
  }, [view, router]);

  const inFlight = view ? isInFlight(view.status) : false;
  const polling = inFlight && online && pollStarted !== null && now - pollStarted < POLL_LIMIT_MS;

  useEffect(() => {
    if (!polling) return;
    const t = setTimeout(() => void refresh(), POLL_MS);
    return () => clearTimeout(t);
  }, [polling, refresh, view?.status, now]);

  // ---------------------------------------------------------------- écrans de résultat
  if (view && view.status === "succeeded") {
    return (
      <div role="status" className="bg-success/10 space-y-3 rounded-2xl p-5">
        <p className="text-success flex items-center gap-2 text-lg font-bold">
          <CheckCircle2 className="size-6" aria-hidden="true" /> Paiement confirmé
        </p>
        <p className="text-sm">
          {view.amount} {view.currency} reçus via {networkLabel(view.network)} ({view.phoneMasked}). Votre
          plan {plan.name} est actif.
        </p>
        {view.reference && <p className="text-muted text-xs">Référence Malipo : {view.reference}</p>}
        <Link
          href={`/espace-pro/lieux/${placeId}/abonnement/recu/${view.paymentId}`}
          className="bg-success inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold text-white"
        >
          Voir la preuve de paiement
        </Link>
      </div>
    );
  }

  if (view && inFlight) {
    const stalled = pollStarted !== null && now - pollStarted >= POLL_LIMIT_MS;
    return (
      <div className="border-brand/30 bg-brand/5 space-y-4 rounded-2xl border p-5" aria-live="polite">
        <div className="flex items-start gap-3">
          <span className="bg-brand/10 text-brand grid size-12 shrink-0 place-items-center rounded-2xl">
            <Smartphone className="size-6 motion-safe:animate-pulse" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="font-bold">Validez le paiement sur votre téléphone</p>
            <p className="text-muted text-sm">
              Une demande de {view.amount} {view.currency} a été envoyée au {view.phoneMasked} (
              {networkLabel(view.network)}). Saisissez votre code PIN pour confirmer. Ne fermez pas cette page
              si possible : le résultat sera de toute façon enregistré.
            </p>
          </div>
        </div>
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Loader2 className={`size-4 ${checking || polling ? "animate-spin" : ""}`} aria-hidden="true" />
          {STATUS_LABEL[view.status as ChargeStatus] ?? view.status}
        </p>
        {!online && (
          <p className="text-warning flex items-center gap-2 text-sm">
            <WifiOff className="size-4" aria-hidden="true" /> Hors ligne : impossible de vérifier le statut.
            Aucun paiement n&apos;est considéré comme réussi sans confirmation du serveur.
          </p>
        )}
        {stalled && online && (
          <p className="text-muted text-sm">
            Toujours en attente. Le résultat sera enregistré automatiquement dès que Malipo le confirmera ;
            vous pouvez actualiser à tout moment.
          </p>
        )}
        {refreshError && <p className="text-danger text-sm">{refreshError}</p>}
        <button
          type="button"
          onClick={() => {
            setPollStarted(Date.now());
            void refresh();
          }}
          disabled={checking || !online}
          className="border-line bg-surface hover:bg-surface-2 inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold disabled:opacity-50"
        >
          <RefreshCw className="size-4" aria-hidden="true" /> Actualiser le statut
        </button>
      </div>
    );
  }

  // ---------------------------------------------------------------- formulaire (et échec éventuel)
  const failed = view && isFailure(view.status);
  return (
    <div className="space-y-4">
      {failed && (
        <div role="alert" className="bg-danger/10 flex items-start gap-3 rounded-2xl p-4 text-sm">
          <XCircle className="text-danger mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="text-danger font-bold">
              Paiement {STATUS_LABEL[view.status as ChargeStatus]?.toLowerCase() ?? "non abouti"}
            </p>
            <p>{view.message}</p>
            <p className="text-muted mt-1 text-xs">
              Aucun abonnement n&apos;a été activé. Vous pouvez réessayer.
            </p>
          </div>
        </div>
      )}
      {view && view.status === "refunded" && (
        <p className="bg-surface-2 rounded-2xl p-4 text-sm">Ce paiement a été remboursé.</p>
      )}
      <form
        action={(fd) => {
          if (submitted.current) return; // protection double clic
          submitted.current = true;
          startTransition(() => start(fd));
        }}
        className="space-y-4"
      >
        <input type="hidden" name="place_id" value={placeId} />
        <input type="hidden" name="plan" value={plan.key} />
        <fieldset>
          <legend className={labelClass}>Opérateur Mobile Money</legend>
          <div className="grid grid-cols-3 gap-2">
            {NETWORKS.map((n) => (
              <label
                key={n.id}
                className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-2xl border-2 p-3 text-center text-sm font-semibold transition-colors ${
                  network === n.id ? "border-brand bg-brand/5" : "border-line hover:bg-surface-2"
                }`}
              >
                <input
                  type="radio"
                  name="network"
                  value={n.id}
                  required
                  checked={network === n.id}
                  onChange={() => setNetwork(n.id)}
                  className="sr-only"
                />
                <span className="size-3 rounded-full" style={{ background: n.color }} aria-hidden="true" />
                <span className="leading-tight">{n.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor="mm-phone" className={labelClass}>
            Numéro Mobile Money
          </label>
          <div className="flex items-stretch gap-2">
            <span className="border-line bg-surface-2 grid place-items-center rounded-2xl border px-3 text-sm font-semibold">
              +243
            </span>
            <input
              id="mm-phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              required
              placeholder="81 234 5678"
              maxLength={20}
              className={inputClass}
            />
          </div>
          <p className="text-muted mt-1 text-xs">Le numéro doit correspondre à l&apos;opérateur choisi.</p>
        </div>
        <div className="bg-surface-2 space-y-1 rounded-2xl p-4 text-sm">
          <p className="flex justify-between gap-3">
            <span className="text-muted">Plan</span> <strong>{plan.name} — 1 mois</strong>
          </p>
          <p className="flex justify-between gap-3">
            <span className="text-muted">Montant à payer</span>
            <strong className="text-base tabular-nums">{amountLabel}</strong>
          </p>
          <p className="text-muted flex items-center gap-1.5 pt-1 text-xs">
            <ShieldCheck className="size-3.5" aria-hidden="true" /> Montant fixé par Boyoma Connect. Paiement
            traité par Malipo ; activation après confirmation de l&apos;opérateur.
          </p>
        </div>
        {environment === "sandbox" && (
          <p className="text-warning flex items-start gap-2 text-xs font-medium">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> Mode test (Sandbox) :
            aucune somme réelle n&apos;est prélevée.
          </p>
        )}
        {state?.error && (
          <p role="alert" className="text-danger text-sm">
            {state.error}
          </p>
        )}
        <button
          type="submit"
          disabled={starting || !online}
          className="bg-brand hover:bg-brand-strong inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-5 font-semibold text-white disabled:opacity-50 sm:w-auto"
        >
          {starting ? (
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          ) : (
            <Smartphone className="size-5" aria-hidden="true" />
          )}
          {failed ? "Réessayer le paiement" : `Payer ${amountLabel}`}
        </button>
        {!online && <p className="text-muted text-xs">Connexion requise pour payer.</p>}
      </form>
    </div>
  );
}
