"use client";

/**
 * Normalise a photo taken with the device camera before it joins the
 * composer's attachment list.
 *
 * A 12 MP phone photo is typically 4–6 MB, while the chat attachment policy
 * allows 20 MB per file and 25 MB per message, and an attachment travels
 * base64 inside a single WebSocket frame. Re-encoding through a canvas keeps
 * uploads small and converts formats the browser can decode into JPEG.
 */

/** Long-edge cap for an incoming photo, in pixels. */
export const PHOTO_MAX_EDGE = 2048;

/** JPEG quality used for the re-encode. */
export const PHOTO_JPEG_QUALITY = 0.85;

/** An already-small JPEG inside the cap is kept as-is (no double encoding). */
const KEEP_ORIGINAL_BYTES = 1024 * 1024;

/** Scale `width`×`height` down to fit `maxEdge`; never scales up. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number = PHOTO_MAX_EDGE,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (!Number.isFinite(longest) || longest <= 0) return { width: 0, height: 0 };
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** `photo-20261108-203015.jpg` — a stable, sortable name for a fresh capture. */
export function photoFilename(date: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `photo-${day}-${time}.jpg`;
}

/**
 * Downscale and re-encode `file` as JPEG. Returns the original file whenever
 * the work cannot be done — an undecodable format or a missing canvas must
 * never block the attachment the user just took.
 */
export async function prepareCapturedPhoto(
  file: File,
  maxEdge: number = PHOTO_MAX_EDGE,
  quality: number = PHOTO_JPEG_QUALITY,
): Promise<File> {
  if (
    file.type &&
    file.type !== "application/octet-stream" &&
    !file.type.startsWith("image/")
  ) {
    return file;
  }

  let url: string | undefined;
  try {
    url = URL.createObjectURL(file);
    const image = new Image();
    image.src = url;
    await image.decode();

    const target = fitWithin(image.naturalWidth, image.naturalHeight, maxEdge);
    if (!target.width || !target.height) return file;

    const alreadySmall =
      target.width === image.naturalWidth &&
      target.height === image.naturalHeight &&
      file.type === "image/jpeg" &&
      file.size <= KEEP_ORIGINAL_BYTES;
    if (alreadySmall) return file;

    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const context = canvas.getContext("2d");
    if (!context) return file;

    // EXIF orientation is applied by the browser when drawing the image, so
    // portrait captures stay upright without manual rotation.
    context.drawImage(image, 0, 0, target.width, target.height);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", quality);
    });
    if (!blob || blob.type !== "image/jpeg") return file;

    return new File([blob], photoFilename(), {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}
