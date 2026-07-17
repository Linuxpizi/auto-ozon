import { apiService } from './api';

/** 去掉首尾空白与 BOM，避免 devtools/粘贴带入不可见字符导致识别失败 */
function normalizeInlineSourceUrl(raw: string): string {
  return String(raw || '').trim().replace(/^\uFEFF/, '');
}

/**
 * 是否为 data:image/*;...;base64,...（兼容 charset 等中间参数，不依赖严格 MIME 正则）
 */
export function isBase64ImageUrl(url: string): boolean {
  const s = normalizeInlineSourceUrl(url);
  if (!s) return false;
  if (!s.toLowerCase().startsWith('data:image/')) return false;
  return /;base64,/i.test(s);
}

export function isBlobImageUrl(url: string): boolean {
  return normalizeInlineSourceUrl(url).toLowerCase().startsWith('blob:');
}

export function isLocalInlineImageUrl(url: string): boolean {
  return isBase64ImageUrl(url) || isBlobImageUrl(url);
}

export function getImageExtByMime(mime: string): string {
  const type = String(mime || '').toLowerCase();
  if (type.includes('png')) return 'png';
  if (type.includes('webp')) return 'webp';
  if (type.includes('gif')) return 'gif';
  if (type.includes('bmp')) return 'bmp';
  return 'jpg';
}

/**
 * data:/blob: 图片读取后上传 OSS，返回 http(s) URL；已是远程 URL 则原样返回。
 */
export async function ensureHttpImageUrlOnOss(
  rawUrl: string,
  fileName: string,
  cache?: Map<string, string>
): Promise<string> {
  const url = normalizeInlineSourceUrl(rawUrl);
  if (!url) return '';
  if (!isLocalInlineImageUrl(url)) {
    return url;
  }
  if (cache?.has(url)) {
    return cache.get(url) || url;
  }
  const blobResponse = await fetch(url);
  if (!blobResponse.ok) {
    throw new Error(`图片读取失败: ${blobResponse.status}`);
  }
  const blob = await blobResponse.blob();
  const ext = getImageExtByMime(blob.type);
  const name =
    fileName.includes('.') && /\.[a-z0-9]+$/i.test(fileName)
      ? fileName
      : `${fileName}.${ext}`;
  const ossUrl = await apiService.uploadProductImage(blob, name);
  cache?.set(url, ossUrl);
  return ossUrl;
}
