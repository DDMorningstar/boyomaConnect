import "server-only";
import sharp from "sharp";

export type ImagePreset = "photo" | "logo" | "avatar";

const PRESETS: Record<ImagePreset, { max: number; quality: number; square: boolean }> = {
  photo: { max: 1600, quality: 80, square: false },
  logo: { max: 512, quality: 85, square: true },
  avatar: { max: 256, quality: 82, square: true },
};

/** Taille maximale acceptée en entrée (le navigateur a déjà réduit l'image). */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export class ImageError extends Error {}

/**
 * Valide et optimise une image envoyée par un utilisateur :
 * décodage réel (refuse les faux fichiers), orientation EXIF appliquée, redimensionnement,
 * réencodage WebP, suppression de toutes les métadonnées (dont la position GPS de la photo).
 */
export async function optimizeImage(file: File, preset: ImagePreset) {
  if (!(file instanceof File) || file.size === 0) throw new ImageError("Aucune image reçue.");
  if (file.size > MAX_UPLOAD_BYTES) throw new ImageError("Image trop lourde (4 Mo maximum).");
  const { max, quality, square } = PRESETS[preset];
  try {
    const input = Buffer.from(await file.arrayBuffer());
    const meta = await sharp(input, { limitInputPixels: 40_000_000 }).metadata();
    if (!meta.format || !["jpeg", "png", "webp", "avif", "heif"].includes(meta.format)) {
      throw new ImageError("Format non pris en charge (JPEG, PNG, WebP).");
    }
    const { data, info } = await sharp(input, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize(
        square
          ? { width: max, height: max, fit: "cover", position: "attention" }
          : { width: max, height: max, fit: "inside", withoutEnlargement: true },
      )
      .webp({ quality, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    return {
      data,
      width: info.width,
      height: info.height,
      bytes: data.length,
      contentType: "image/webp" as const,
    };
  } catch (e) {
    if (e instanceof ImageError) throw e;
    throw new ImageError("Image illisible ou corrompue.");
  }
}
