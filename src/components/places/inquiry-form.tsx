"use client";
import { useActionState, useId } from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { FormMessage, inputClass, labelClass } from "@/components/forms/form-message";
import { sendInquiry, type InquiryState } from "@/features/places/inquiry-actions";

/**
 * Formulaire « Envoyer un message » : la demande arrive dans la boîte de l'établissement, qui
 * recontacte le visiteur par téléphone, WhatsApp ou e-mail. Ce n'est pas une commande.
 */
export function InquiryForm({
  placeId,
  placeName,
  item,
  onSent,
  compact,
}: {
  placeId: string;
  placeName: string;
  item?: { id: string; name: string };
  onSent?: () => void;
  compact?: boolean;
}) {
  const [state, action, pending] = useActionState<InquiryState, FormData>(async (s, f) => {
    const r = await sendInquiry(s, f);
    if (r?.ok) onSent?.();
    return r;
  }, null);
  const id = useId();

  if (state?.ok) {
    return (
      <div
        role="status"
        className="bg-success/10 text-success flex items-start gap-2 rounded-2xl p-4 text-sm font-medium"
      >
        <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden="true" /> {state.ok}
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="place_id" value={placeId} />
      <input type="hidden" name="item_id" value={item?.id ?? ""} />
      <input type="hidden" name="kind" value={item ? "quote" : "contact"} />
      {/* Champ piège pour les robots (invisible) */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 overflow-hidden">
        <label>
          Site web
          <input name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
      <div className={`grid gap-3 ${compact ? "" : "sm:grid-cols-2"}`}>
        <div>
          <label htmlFor={`${id}-name`} className={labelClass}>
            Votre nom *
          </label>
          <input
            id={`${id}-name`}
            name="name"
            required
            minLength={2}
            maxLength={80}
            autoComplete="name"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor={`${id}-phone`} className={labelClass}>
            Téléphone / WhatsApp
          </label>
          <input
            id={`${id}-phone`}
            name="phone"
            type="tel"
            inputMode="tel"
            maxLength={20}
            autoComplete="tel"
            placeholder="+243…"
            className={inputClass}
          />
        </div>
      </div>
      <div>
        <label htmlFor={`${id}-email`} className={labelClass}>
          E-mail
        </label>
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          maxLength={160}
          autoComplete="email"
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor={`${id}-msg`} className={labelClass}>
          Message *
        </label>
        <textarea
          id={`${id}-msg`}
          name="message"
          required
          minLength={5}
          maxLength={1500}
          rows={compact ? 3 : 4}
          defaultValue={item ? `Bonjour, je suis intéressé(e) par « ${item.name} ». ` : ""}
          className={inputClass}
        />
      </div>
      <p className="text-muted text-xs">
        Indiquez au moins un téléphone ou un e-mail. Vos coordonnées sont transmises uniquement à {placeName}.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="bg-brand hover:bg-brand-strong inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="size-4" aria-hidden="true" />
          )}
          Envoyer le message
        </button>
        <FormMessage state={state?.error ? state : null} />
      </div>
    </form>
  );
}
