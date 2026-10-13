import Image from "next/image";
import { notFound } from "next/navigation";
import { Download, Printer, QrCode } from "lucide-react";
import QRCode from "qrcode";
import { visibleCatalog } from "@/features/catalog/format";
import { getConsolePlace } from "@/features/owner/business";
import { env } from "@/lib/env";
import { ShareBox } from "../fiche/manage-forms";
import { Panel } from "../ui";

type Props = { params: Promise<{ id: string }> };

/** Kit de visibilité : lien, QR code imprimable, visuels pour les statuts WhatsApp. */
export default async function VisibilityPage({ params }: Props) {
  const { id } = await params;
  const place = await getConsolePlace(id);
  if (!place) notFound();
  const published = place.publication_status === "published";
  const link = `${env.NEXT_PUBLIC_SITE_URL}/lieux/${place.slug}`;

  if (!published) {
    return (
      <Panel title="Kit de visibilité">
        <p className="text-muted text-sm">
          Le lien, le QR code et les visuels seront disponibles dès que votre fiche sera publiée.
        </p>
      </Panel>
    );
  }

  const qr = await QRCode.toString(link, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  const qrHref = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr)}`;
  const items = visibleCatalog(place.catalog_items).slice(0, 6);
  const btn =
    "border-line hover:bg-surface-2 inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold";

  return (
    <div className="max-w-3xl space-y-5">
      <ShareBox url={link} name={place.name} />

      <Panel
        title="QR code"
        description="Collez-le sur votre vitrine, votre comptoir ou vos cartes de visite : vos clients retrouvent vos contacts, horaires et catalogue."
      >
        <div className="flex flex-wrap items-center gap-5">
          <div
            className="size-40 shrink-0 rounded-2xl bg-white p-2 [&_svg]:size-full"
            dangerouslySetInnerHTML={{ __html: qr }}
            role="img"
            aria-label={`QR code vers ${link}`}
          />
          <div className="flex flex-col gap-2">
            <a href={`/affiche/${place.slug}`} target="_blank" className={btn}>
              <Printer className="size-4" aria-hidden="true" /> Affiche A5 à imprimer
            </a>
            <a href={qrHref} download={`${place.slug}-qr.svg`} className={btn}>
              <QrCode className="size-4" aria-hidden="true" /> Télécharger le QR (SVG)
            </a>
          </div>
        </div>
      </Panel>

      <Panel
        title="Visuels pour vos statuts WhatsApp"
        description="Images verticales prêtes à publier en statut WhatsApp, story Facebook ou Instagram. Elles se mettent à jour avec votre fiche."
      >
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <StatusCard src={`/api/statut/${place.slug}`} label="Ma fiche" />
          {items.map((i) => (
            <StatusCard key={i.id} src={`/api/statut/${place.slug}?article=${i.id}`} label={i.name} />
          ))}
        </ul>
        {items.length === 0 && (
          <p className="text-muted text-sm">
            Ajoutez des articles à votre catalogue pour obtenir un visuel par article.
          </p>
        )}
      </Panel>
    </div>
  );
}

function StatusCard({ src, label }: { src: string; label: string }) {
  const download = `${src}${src.includes("?") ? "&" : "?"}telecharger=1`;
  return (
    <li className="space-y-2">
      <a
        href={src}
        target="_blank"
        className="bg-surface-2 relative block aspect-[9/16] overflow-hidden rounded-2xl"
      >
        <Image src={src} alt={`Visuel : ${label}`} fill sizes="200px" unoptimized className="object-cover" />
      </a>
      <p className="truncate text-sm font-semibold">{label}</p>
      <a href={download} className="text-brand inline-flex items-center gap-1 text-sm font-semibold">
        <Download className="size-4" aria-hidden="true" /> Télécharger
      </a>
    </li>
  );
}
