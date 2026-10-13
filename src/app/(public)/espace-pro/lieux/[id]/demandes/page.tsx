import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, Check, Inbox, Mail, MessageCircle, Phone } from "lucide-react";
import { getConsolePlace, getInquiries, type Inquiry } from "@/features/owner/business";
import { setInquiryStatus } from "@/features/owner/business-actions";
import { toWhatsAppNumber } from "@/lib/format";
import { ActionButton } from "@/components/forms/action-forms";
import { Empty, Panel, dateTime } from "../ui";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ statut?: string }> };

const FILTERS = [
  { key: "", label: "Toutes" },
  { key: "new", label: "Nouvelles" },
  { key: "answered", label: "Répondues" },
  { key: "closed", label: "Archivées" },
] as const;

const KIND: Record<Inquiry["kind"], string> = {
  contact: "Message",
  quote: "Devis",
  reservation: "Réservation",
};
const STATUS: Record<Inquiry["status"], string> = {
  new: "Nouvelle",
  read: "Lue",
  answered: "Répondue",
  closed: "Archivée",
};

/**
 * Demandes des visiteurs (pas des commandes) : l'établissement répond directement par téléphone,
 * WhatsApp ou e-mail, puis classe la demande.
 */
export default async function InquiriesPage({ params, searchParams }: Props) {
  const { id } = await params;
  const place = await getConsolePlace(id);
  if (!place) notFound();
  const raw = (await searchParams).statut ?? "";
  const filter = FILTERS.some((f) => f.key === raw) ? raw : "";
  const inquiries = await getInquiries(place.id, filter || undefined);
  const base = `/espace-pro/lieux/${place.id}/demandes`;

  return (
    <div className="max-w-3xl space-y-4">
      <Panel
        title="Demandes reçues"
        description="Messages envoyés depuis votre fiche et votre catalogue. Répondez directement au visiteur : aucune commande ni paiement ne passe par Boyoma Connect."
      >
        <nav className="flex flex-wrap gap-1.5" aria-label="Filtrer les demandes">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={f.key ? `${base}?statut=${f.key}` : base}
              aria-current={f.key === filter ? "page" : undefined}
              className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${
                f.key === filter ? "bg-ink text-surface" : "bg-surface-2 text-muted"
              }`}
            >
              {f.label}
            </Link>
          ))}
        </nav>
      </Panel>

      {inquiries.length === 0 ? (
        <Empty icon={<Inbox className="size-6" aria-hidden="true" />}>
          {filter
            ? "Aucune demande dans cette catégorie."
            : "Aucune demande pour l'instant. Partagez votre fiche pour en recevoir !"}
        </Empty>
      ) : (
        <ul className="space-y-3">
          {inquiries.map((q) => (
            <InquiryCard key={q.id} q={q} placeId={place.id} placeName={place.name} />
          ))}
        </ul>
      )}
    </div>
  );
}

function InquiryCard({ q, placeId, placeName }: { q: Inquiry; placeId: string; placeName: string }) {
  const wa = q.sender_phone ? toWhatsAppNumber(q.sender_phone) : null;
  const greeting = `Bonjour ${q.sender_name}, merci pour votre message${q.item ? ` au sujet de « ${q.item.name} »` : ""} à ${placeName}. `;
  const hidden = { place_id: placeId, id: q.id };
  return (
    <li
      id={`demande-${q.id}`}
      className={`bg-surface scroll-mt-24 space-y-3 rounded-[var(--radius-card)] border p-4 shadow-[var(--shadow-card)] ${
        q.status === "new" ? "border-brand/40" : "border-line"
      }`}
    >
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-bold">{q.sender_name}</p>
          <p className="text-muted text-xs">
            {KIND[q.kind]}
            {q.item && <> · {q.item.name}</>} · {dateTime(q.created_at)}
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            q.status === "new" ? "bg-brand text-white" : "bg-surface-2 text-muted"
          }`}
        >
          {STATUS[q.status]}
        </span>
      </div>
      <p className="text-[15px] whitespace-pre-line">{q.message}</p>
      <div className="flex flex-wrap gap-2">
        {q.sender_phone && (
          <a
            href={`tel:${q.sender_phone.replace(/\s/g, "")}`}
            className="border-line hover:bg-surface-2 inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold"
          >
            <Phone className="size-4" aria-hidden="true" /> {q.sender_phone}
          </a>
        )}
        {wa && (
          <a
            href={`https://wa.me/${wa}?text=${encodeURIComponent(greeting)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-[#25D366] px-3.5 text-sm font-semibold text-white"
          >
            <MessageCircle className="size-4" aria-hidden="true" /> Répondre sur WhatsApp
          </a>
        )}
        {q.sender_email && (
          <a
            href={`mailto:${q.sender_email}?subject=${encodeURIComponent(`Votre demande — ${placeName}`)}&body=${encodeURIComponent(greeting)}`}
            className="border-line hover:bg-surface-2 inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold"
          >
            <Mail className="size-4" aria-hidden="true" /> Répondre par e-mail
          </a>
        )}
      </div>
      <div className="border-line flex flex-wrap gap-2 border-t pt-3">
        {q.status !== "answered" && (
          <ActionButton action={setInquiryStatus} hidden={{ ...hidden, decision: "answered" }}>
            <Check className="size-3.5" aria-hidden="true" /> Marquer comme répondue
          </ActionButton>
        )}
        {q.status === "new" && (
          <ActionButton action={setInquiryStatus} hidden={{ ...hidden, decision: "read" }}>
            Marquer comme lue
          </ActionButton>
        )}
        {q.status !== "closed" ? (
          <ActionButton action={setInquiryStatus} hidden={{ ...hidden, decision: "closed" }}>
            <Archive className="size-3.5" aria-hidden="true" /> Archiver
          </ActionButton>
        ) : (
          <ActionButton action={setInquiryStatus} hidden={{ ...hidden, decision: "read" }}>
            Désarchiver
          </ActionButton>
        )}
      </div>
    </li>
  );
}
