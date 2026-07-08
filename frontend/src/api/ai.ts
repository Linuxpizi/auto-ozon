/**
 * AI API — text translation, batch translation, description optimization,
 * image translation, image replace, image generation
 */
import { apiPost } from "./index";

const AI_PREFIX = "/v1/ai";

// ── Text AI ─────────────────────────────────────────────────────────────

/** 单条文本翻译 (中→俄) */
export async function translateText(params: {
  text: string;
  source_lang?: string;
  target_lang?: string;
  context?: string;
  field_type?: string;
}) {
  return apiPost<{
    original: string;
    translated: string;
    raw_output?: string;
  }>(`${AI_PREFIX}/translate`, params);
}

/** 批量文本翻译 */
export async function translateBatch(params: {
  items: { key: string; text?: string; value?: string; field_type?: string }[];
  source_lang?: string;
  target_lang?: string;
  context?: string;
  field_type?: string;
}) {
  const payload = {
    ...params,
    items: params.items.map((item) => ({
      key: item.key,
      text: item.text ?? item.value ?? "",
      field_type: item.field_type ?? params.field_type ?? "attribute",
    })),
  };
  return apiPost<{
    items: { key: string; original: string; translated: string }[];
    raw_output?: string;
  }>(`${AI_PREFIX}/translate-batch`, payload);
}

/** 描述优化 */
export async function optimizeDescription(params: {
  title?: string;
  description?: string;
  attributes?: Record<string, string>;
  field_type?: "title" | "description" | "attribute" | string;
  platform?: string;
  language?: string;
  context?: string;
}) {
  return apiPost<{
    description: string;
    selling_points: string[];
    keywords: string[];
    raw_output?: string;
  }>(`${AI_PREFIX}/optimize-description`, params);
}

// ── Image AI ────────────────────────────────────────────────────────────

/** 图片文字翻译 (中→俄) */
export async function translateImage(params: {
  image_url: string;
  context?: string;
}) {
  return apiPost<{
    original_url: string;
    result_url: string;
    raw_output?: string;
  }>(`${AI_PREFIX}/translate-image`, params);
}

/** 图片主体/背景替换 */
export async function replaceImageSubject(params: {
  image_url: string;
  prompt: string;
  size?: string;
}) {
  return apiPost<{
    original_url: string;
    result_url: string;
    raw_output?: string;
  }>(`${AI_PREFIX}/replace-image-subject`, params);
}

/** AI生成商品图片 */
export async function generateImage(params: {
  title?: string;
  category?: string;
  style?: string;
  count?: number;
  size?: string;
}) {
  return apiPost<{
    images: string[];
    prompt_used?: string;
    raw_output?: string;
  }>(`${AI_PREFIX}/generate-image`, params);
}
