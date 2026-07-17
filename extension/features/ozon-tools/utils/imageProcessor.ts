/**
 * 图片处理工具（水印、边框、放大、像素干扰、比例）
 * 逻辑参照 ozon-vue AiModifyPicture 改图模板
 */

import { hasExtensionMessaging } from "./runtime";
import { proxyFetchDataUrl } from "./proxyFetch";

/**
 * 将 Ozon 图片域名替换为国内 CDN 域名（仅用于展示/加载，不写回业务数据）
 * ir.ozone.ru / cdn1.ozone.ru -> ir-2.ozonstatic.cn
 * 国外源站在国内较卡，展示与取图时投影到国内镜像加速；非 Ozon 域名原样返回。
 * @param url 原始图片地址
 */
export function convertOzonImagePath(url: string): string {
  if (!url || typeof url !== "string") {
    return url || "";
  }
  const trimmedUrl = url.trim();
  if (!trimmedUrl) {
    return "";
  }
  return trimmedUrl
    .replace(/ir\.ozone\.ru/gi, "ir-2.ozonstatic.cn")
    .replace(/cdn1\.ozone\.ru/gi, "ir-2.ozonstatic.cn");
}

function hexToRgba(hex: string, alpha: number): string {
  if (hex.startsWith("rgba") || hex.startsWith("rgb")) {
    const match = hex.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (match) return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha})`;
    return hex;
  }
  let r = 0, g = 0, b = 0;
  if (hex.length === 4) {
    r = parseInt(hex[1] + hex[1], 16);
    g = parseInt(hex[2] + hex[2], 16);
    b = parseInt(hex[3] + hex[3], 16);
  } else if (hex.length >= 7) {
    r = parseInt(hex.slice(1, 3), 16);
    g = parseInt(hex.slice(3, 5), 16);
    b = parseInt(hex.slice(5, 7), 16);
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function addColoredBorder(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  color: string = "black"
): void {
  const minDimension = Math.min(width, height);
  let borderWidth = Math.round(minDimension * 0.004);
  borderWidth = Math.max(2, Math.min(8, borderWidth));
  const colorMap: Record<string, string> = {
    green: "green",
    yellow: "yellow",
    blue: "blue",
    white: "white",
    red: "red",
  };
  const borderColor = colorMap[color] || "black";
  ctx.fillStyle = borderColor;
  ctx.fillRect(0, 0, width, borderWidth);
  ctx.fillRect(0, height - borderWidth, width, borderWidth);
  ctx.fillRect(0, 0, borderWidth, height);
  ctx.fillRect(width - borderWidth, 0, borderWidth, height);
}

export function addPixelPerturbation(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  ratio: number = 0.01
): void {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const pixelCount = Math.floor(width * height * ratio);
  for (let i = 0; i < pixelCount; i++) {
    const x = Math.floor(Math.random() * width);
    const y = Math.floor(Math.random() * height);
    const index = (y * width + x) * 4;
    const delta = Math.floor(Math.random() * 11) - 5;
    data[index] = Math.min(255, Math.max(0, data[index] + delta));
    data[index + 1] = Math.min(255, Math.max(0, data[index + 1] + delta));
    data[index + 2] = Math.min(255, Math.max(0, data[index + 2] + delta));
  }
  ctx.putImageData(imageData, 0, 0);
}

export interface TextWatermarkOptions {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  fontColor?: string;
  opacity?: number;
  angle?: number;
  fill?: boolean;
  position?: string;
}

export function addTextWatermarkByPosition(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  text: string,
  options: TextWatermarkOptions = {}
): void {
  if (!text) return;
  const {
    fontFamily = "Arial",
    fontSize = 24,
    fontWeight = 400,
    fontColor = "#ffffff",
    opacity = 0.5,
    angle = 0,
    fill = false,
    position = "bottom-right",
  } = options;
  const scaleFactor = Math.min(width, height) / 500;
  const scaledFontSize = Math.max(12, Math.round(fontSize * scaleFactor));
  const colorWithOpacity = hexToRgba(fontColor, opacity);
  ctx.font = `${fontWeight} ${scaledFontSize}px "${fontFamily}"`;
  ctx.fillStyle = colorWithOpacity;
  if (fill) {
    const diagonal = Math.sqrt(width * width + height * height);
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.rotate((angle * Math.PI) / 180);
    const rows = 4, cols = 4;
    const hSpacing = diagonal / (cols + 1), vSpacing = diagonal / (rows + 1);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = -diagonal / 2 + hSpacing * (col + 1);
        const y = -diagonal / 2 + vSpacing * (row + 1);
        ctx.fillText(text, x, y);
      }
    }
    ctx.restore();
    return;
  }
  const padding = 15;
  let x: number, y: number;
  let textAlign: CanvasTextAlign = "left";
  let textBaseline: CanvasTextBaseline = "top";
  const positions: Record<string, [number, number, CanvasTextAlign, CanvasTextBaseline]> = {
    "top-left": [padding, padding, "left", "top"],
    "top-center": [width / 2, padding, "center", "top"],
    "top-right": [width - padding, padding, "right", "top"],
    "middle-left": [padding, height / 2, "left", "middle"],
    "middle-center": [width / 2, height / 2, "center", "middle"],
    "middle-right": [width - padding, height / 2, "right", "middle"],
    "bottom-left": [padding, height - padding, "left", "bottom"],
    "bottom-center": [width / 2, height - padding, "center", "bottom"],
    "bottom-right": [width - padding, height - padding, "right", "bottom"],
  };
  const pos = positions[position] || positions["bottom-right"];
  [x, y, textAlign, textBaseline] = pos;
  ctx.textAlign = textAlign;
  ctx.textBaseline = textBaseline;
  ctx.save();
  if (angle !== 0) {
    ctx.translate(x, y);
    ctx.rotate((angle * Math.PI) / 180);
    ctx.fillText(text, 0, 0);
  } else {
    ctx.fillText(text, x, y);
  }
  ctx.restore();
}

export interface LogoWatermarkOptions {
  scale?: number;
  opacity?: number;
  angle?: number;
  fill?: boolean;
  position?: string;
}

export function addLogoWatermarkByPosition(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  logoUrl: string,
  options: LogoWatermarkOptions = {}
): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const {
        scale = 0.2,
        opacity = 0.5,
        angle = 0,
        fill = false,
        position = "bottom-right",
      } = options;
      const maxDimension = Math.min(width, height) * scale;
      const aspectRatio = img.width / img.height;
      let logoWidth: number, logoHeight: number;
      if (aspectRatio > 1) {
        logoWidth = maxDimension;
        logoHeight = maxDimension / aspectRatio;
      } else {
        logoHeight = maxDimension;
        logoWidth = maxDimension * aspectRatio;
      }
      ctx.save();
      ctx.globalAlpha = opacity;
      if (fill) {
        const diagonal = Math.sqrt(width * width + height * height);
        const tileWidth = Math.max(24, logoWidth);
        const tileHeight = Math.max(24, logoHeight);
        const cols = Math.max(3, Math.ceil(diagonal / (tileWidth * 1.6)));
        const rows = Math.max(3, Math.ceil(diagonal / (tileHeight * 1.8)));
        const hSpacing = diagonal / cols;
        const vSpacing = diagonal / rows;
        ctx.translate(width / 2, height / 2);
        ctx.rotate((angle * Math.PI) / 180);
        for (let row = -1; row <= rows; row++) {
          for (let col = -1; col <= cols; col++) {
            const x = -diagonal / 2 + col * hSpacing;
            const y = -diagonal / 2 + row * vSpacing;
            ctx.drawImage(img, x, y, logoWidth, logoHeight);
          }
        }
        ctx.restore();
        resolve();
        return;
      }
      const padding = 15;
      let x: number, y: number;
      const positions: Record<string, [number, number]> = {
        "top-left": [padding, padding],
        "top-center": [(width - logoWidth) / 2, padding],
        "top-right": [width - logoWidth - padding, padding],
        "middle-left": [padding, (height - logoHeight) / 2],
        "middle-center": [(width - logoWidth) / 2, (height - logoHeight) / 2],
        "middle-right": [width - logoWidth - padding, (height - logoHeight) / 2],
        "bottom-left": [padding, height - logoHeight - padding],
        "bottom-center": [(width - logoWidth) / 2, height - logoHeight - padding],
        "bottom-right": [width - logoWidth - padding, height - logoHeight - padding],
      };
      const pos = positions[position] || positions["bottom-right"];
      [x, y] = pos;
      if (angle !== 0) {
        ctx.translate(x + logoWidth / 2, y + logoHeight / 2);
        ctx.rotate((angle * Math.PI) / 180);
        ctx.drawImage(img, -logoWidth / 2, -logoHeight / 2, logoWidth, logoHeight);
      } else {
        ctx.drawImage(img, x, y, logoWidth, logoHeight);
      }
      ctx.restore();
      resolve();
    };
    img.onerror = () => reject(new Error("Logo图片加载失败"));
    img.src = logoUrl;
  });
}

export function addCustomBorder(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  borderUrl: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve();
    };
    img.onerror = reject;
    img.src = borderUrl;
  });
}

export function processAspectRatio(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  targetWidthRatio: number,
  targetHeightRatio: number
): void {
  const targetRatio = targetWidthRatio / targetHeightRatio;
  const currentRatio = canvas.width / canvas.height;
  const resizedCanvas = document.createElement("canvas");
  const resizedCtx = resizedCanvas.getContext("2d")!;
  let newWidth: number, newHeight: number;
  if (currentRatio > targetRatio) {
    newHeight = canvas.height;
    newWidth = canvas.height * targetRatio;
  } else {
    newWidth = canvas.width;
    newHeight = canvas.width / targetRatio;
  }
  resizedCanvas.width = newWidth;
  resizedCanvas.height = newHeight;
  resizedCtx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, newWidth, newHeight);
  canvas.width = newWidth;
  canvas.height = newHeight;
  ctx.drawImage(resizedCanvas, 0, 0);
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("图片加载失败"));
    img.src = url;
  });
}

export interface ProcessImageOptions {
  enableZoom?: boolean;
  zoomScale?: number;
  enableBorder?: boolean;
  borderColor?: string;
  customBorderUrl?: string | null;
  enableWatermark?: boolean;
  watermarkType?: "text" | "image";
  textWatermark?: string;
  imageWatermarkUrl?: string;
  watermarkOptions?: TextWatermarkOptions & LogoWatermarkOptions;
  enablePixelPerturbation?: boolean;
  enableAspectRatio?: boolean;
  aspectRatioWidth?: number;
  aspectRatioHeight?: number;
}

/**
 * 按选项处理单张图片，返回 data URL（与 ozon-vue 改图模板逻辑一致）
 */
export async function processImageWithOptions(
  imageUrl: string,
  options: ProcessImageOptions = {}
): Promise<string> {
  const {
    enableZoom = false,
    zoomScale = 1.2,
    enableBorder = false,
    borderColor = "black",
    customBorderUrl = null,
    enableWatermark = false,
    watermarkType = "text",
    textWatermark = "",
    imageWatermarkUrl = "",
    watermarkOptions = {},
    enablePixelPerturbation = false,
    enableAspectRatio = false,
    aspectRatioWidth = 1,
    aspectRatioHeight = 1,
  } = options;

  // 重绘/OSS 等跨域图无法直接 canvas 加载；先代理转 data URL，再画布处理（回填仍用外部传入的原始 URL 匹配）
  const sourceDataUrl = await urlToDataUrl(imageUrl);
  const img = await loadImage(sourceDataUrl);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  canvas.width = img.width;
  canvas.height = img.height;
  ctx.drawImage(img, 0, 0);

  if (enableZoom && zoomScale > 1) {
    const newWidth = Math.min(img.width * zoomScale, 2000);
    const newHeight = Math.min(img.height * zoomScale, 2000);
    canvas.width = newWidth;
    canvas.height = newHeight;
    ctx.drawImage(img, 0, 0, newWidth, newHeight);
  }

  if (enableBorder) {
    if (customBorderUrl) {
      await addCustomBorder(ctx, canvas, customBorderUrl);
    } else {
      addColoredBorder(ctx, canvas.width, canvas.height, borderColor);
    }
  }

  if (enableWatermark) {
    if (watermarkType === "text" && textWatermark) {
      addTextWatermarkByPosition(ctx, canvas.width, canvas.height, textWatermark, watermarkOptions as TextWatermarkOptions);
    } else if (watermarkType === "image" && imageWatermarkUrl) {
      await addLogoWatermarkByPosition(ctx, canvas.width, canvas.height, imageWatermarkUrl, watermarkOptions as LogoWatermarkOptions);
    }
  }

  if (enablePixelPerturbation) {
    addPixelPerturbation(ctx, canvas.width, canvas.height);
  }

  if (enableAspectRatio && aspectRatioWidth && aspectRatioHeight) {
    processAspectRatio(canvas, ctx, aspectRatioWidth, aspectRatioHeight);
  }

  let width = canvas.width;
  let height = canvas.height;
  const maxDimension = 1600;
  const minDimension = 50;
  if (width > maxDimension || height > maxDimension) {
    const ratio = Math.min(maxDimension / width, maxDimension / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }
  if (width < minDimension || height < minDimension) {
    const ratio = Math.max(minDimension / width, minDimension / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }
  const outCanvas = document.createElement("canvas");
  outCanvas.width = width;
  outCanvas.height = height;
  const outCtx = outCanvas.getContext("2d")!;
  outCtx.imageSmoothingQuality = "high";
  outCtx.imageSmoothingEnabled = true;
  outCtx.drawImage(canvas, 0, 0, width, height);

  const quality = width * height > 5000000 ? 0.8 : width * height < 500000 ? 0.9 : 0.85;
  try {
    return outCanvas.toDataURL("image/webp", quality);
  } catch {
    return outCanvas.toDataURL("image/jpeg", quality);
  }
}

/** 将 Blob 转为 data URL */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Blob 读取失败"));
    reader.readAsDataURL(blob);
  });
}

/** 通过扩展 background 拉图并转 data URL（绕过 CORS） */
async function fetchImageToDataUrlViaBackground(url: string): Promise<string> {
  return proxyFetchDataUrl(url);
}

/**
 * 将任意图片 URL 转为 data URL，便于后续步骤（AI 模板/翻译）可靠加载，避免跨域或 blob 失效。
 * 对 https 优先走 extension background 拉图（绕过 CORS）。
 */
export async function urlToDataUrl(url: string): Promise<string> {
  if (!url || typeof url !== "string") return url;
  if (url.startsWith("data:")) return url;
  // 仅加速取图：Ozon 国外源投影到国内 CDN，返回的是图片字节，不作为任何回填/匹配 key
  url = convertOzonImagePath(url);

  if (url.startsWith("blob:")) {
    const res = await fetch(url);
    if (!res.ok) throw new Error("图片加载失败");
    const blob = await res.blob();
    return blobToDataUrl(blob);
  }

  if (url.startsWith("http://") || url.startsWith("https://")) {
    try {
      return await fetchImageToDataUrlViaBackground(url);
    } catch {
      // 降级：同源或带 CORS 的仍可在页面内加载
    }
  }

  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const quality = img.width * img.height > 5000000 ? 0.8 : 0.9;
    try {
      return canvas.toDataURL("image/webp", quality);
    } catch {
      return canvas.toDataURL("image/jpeg", quality);
    }
  } catch {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) throw new Error("图片加载失败");
    const blob = await res.blob();
    return blobToDataUrl(blob);
  }
}

/**
 * 将本地上传的 File 转为 data URL，便于后续改图/翻译步骤可靠使用
 */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.readAsDataURL(file);
  });
}
