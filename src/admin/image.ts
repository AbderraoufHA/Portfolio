/**
 * Client-side image pipeline for the admin.
 * Uploads are resized, converted to WebP and committed as two widths so the public
 * site can emit a real srcset without an image CDN.
 */

export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif'];
export const MAX_INPUT_BYTES = 8 * 1024 * 1024;

export interface WebpVariant {
  width: number;
  height: number;
  blob: Blob;
  base64: string;
}

export interface ProcessedImage {
  variants: WebpVariant[];
  /** Suggested srcset string using the public paths supplied by the caller. */
  aspect: number;
  originalName: string;
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* fall through to <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('The browser could not decode that image.'));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const comma = result.indexOf(',');
      resolve(comma === -1 ? '' : result.slice(comma + 1));
    };
    reader.onerror = () => reject(new Error('Could not read the processed image.'));
    reader.readAsDataURL(blob);
  });
}

async function encode(image: ImageBitmap | HTMLImageElement, width: number, quality: number): Promise<WebpVariant> {
  const sourceWidth = 'width' in image ? image.width : 0;
  const sourceHeight = 'height' in image ? image.height : 0;
  if (!sourceWidth || !sourceHeight) throw new Error('That image has no dimensions.');

  const targetWidth = Math.min(width, sourceWidth);
  const targetHeight = Math.max(1, Math.round((sourceHeight / sourceWidth) * targetWidth));
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable in this browser.');
  context.imageSmoothingQuality = 'high';
  context.drawImage(image as CanvasImageSource, 0, 0, targetWidth, targetHeight);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
  if (!blob) throw new Error('This browser cannot encode WebP. Try Chrome, Edge, Firefox or Safari 16+.');
  return { width: targetWidth, height: targetHeight, blob, base64: await blobToBase64(blob) };
}

/**
 * Produces a large + small WebP pair. `widths` must be ordered large -> small.
 */
export async function processImage(file: File, widths: number[], quality = 0.82): Promise<ProcessedImage> {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    throw new Error(`Unsupported format "${file.type || 'unknown'}". Use PNG, JPEG, WebP, AVIF or GIF.`);
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error(`That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 8 MB.`);
  }
  const image = await loadBitmap(file);
  const variants: WebpVariant[] = [];
  for (const width of widths) {
    variants.push(await encode(image, width, quality));
  }
  const largest = variants[0];
  if (!largest) throw new Error('Image processing produced no output.');
  if ('close' in image && typeof image.close === 'function') image.close();
  return {
    variants,
    aspect: largest.height / largest.width,
    originalName: file.name,
  };
}

export function buildSrcset(variants: Array<{ publicPath: string; width: number }>): string {
  return variants.map((variant) => `${variant.publicPath} ${variant.width}w`).join(', ');
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
