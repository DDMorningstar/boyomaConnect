import "server-only";
import sharp from "sharp";

/** Satori ne lit pas le WebP : conversion en JPEG/PNG (data URI). Image absente si indisponible. */
export async function toDataUri(url: string | null, width: number, height: number, format: "jpeg" | "png") {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const img = sharp(Buffer.from(await res.arrayBuffer())).resize(width, height, { fit: "cover" });
    const out = format === "jpeg" ? await img.jpeg({ quality: 80 }).toBuffer() : await img.png().toBuffer();
    return `data:image/${format};base64,${out.toString("base64")}`;
  } catch {
    return null;
  }
}
