/**
 * Image Edit API — edit, remove-bg, expand, upscale, edit-chain, version management
 */
import { apiGet, apiPost, assetUrl } from "./index";

export { assetUrl };

const IMAGE_PREFIX = "/v1/image";
const IMAGE_AI_TIMEOUT_MS = 135_000;

const imageAiRequestOptions = {
  headers: { "X-Request-Timeout-Ms": String(IMAGE_AI_TIMEOUT_MS) },
};

// ── Types ──────────────────────────────────────────────────────────────

export interface ImageEditRequest {
  image_url: string;
  prompt: string;
  mask?: string;
  output_preset?: string;
  resolution?: string;
  size_ratio?: string;
  custom_width?: number;
  custom_height?: number;
  context?: string;
}

export interface ImageEditResponse {
  original_url: string;
  result_url: string;
  version_id: string;
  output_size: string;
  file_size_kb: number;
}

export interface ImageRemoveBgRequest {
  image_url: string;
  prompt?: string;
  bg_color?: string;
  output_preset?: string;
  resolution?: string;
  size_ratio?: string;
}

export interface ImageExpandRequest {
  image_url: string;
  direction?: string;
  expand_ratio?: number;
  prompt?: string;
  output_preset?: string;
  resolution?: string;
  size_ratio?: string;
}

export interface ImageUpscaleRequest {
  image_url: string;
  prompt?: string;
  scale?: number;
  output_preset?: string;
  resolution?: string;
  size_ratio?: string;
}

export interface VersionNode {
  version_id: string;
  description: string;
  file: string;
  url: string;
  prompt: string | null;
  timestamp: string;
  parent_version: string | null;
  output_size: string;
}

export interface VersionListResponse {
  image_id: string;
  versions: VersionNode[];
  current_version: string;
}

// ── Edit Chain (组合操作) Types ─────────────────────────────────────────

export type EditActionType = 'prompt' | 'remove_bg' | 'brush' | 'rect' | 'upscale' | 'expand';

export interface EditAction {
  type: EditActionType;
  prompt?: string;
  mask_data?: string;
  bbox?: { x1: number; y1: number; x2: number; y2: number };
  scale?: number;
  direction?: string;
  expand_ratio?: number;
}

export interface EditChainRequest {
  image_url: string;
  actions: EditAction[];
  output_preset?: string;
  resolution?: string;
  size_ratio?: string;
  custom_width?: number;
  custom_height?: number;
}

export interface EditChainResponse {
  original_url: string;
  result_url: string;
  version_id: string;
  output_size: string;
  file_size_kb: number;
  steps: number;
  final_prompt?: string;
  ai_calls?: number;
}

// ── Output Presets ─────────────────────────────────────────────────────

// ── 分辨率 (Resolution) ──
export const RESOLUTION_PRESETS: Record<
  string,
  { label: string; size: number }
> = {
  '1k': { label: '1K (1000px)', size: 1000 },
  '2k': { label: '2K (2000px)', size: 2000 },
  '4k': { label: '4K (4000px)', size: 4000 },
};

// ── 尺寸比例 (Size Ratio) ──
export const SIZE_RATIOS: Record<
  string,
  { label: string; w: number; h: number }
> = {
  '1:1':  { label: '1:1 正方形',    w: 1, h: 1 },
  '3:4':  { label: '3:4 竖版',      w: 3, h: 4 },
  '4:3':  { label: '4:3 横版',      w: 4, h: 3 },
  '16:9': { label: '16:9 宽屏',     w: 16, h: 9 },
  '9:16': { label: '9:16 竖屏',     w: 9, h: 16 },
  '2:3':  { label: '2:3 竖版',      w: 2, h: 3 },
};

// ── 兼容旧代码的组合预设 ──
export const OUTPUT_PRESETS: Record<
  string,
  { label: string; width: number; height: number; ratio: string }
> = {
  ozon_main:      { label: 'Ozon 主图',      width: 900,  height: 1200, ratio: '3:4' },
  ozon_secondary: { label: 'Ozon 辅图',      width: 900,  height: 1200, ratio: '3:4' },
  ozon_detail_h:  { label: 'Ozon 详情(横)',  width: 1200, height: 900,  ratio: '4:3' },
  ozon_detail_sq: { label: 'Ozon 详情(方)',  width: 1000, height: 1000, ratio: '1:1' },
  ozon_banner:    { label: 'Ozon Banner',    width: 1200, height: 675,  ratio: '16:9' },
  tb_main:        { label: '淘宝主图',       width: 800,  height: 800,  ratio: '1:1' },
  pdd_main:       { label: '拼多多主图',     width: 800,  height: 800,  ratio: '1:1' },
  ali_main:       { label: '1688 主图',      width: 800,  height: 800,  ratio: '1:1' },
};

// ── Image Edit ─────────────────────────────────────────────────────────

/** Unified image editing (natural language + optional mask) */
export async function editImage(params: ImageEditRequest) {
  return apiPost<ImageEditResponse>(`${IMAGE_PREFIX}/edit`, params, imageAiRequestOptions);
}

/** Remove background (white/transparent) */
export async function removeBackground(params: ImageRemoveBgRequest) {
  return apiPost<ImageEditResponse>(`${IMAGE_PREFIX}/remove-bg`, params, imageAiRequestOptions);
}

/** AI expand image edges (outpainting) */
export async function expandImage(params: ImageExpandRequest) {
  return apiPost<ImageEditResponse>(`${IMAGE_PREFIX}/expand`, params, imageAiRequestOptions);
}

/** High-resolution upscale */
export async function upscaleImage(params: ImageUpscaleRequest) {
  return apiPost<ImageEditResponse>(`${IMAGE_PREFIX}/upscale`, params, imageAiRequestOptions);
}

// ── Version Management ─────────────────────────────────────────────────

/** List all versions for an image */
export async function getVersions(imageId: string) {
  return apiGet<VersionListResponse>(`${IMAGE_PREFIX}/versions/${imageId}`);
}

/** Restore to a specific version */
export async function restoreVersion(imageId: string, versionId: string) {
  return apiPost<ImageEditResponse>(
    `${IMAGE_PREFIX}/versions/${imageId}/${versionId}/restore`
  );
}

// ── Edit Chain (组合操作) ───────────────────────────────────────────────

/** Multi-step composite editing — execute a sequence of actions in one request */
export async function editChain(params: EditChainRequest) {
  return apiPost<EditChainResponse>(`${IMAGE_PREFIX}/edit-chain`, params, imageAiRequestOptions);
}
