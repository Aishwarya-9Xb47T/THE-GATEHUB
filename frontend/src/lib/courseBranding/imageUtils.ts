export const BANNER_LIMITS = {
  minWidth: 1280,
  minHeight: 720,
  recommendedWidth: 1920,
  recommendedHeight: 1080,
  maxBytes: 5 * 1024 * 1024,
  aspect: 16 / 9,
} as const;

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface CropRegion {
  /** 0–1 offset from top-left of source image */
  x: number;
  y: number;
  /** 0–1 size of crop window */
  width: number;
  height: number;
}

export function validateBannerFile(file: File): string | null {
  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (!allowed.includes(file.type)) return "Use JPG, PNG, or WEBP";
  if (file.size > BANNER_LIMITS.maxBytes) return "Image must be under 5 MB";
  return null;
}

export function loadImageFromFile(file: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Invalid image"));
    };
    img.src = url;
  });
}

export async function getImageDimensions(file: File): Promise<ImageDimensions> {
  const img = await loadImageFromFile(file);
  return { width: img.width, height: img.height };
}

export function validateDimensions(dim: ImageDimensions): string | null {
  if (dim.width < BANNER_LIMITS.minWidth || dim.height < BANNER_LIMITS.minHeight) {
    return `Minimum size is ${BANNER_LIMITS.minWidth}×${BANNER_LIMITS.minHeight}px`;
  }
  return null;
}

export function defaultCropRegion(imgW: number, imgH: number, aspect = BANNER_LIMITS.aspect): CropRegion {
  const imgAspect = imgW / imgH;
  if (imgAspect > aspect) {
    const w = (imgH * aspect) / imgW;
    return { x: (1 - w) / 2, y: 0, width: w, height: 1 };
  }
  const h = imgW / aspect / imgH;
  return { x: 0, y: (1 - h) / 2, width: 1, height: h };
}

export async function renderCroppedBanner(
  source: File | Blob,
  region: CropRegion,
  outputWidth = BANNER_LIMITS.recommendedWidth
): Promise<{ banner: Blob; thumbnail: Blob }> {
  const img = await loadImageFromFile(source);
  const sx = region.x * img.width;
  const sy = region.y * img.height;
  const sw = region.width * img.width;
  const sh = region.height * img.height;

  const outH = Math.round(outputWidth / BANNER_LIMITS.aspect);

  const bannerCanvas = document.createElement("canvas");
  bannerCanvas.width = outputWidth;
  bannerCanvas.height = outH;
  const bctx = bannerCanvas.getContext("2d")!;
  bctx.drawImage(img, sx, sy, sw, sh, 0, 0, outputWidth, outH);

  const thumbW = 640;
  const thumbH = Math.round(thumbW / BANNER_LIMITS.aspect);
  const thumbCanvas = document.createElement("canvas");
  thumbCanvas.width = thumbW;
  thumbCanvas.height = thumbH;
  const tctx = thumbCanvas.getContext("2d")!;
  tctx.drawImage(bannerCanvas, 0, 0, thumbW, thumbH);

  const banner = await canvasToBlob(bannerCanvas, "image/jpeg", 0.9);
  const thumbnail = await canvasToBlob(thumbCanvas, "image/jpeg", 0.82);
  return { banner, thumbnail };
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Export failed"))), type, quality);
  });
}

/** @deprecated use renderCroppedBanner */
export async function cropImageToBanner(file: File, aspect = BANNER_LIMITS.aspect): Promise<Blob> {
  const dim = await getImageDimensions(file);
  const region = defaultCropRegion(dim.width, dim.height, aspect);
  const { banner } = await renderCroppedBanner(file, region);
  return banner;
}
