"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage, inputClass, labelClass } from "@/components/forms/form-message";
import { claimPlace, type ActionState } from "@/features/owner/actions";

export function ClaimForm({ placeId }: { placeId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(claimPlace, null);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="place_id" value={placeId} />
      <div>
        <label htmlFor="claimant_role" className={labelClass}>
          Votre rôle *
        </label>
        <select id="claimant_role" name="claimant_role" required defaultValue="owner" className={inputClass}>
          <option value="owner">Propriétaire</option>
          <option value="manager">Gérant(e)</option>
          <option value="employee">Employé(e) mandaté(e)</option>
          <option value="other">Autre</option>
        </select>
      </div>
      <div>
        <label htmlFor="contact_phone" className={labelClass}>
          Téléphone pour vous joindre *
        </label>
        <input
          id="contact_phone"
          name="contact_phone"
          type="tel"
          inputMode="tel"
          required
          defaultValue="+243 "
          className={inputClass}
        />
        <p className="text-muted mt-1 text-xs">Utilisé uniquement pour vérifier votre demande.</p>
      </div>
      <div>
        <label htmlFor="message" className={labelClass}>
          Message
        </label>
        <textarea
          id="message"
          name="message"
          rows={3}
          maxLength={2000}
          placeholder="Ex. Je suis le gérant depuis 2019 ; vous pouvez passer à l'hôtel pour vérifier."
          className={inputClass}
        />
      </div>
      <FormMessage state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Envoi…" : "Envoyer ma demande"}
      </Button>
    </form>
  );
}
