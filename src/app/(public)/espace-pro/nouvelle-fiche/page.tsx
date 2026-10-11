import type { Metadata } from "next";
import { requireUser } from "@/features/auth/session";
import { getListingFormOptions } from "@/features/owner/queries";
import { ListingForm } from "./listing-form";

export const metadata: Metadata = { title: "Créer ma fiche", robots: { index: false } };

export default async function NewListingPage() {
  await requireUser("/espace-pro/nouvelle-fiche");
  const options = await getListingFormOptions();
  return (
    <div className="mx-auto max-w-2xl pt-6 pb-4">
      <h1 className="text-2xl font-extrabold tracking-tight">Créer la fiche de mon établissement</h1>
      <p className="text-muted mt-1 mb-6">
        Après validation, vous pourrez gérer vos photos, votre logo et votre catalogue avec vos prix.
      </p>
      <ListingForm options={options} />
    </div>
  );
}
