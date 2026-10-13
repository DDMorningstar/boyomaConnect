import { ImageResponse } from "next/og";
import QRCode from "qrcode";
import { catalogPrice, visibleCatalog } from "@/features/catalog/format";
import { getStatusCardData } from "@/features/places/queries";
import { placeLocation } from "@/features/zones/zones";
import { env } from "@/lib/env";
import { toDataUri } from "@/lib/og-image";
import { placeMediaUrl } from "@/lib/supabase/storage";

/**
 * Visuel vertical 1080×1920 pour les statuts WhatsApp / stories (décision D32) : la fiche, ou un
 * article du catalogue (?article=<id>). Uniquement des données publiques d'un lieu publié.
 */
export const runtime = "nodejs";
export const revalidate = 600;

const W = 1080;
const H = 1920;

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = new URL(req.url);
  const p = await getStatusCardData(slug);
  if (!p) return new Response("Fiche introuvable", { status: 404 });

  const articleId = url.searchParams.get("article");
  const item = articleId ? visibleCatalog(p.catalog_items).find((i) => i.id === articleId) : undefined;
  if (articleId && !item) return new Response("Article introuvable", { status: 404 });

  const link = `${env.NEXT_PUBLIC_SITE_URL}/lieux/${p.slug}${item ? `#article-${item.id}` : ""}`;
  const coverPath =
    (item ? item.photo_paths[0] : null) ??
    p.cover_path ??
    p.place_media.find((m) => m.kind === "cover")?.storage_path ??
    p.place_media.find((m) => m.kind === "gallery")?.storage_path ??
    null;
  const [cover, logo, qrSvg] = await Promise.all([
    toDataUri(placeMediaUrl(coverPath), W, item ? 1080 : 1000, "jpeg"),
    toDataUri(placeMediaUrl(p.logo_path), 200, 200, "png"),
    QRCode.toString(link, {
      type: "svg",
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#0B1220", light: "#FFFFFF" },
    }),
  ]);
  const qr = `data:image/svg+xml;base64,${Buffer.from(qrSvg).toString("base64")}`;
  const phone =
    p.place_contacts.find((c) => c.kind === "phone" && c.is_primary)?.value ??
    p.place_contacts.find((c) => c.kind === "phone")?.value;
  const whatsapp = p.place_contacts.find((c) => c.kind === "whatsapp")?.value;
  const where = p.unit ? placeLocation(p.unit) : "Tshopo";
  const price = item ? catalogPrice(item) : null;
  const title = item ? item.name : p.name;
  const photoH = item ? 1080 : 1000;

  const res = new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "linear-gradient(180deg, #0B1220 0%, #0B1220 55%, #102A5C 78%, #1D4ED8 100%)",
        color: "white",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ position: "relative", display: "flex", width: W, height: photoH }}>
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" width={W} height={photoH} style={{ objectFit: "cover" }} />
        ) : (
          <div
            style={{
              display: "flex",
              width: W,
              height: photoH,
              background: "linear-gradient(135deg, #1D4ED8, #06B6D4)",
            }}
          />
        )}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            background:
              "linear-gradient(180deg, rgba(11,18,32,0.55) 0%, rgba(11,18,32,0) 25%, rgba(11,18,32,0) 70%, #0B1220 100%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 64,
            left: 64,
            display: "flex",
            alignItems: "center",
            fontSize: 36,
            fontWeight: 700,
          }}
        >
          <div style={{ width: 22, height: 22, borderRadius: 11, background: "#38BDF8", marginRight: 14 }} />
          Boyoma Connect
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          padding: "0 72px",
          marginTop: 56,
          flex: 1,
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          {logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logo}
              alt=""
              width={item ? 96 : 140}
              height={item ? 96 : 140}
              style={{ borderRadius: 32, marginRight: 28, border: "5px solid white" }}
            />
          )}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: item ? 36 : 34, opacity: 0.85, fontWeight: 600 }}>
              {item ? p.name : (p.primary_category?.name ?? "Établissement")}
            </div>
            <div style={{ fontSize: 30, opacity: 0.7 }}>{where}</div>
          </div>
        </div>
        <div
          style={{ fontSize: title.length > 40 ? 72 : 92, fontWeight: 800, lineHeight: 1.05, marginTop: 36 }}
        >
          {title}
        </div>
        {price && (
          <div
            style={{
              display: "flex",
              alignSelf: "flex-start",
              marginTop: 32,
              background: "white",
              color: "#0B1220",
              borderRadius: 999,
              padding: "16px 36px",
              fontSize: 48,
              fontWeight: 800,
            }}
          >
            {price}
          </div>
        )}
        <div
          style={{ display: "flex", flexDirection: "column", marginTop: 36, fontSize: 38, fontWeight: 700 }}
        >
          {whatsapp && <div style={{ display: "flex", marginBottom: 12 }}>WhatsApp · {whatsapp}</div>}
          {phone && phone !== whatsapp && <div style={{ display: "flex" }}>Tél. · {phone}</div>}
        </div>

        <div style={{ display: "flex", alignItems: "center", marginTop: "auto", marginBottom: 80 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qr}
            alt=""
            width={200}
            height={200}
            style={{ borderRadius: 24, background: "white", padding: 10 }}
          />
          <div style={{ display: "flex", flexDirection: "column", marginLeft: 36, maxWidth: 640 }}>
            <div style={{ fontSize: 40, fontWeight: 800 }}>
              {item ? "Voir l'article" : "Contacts, horaires, catalogue"}
            </div>
            <div style={{ fontSize: 30, opacity: 0.8, marginTop: 8 }}>
              {`Scannez ou cherchez « ${p.name.length > 30 ? `${p.name.slice(0, 30)}…` : p.name} » sur Boyoma Connect`}
            </div>
          </div>
        </div>
      </div>
    </div>,
    { width: W, height: H },
  );
  if (url.searchParams.get("telecharger") === "1") {
    const file = `${p.slug}${item ? "-article" : ""}-statut.png`;
    res.headers.set("Content-Disposition", `attachment; filename="${file}"`);
  }
  return res;
}
