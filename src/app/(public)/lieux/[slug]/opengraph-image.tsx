import { ImageResponse } from "next/og";
import sharp from "sharp";
import { getShareCardData } from "@/features/places/queries";
import { placeLocation } from "@/features/zones/zones";
import { formatPrice } from "@/lib/format";
import { placeMediaUrl } from "@/lib/supabase/storage";

// Image de partage (WhatsApp, Facebook, X…) : nom, logo, catégorie, téléphone et prix de la fiche.
export const runtime = "nodejs";
export const alt = "Fiche Boyoma Connect";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 3600;

/** Satori ne lit pas le WebP : conversion en JPEG/PNG (data URI). Image absente si indisponible. */
async function toDataUri(url: string | null, width: number, height: number, format: "jpeg" | "png") {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const img = sharp(Buffer.from(await res.arrayBuffer())).resize(width, height, { fit: "cover" });
    const out = format === "jpeg" ? await img.jpeg({ quality: 78 }).toBuffer() : await img.png().toBuffer();
    return `data:image/${format};base64,${out.toString("base64")}`;
  } catch {
    return null;
  }
}

export default async function OgImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await getShareCardData(slug);
  const name = p?.name ?? "Boyoma Connect";
  const coverPath =
    p?.cover_path ??
    p?.place_media.find((m) => m.kind === "cover")?.storage_path ??
    p?.place_media.find((m) => m.kind === "gallery")?.storage_path ??
    null;
  const [cover, logo] = await Promise.all([
    toDataUri(placeMediaUrl(coverPath), 1200, 630, "jpeg"),
    toDataUri(placeMediaUrl(p?.logo_path), 160, 160, "png"),
  ]);
  const phone =
    p?.place_contacts.find((c) => c.kind === "phone" && c.is_primary)?.value ??
    p?.place_contacts.find((c) => c.kind === "phone")?.value;
  const priced = (p?.catalog_items ?? []).filter(
    (i) => i.price != null && (i.currency === "USD" || i.currency === "CDF"),
  );
  const usd = priced.filter((i) => i.currency === "USD").map((i) => Number(i.price));
  const cdf = priced.filter((i) => i.currency === "CDF").map((i) => Number(i.price));
  const from = usd.length
    ? formatPrice(Math.min(...usd), "USD")
    : cdf.length
      ? formatPrice(Math.min(...cdf), "CDF")
      : null;
  const accent = p?.primary_category?.color ?? "#2563EB";
  // Commune (si connue) + ville ou territoire, d'après le rattachement réel du lieu.
  const where = p?.unit ? `${placeLocation(p.unit).replace(", ", " · ")} · Tshopo` : "Tshopo";
  const items = p?.catalog_items.length ?? 0;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        background: "linear-gradient(135deg, #0B1220 0%, #102A5C 55%, #2563EB 100%)",
        color: "white",
        fontFamily: "sans-serif",
      }}
    >
      {cover && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cover}
          alt=""
          width={1200}
          height={630}
          style={{ position: "absolute", inset: 0, objectFit: "cover" }}
        />
      )}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          background: cover
            ? "linear-gradient(90deg, rgba(8,13,25,0.94) 0%, rgba(8,13,25,0.78) 55%, rgba(8,13,25,0.25) 100%)"
            : "transparent",
        }}
      />
      <div
        style={{ position: "relative", display: "flex", flexDirection: "column", padding: 64, width: "100%" }}
      >
        <div style={{ display: "flex", alignItems: "center", fontSize: 28, fontWeight: 700, opacity: 0.9 }}>
          <div style={{ width: 18, height: 18, borderRadius: 9, background: "#38BDF8", marginRight: 12 }} />
          Boyoma Connect
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: "auto" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            {logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logo}
                alt=""
                width={128}
                height={128}
                style={{ borderRadius: 28, marginRight: 32, border: "4px solid rgba(255,255,255,0.85)" }}
              />
            )}
            <div style={{ display: "flex", flexDirection: "column", maxWidth: logo ? 880 : 1050 }}>
              <div style={{ fontSize: name.length > 32 ? 58 : 72, fontWeight: 800, lineHeight: 1.05 }}>
                {name}
              </div>
              <div style={{ display: "flex", fontSize: 30, marginTop: 12, opacity: 0.9 }}>
                <span style={{ color: accent === "#2563EB" ? "#93C5FD" : accent, fontWeight: 700 }}>
                  {p?.primary_category?.name ?? "Lieu"}
                </span>
                <span style={{ margin: "0 14px" }}>·</span>
                <span>{where}</span>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", marginTop: 36, fontSize: 30, fontWeight: 700 }}>
            {phone && (
              <div
                style={{
                  display: "flex",
                  background: "#16A34A",
                  borderRadius: 999,
                  padding: "12px 26px",
                  marginRight: 16,
                }}
              >
                Tél. {phone}
              </div>
            )}
            {from && (
              <div
                style={{
                  display: "flex",
                  background: "white",
                  color: "#0B1220",
                  borderRadius: 999,
                  padding: "12px 26px",
                  marginRight: 16,
                }}
              >
                À partir de {from}
              </div>
            )}
            {!from && items > 0 && (
              <div
                style={{
                  display: "flex",
                  background: "white",
                  color: "#0B1220",
                  borderRadius: 999,
                  padding: "12px 26px",
                  marginRight: 16,
                }}
              >
                Catalogue · {items} article{items > 1 ? "s" : ""}
              </div>
            )}
            {p?.ownership_status === "claimed" && (
              <div
                style={{
                  display: "flex",
                  border: "2px solid rgba(255,255,255,0.7)",
                  borderRadius: 999,
                  padding: "10px 24px",
                }}
              >
                Fiche officielle
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    size,
  );
}
