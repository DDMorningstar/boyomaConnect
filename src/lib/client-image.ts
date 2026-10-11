"use client";

/**
 * Réduit une image dans le navigateur avant l'envoi (économise les données mobiles).
 * Le serveur revalide et réencode toujours l'image : ceci n'est qu'une optimisation réseau.
 */
export async function shrinkImage(file: File, maxSide: number): Promise<File> {
  if (!file.type.startsWith("image/")) throw new Error("Choisissez une image (JPEG, PNG ou WebP).");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file; // format non décodable par le navigateur (ex. HEIC) : le serveur tranchera
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const toBlob = (type: string) =>
    new Promise<Blob | null>((resolve) =>
      // Un navigateur qui ne sait pas encoder le type demandé renvoie du PNG : on l'écarte.
      canvas.toBlob((b) => resolve(b && b.type === type ? b : null), type, 0.85),
    );
  // WebP si le navigateur sait l'encoder, sinon JPEG.
  const blob = (await toBlob("image/webp")) ?? (await toBlob("image/jpeg"));
  if (!blob || blob.size >= file.size) return file;
  const ext = blob.type === "image/webp" ? "webp" : "jpg";
  return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.${ext}`, { type: blob.type });
}
