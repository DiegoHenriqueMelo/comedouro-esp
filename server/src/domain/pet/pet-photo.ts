import { ErroDeDominio } from "../shared/erro-de-dominio.js";

// A foto do pet. O app já reduz para ~512 px antes de enviar (D13); aqui só se confere que é mesmo uma
// imagem de um tipo conhecido, e que não passou do tamanho.

export const PHOTO_MAX_BYTES = 150 * 1024;

export const PHOTO_TYPES = ["image/jpeg", "image/webp", "image/png"] as const;
export type PhotoType = (typeof PHOTO_TYPES)[number];

export type PetPhoto = { contentType: PhotoType; data: Buffer };

export function petPhoto(contentType: string, data: Buffer): PetPhoto {
  const type = PHOTO_TYPES.find((t) => t === contentType);
  if (!type || !looksLike(type, data)) {
    throw new ErroDeDominio(
      "foto_invalida",
      "a foto precisa ser JPEG, WebP ou PNG",
    );
  }
  if (data.length > PHOTO_MAX_BYTES) {
    throw new ErroDeDominio(
      "foto_invalida",
      `a foto passa de ${PHOTO_MAX_BYTES / 1024} KB`,
    );
  }
  return { contentType: type, data };
}

// Os primeiros bytes de cada formato: um arquivo qualquer com o tipo trocado não passa.
function looksLike(type: PhotoType, data: Buffer): boolean {
  if (type === "image/jpeg") {
    return data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  }
  if (type === "image/png") {
    return data
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  return (
    data.subarray(0, 4).toString("latin1") === "RIFF" &&
    data.subarray(8, 12).toString("latin1") === "WEBP"
  );
}
