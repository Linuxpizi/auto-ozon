import { readStorageValue } from '../../utils/runtime'
import type { AiAutoSelectDraftItem } from './aiAutoSelect/types'

export const MAX_VARIANT_EXECUTION_COUNT_STORAGE_KEY = 'mjgd_max_variant_execution_count'
export const MAX_VARIANT_EXECUTION_COUNT_OPTIONS = [30, 50, 100] as const
export const DEFAULT_MAX_VARIANT_EXECUTION_COUNT = 30

export function getScopedMaxVariantExecutionCountStorageKey(
  userId?: string | number | null,
): string {
  const normalizedUserId = String(userId ?? '').trim()
  return normalizedUserId
    ? `${MAX_VARIANT_EXECUTION_COUNT_STORAGE_KEY}_${normalizedUserId}`
    : MAX_VARIANT_EXECUTION_COUNT_STORAGE_KEY
}

/**
 * 兼容旧调用。复刻版不再按 BCS 用户隔离设置，变体上限统一存放在本机。
 */
export function setCachedVariantExecutionUserIdFromInfo(info: unknown): void {
  void info
}

/** 兼容旧调用；本地设置不随远端账号退出而清空。 */
export function clearCachedVariantExecutionUserId(): void {
  // no-op
}

/** 返回本机统一的变体数量 storage key。 */
export async function resolveScopedMaxVariantStorageKey(): Promise<string> {
  return MAX_VARIANT_EXECUTION_COUNT_STORAGE_KEY
}

/** 规范化最大执行变体数量
 * @param value 值
 * @returns 规范化最大执行变体数量
 */
export function normalizeMaxVariantExecutionCount(value: string | number | null): number {
  const parsed = Number(value)
  return MAX_VARIANT_EXECUTION_COUNT_OPTIONS.includes(
    parsed as (typeof MAX_VARIANT_EXECUTION_COUNT_OPTIONS)[number],
  )
    ? parsed
    : DEFAULT_MAX_VARIANT_EXECUTION_COUNT
}

/** 获取最大执行变体数量
 * @returns 获取最大执行变体数量
 */
export async function getMaxVariantExecutionCount(): Promise<number> {
  try {
    const scopedKey = await resolveScopedMaxVariantStorageKey()
    const readCount = async (key: string): Promise<string | null> => {
      const raw = await readStorageValue(key)
      if (raw === null || raw === undefined || String(raw).trim() === '') return null
      return String(raw)
    }
    const scopedValue = await readCount(scopedKey)
    const fallbackValue =
      scopedKey !== MAX_VARIANT_EXECUTION_COUNT_STORAGE_KEY
        ? await readCount(MAX_VARIANT_EXECUTION_COUNT_STORAGE_KEY)
        : null
    return normalizeMaxVariantExecutionCount(scopedValue ?? fallbackValue)
  } catch {
    return DEFAULT_MAX_VARIANT_EXECUTION_COUNT
  }
}

/** 获取 SKU 变体数量
 * @param source 源
 * @returns SKU 变体数量
 */
export function getSkuVariantCount(
  source: AiAutoSelectDraftItem | { sku_matrix?: unknown[] } | null | undefined,
): number {
  if (!source) return 0
  const skuMatrix =
    'transformed' in source && source.transformed
      ? source.transformed.sku_matrix
      : (source as { sku_matrix?: unknown[] }).sku_matrix
  return Array.isArray(skuMatrix) ? skuMatrix.length : 0
}

/** 格式化变体数量超过限制消息
 * @param skuCount SKU 变体数量
 * @param maxVariantExecutionCount 最大执行变体数量
 * @returns 格式化变体数量超过限制消息
 */
export function formatVariantLimitExceededMessage(
  skuCount: number,
  maxVariantExecutionCount: number,
): string {
  return `当前商品列表共有 ${skuCount} 个变体，已超过系统设置的最大执行变体数量 ${maxVariantExecutionCount}，暂不允许进行AI帮填`
}

/** 格式化变体数量超过限制消息
 * @param title 标题
 * @param skuCount SKU 变体数量
 * @param maxVariantExecutionCount 最大执行变体数量
 * @returns 格式化变体数量超过限制消息
 */
export function formatVariantLimitExceededMessageForItem(
  title: string,
  skuCount: number,
  maxVariantExecutionCount: number,
): string {
  const base = formatVariantLimitExceededMessage(skuCount, maxVariantExecutionCount)
  const trimmed = title?.trim()
  return trimmed ? `「${trimmed}」${base}` : base
}

/** 判断变体数量是否超过限制
 * @param skuCount SKU 变体数量
 * @param maxVariantExecutionCount 最大执行变体数量
 * @returns 判断变体数量是否超过限制
 */
export function isVariantCountOverLimit(
  skuCount: number,
  maxVariantExecutionCount: number,
): boolean {
  return skuCount > maxVariantExecutionCount
}
