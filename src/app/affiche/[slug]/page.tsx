import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { getStatusCardData } from "@/features/places/queries";
import { placeLocation } from "@/features/zones/zones";
import { env } from "@/lib/env";
import { placeMediaUrl } from "@/lib/supabase/storage";
import { VerifiedMark, isBoyomaVerified } from "@/components/places/verification-badge";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Affiche QR", robots: { index: false } };
export const revalidate = 600;

type Props = { params: Promise<{ slug: string }> };

/**
 * Affiche A5 imprimable (vitrine, comptoir, caisse) : QR code vers la fiche publique.
 * Uniquement des informations publiques d'un lieu publié.
 */
export default async function PosterPage({ params }: Props) {
  const { slug } = await params;
  const p = await getStatusCardData(slug);
  if (!p) notFound();
  const link = `${env.NEXT_PUBLIC_SITE_URL}/lieux/${p.slug}`;
  const qr = await QRCode.toString(link, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
  const logo = placeMediaUrl(p.logo_path);
  const phone = p.place_contacts.find((c) => c.kind === "phone")?.value;
  const whatsapp = p.place_contacts.find((c) => c.kind === "whatsapp")?.value;

  return (
    <div className="min-h-dvh bg-slate-100 py-6 print:bg-white print:py-0">
      <style>{`@page { size: A5 portrait; margin: 0; } @media print { html, body { background: white !important; } }`}</style>
      <div className="mx-auto mb-4 flex max-w-[148mm] flex-wrap items-center justify-between gap-3 px-4 print:hidden">
        <Link href={`/lieux/${p.slug}`} className="text-sm font-semibold text-slate-600">
          ← Retour à la fiche
        </Link>
        <PrintButton />
      </div>
      <article className="mx-auto flex h-[210mm] w-[148mm] flex-col items-center bg-white px-[12mm] py-[12mm] text-center text-slate-900 shadow-xl print:shadow-none">
        <p className="flex items-center gap-2 text-sm font-bold tracking-wide text-slate-500 uppercase">
          <span className="size-2.5 rounded-full bg-sky-400" aria-hidden="true" /> Boyoma Connect
        </p>
        {logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" className="mt-[8mm] size-[22mm] rounded-2xl object-cover" />
        )}
        <h1 className="mt-[5mm] text-[26pt] leading-tight font-extrabold">
          {p.name}
          {isBoyomaVerified(p.verification_status) && <VerifiedMark size={34} className="ml-2" />}
        </h1>
        {isBoyomaVerified(p.verification_status) && (
          <p className="mt-1 text-[10pt] font-semibold text-sky-600">
            Établissement vérifié par Boyoma Connect
          </p>
        )}
        <p className="mt-1 text-[12pt] text-slate-600">
          {p.primary_category?.name ?? "Établissement"} · {placeLocation(p.unit)}
        </p>
        <div
          className="mt-[8mm] size-[62mm] rounded-2xl border-[3mm] border-white p-[2mm] shadow-[0_0_0_0.6mm_#0f172a] [&_svg]:size-full"
          dangerouslySetInnerHTML={{ __html: qr }}
          role="img"
          aria-label={`QR code vers ${link}`}
        />
        <p className="mt-[6mm] text-[16pt] font-extrabold">Scannez-moi</p>
        <p className="text-[11pt] text-slate-600">Contacts, horaires, catalogue et itinéraire</p>
        <div className="mt-auto space-y-0.5 text-[11pt] font-semibold">
          {whatsapp && <p>WhatsApp : {whatsapp}</p>}
          {phone && phone !== whatsapp && <p>Tél. : {phone}</p>}
          <p className="text-[9pt] font-normal break-all text-slate-500">
            {link.replace(/^https?:\/\//, "")}
          </p>
        </div>
      </article>
    </div>
  );
}
