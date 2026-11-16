// D13: a foto do pet é reduzida no próprio celular antes de subir. Uma foto de câmera tem 3–5 MB;
// com 512 px no lado maior e JPEG, fica com 30–80 KB, e o servidor aceita até 150 KB.

const MAX_SIDE = 512;
const MAX_BYTES = 140 * 1024;

export async function resizePhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("sem canvas");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  // Baixa a qualidade aos poucos até caber.
  for (const quality of [0.85, 0.75, 0.6, 0.45]) {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (blob && blob.size <= MAX_BYTES) return blob;
  }
  throw new Error("a foto não coube no limite");
}
