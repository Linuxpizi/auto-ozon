import { showToast } from '../../../utils/toast'
import { readStorageValue, removeStorageKeysByPrefix, removeStorageValue, writeStorageValue } from '../../../utils/runtime'
import {
  DEFAULT_AI_STEP_CONFIG,
  normalizeAiStepConfig,
  normalizeListingPriceAdjustConfig,
  type AiAutoSelectAiStepConfig,
  type ListingPriceAdjustConfig,
} from '../aiAutoSelect/types'
import {
  clearCachedVariantExecutionUserId,
  DEFAULT_MAX_VARIANT_EXECUTION_COUNT,
  MAX_VARIANT_EXECUTION_COUNT_STORAGE_KEY,
  normalizeMaxVariantExecutionCount,
  resolveScopedMaxVariantStorageKey,
} from '../maxVariantExecution'
import {
  type UserSystemSettingsPayload,
} from './types'

/** 本地设置发生重置或持久化后派发，供 KeepAlive 内的 SettingsPage 刷新内存态。 */
export const USER_SYSTEM_SETTINGS_CACHE_EVENT = 'mjgd:user-system-settings-cache-changed'

export type SettingsCacheChangeReason = 'cleared' | 'synced'

export function notifyUserSystemSettingsCacheChanged(detail?: { reason?: SettingsCacheChangeReason }): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(USER_SYSTEM_SETTINGS_CACHE_EVENT, { detail }))
}

const STORAGE_KEYS = {
  categoryPreference: 'mjgd_ai_category_preference',
  deepThink: 'mjgd_ai_deep_think',
  aiStep: 'mjgd_ai_step',
  fullAutoAiStep: 'mjgd_full_auto_ai_step',
  fullAutoMaxVariantExecutionCount: 'mjgd_full_auto_max_variant_execution_count',
  listingPriceAdjust: 'mjgd_listing_price_adjust',
} as const

let syncInFlight: Promise<void> | null = null

/** @deprecated 本地模式不存在远端同步锁，保留空实现兼容旧调用。 */
export function unblockSettingsRemoteSync(): void {
  // no-op
}

/** @deprecated 本地模式始终允许读写设置。 */
export function isSettingsRemoteSyncBlocked(): boolean {
  return false
}

/** 读插件 chrome.storage.local 中的配置项 */
async function readSettingValue(key: string): Promise<string | null> {
  const raw = await readStorageValue(key)
  if (raw === null || raw === undefined || String(raw).trim() === '') return null
  return String(raw)
}

/** 写插件 chrome.storage.local */
async function writeSettingValue(key: string, value: string): Promise<void> {
  await writeStorageValue(key, value)
}

/** 清除历史版本遗留的 scoped 变体数量 key（仅插件 storage）。 */
async function removeAllMaxVariantExecutionCountKeys(): Promise<void> {
  await removeStorageKeysByPrefix(MAX_VARIANT_EXECUTION_COUNT_STORAGE_KEY)
}

/** 用户主动恢复默认设置时清除插件内设置；退出页面不会调用此函数。 */
export async function clearUserSystemSettingsCache(): Promise<void> {
  try {
    await removeStorageValue(STORAGE_KEYS.aiStep)
    await removeStorageValue(STORAGE_KEYS.categoryPreference)
    await removeStorageValue(STORAGE_KEYS.deepThink)
    await removeStorageValue(STORAGE_KEYS.fullAutoAiStep)
    await removeStorageValue(STORAGE_KEYS.fullAutoMaxVariantExecutionCount)
    await removeStorageValue(STORAGE_KEYS.listingPriceAdjust)
    await removeAllMaxVariantExecutionCountKeys()
  } catch {
    // chrome.storage 不可用时忽略
  }
  clearCachedVariantExecutionUserId()
  notifyUserSystemSettingsCacheChanged({ reason: 'cleared' })
}

/** 插件 storage 无主设置项时视为尚未完成本地初始化。 */
export async function isSettingsMissing(): Promise<boolean> {
  const aiStepRaw = await readSettingValue(STORAGE_KEYS.aiStep)
  return aiStepRaw === null
}

/** 从插件 storage 读取全自动独立 AI 流程配置 */
async function readFullAutoAiStepFromStorage(): Promise<AiAutoSelectAiStepConfig> {
  try {
    const raw = await readSettingValue(STORAGE_KEYS.fullAutoAiStep)
    if (raw) return normalizeAiStepConfig(JSON.parse(String(raw)))
  } catch {
    // 解析失败时回落默认
  }
  return { ...DEFAULT_AI_STEP_CONFIG }
}

/** 从插件 storage 读取售价调整；无效或未配置时返回 undefined */
async function readListingPriceAdjustFromStorage(): Promise<ListingPriceAdjustConfig | undefined> {
  try {
    const raw = await readSettingValue(STORAGE_KEYS.listingPriceAdjust)
    if (!raw) return undefined
    return normalizeListingPriceAdjustConfig(JSON.parse(String(raw)) as Partial<ListingPriceAdjustConfig>)
  } catch {
    return undefined
  }
}

/** 从插件 storage 读取系统设置（无缓存时返回内存默认值，不请求接口） */
export async function readSettingsCache(): Promise<UserSystemSettingsPayload> {
  const scopedKey = await resolveScopedMaxVariantStorageKey()
  let aiStep: AiAutoSelectAiStepConfig = { ...DEFAULT_AI_STEP_CONFIG }
  try {
    const aiStepRaw = await readSettingValue(STORAGE_KEYS.aiStep)
    if (aiStepRaw) {
      aiStep = normalizeAiStepConfig(JSON.parse(String(aiStepRaw)))
    }
  } catch {
    aiStep = { ...DEFAULT_AI_STEP_CONFIG }
  }
  const categoryPreference = (await readSettingValue(STORAGE_KEYS.categoryPreference)) ?? 'auto'
  const deepThinkRaw = await readSettingValue(STORAGE_KEYS.deepThink)
  const deepThinkEnabled = deepThinkRaw !== null ? deepThinkRaw === 'true' : false
  const maxVariantCount = (await readSettingValue(scopedKey))
    ?? (scopedKey !== MAX_VARIANT_EXECUTION_COUNT_STORAGE_KEY
      ? await readSettingValue(MAX_VARIANT_EXECUTION_COUNT_STORAGE_KEY)
      : null)
  const fullAutoAiStep = await readFullAutoAiStepFromStorage()
  const fullAutoMaxVariantRaw = await readSettingValue(STORAGE_KEYS.fullAutoMaxVariantExecutionCount)
  const listingPriceAdjust = await readListingPriceAdjustFromStorage()
  return {
    aiStep,
    categoryPreference,
    deepThinkEnabled,
    maxVariantExecutionCount: normalizeMaxVariantExecutionCount(maxVariantCount),
    fullAutoAiStep,
    fullAutoMaxVariantExecutionCount: normalizeMaxVariantExecutionCount(fullAutoMaxVariantRaw),
    ...(listingPriceAdjust ? { listingPriceAdjust } : {}),
  }
}

/** @deprecated 使用 readSettingsCache */
export const readFromLocalStorage = readSettingsCache

/** 写入插件 storage */
export async function applyToPluginStorage(payload: UserSystemSettingsPayload): Promise<void> {
  const scopedKey = await resolveScopedMaxVariantStorageKey()
  const aiStepStr = JSON.stringify(payload.aiStep)
  await writeSettingValue(STORAGE_KEYS.aiStep, aiStepStr)
  await writeSettingValue(STORAGE_KEYS.categoryPreference, payload.categoryPreference)
  await writeSettingValue(STORAGE_KEYS.deepThink, String(payload.deepThinkEnabled))
  await writeSettingValue(scopedKey, String(payload.maxVariantExecutionCount))
  await writeSettingValue(STORAGE_KEYS.fullAutoAiStep, JSON.stringify(payload.fullAutoAiStep))
  await writeSettingValue(
    STORAGE_KEYS.fullAutoMaxVariantExecutionCount,
    String(payload.fullAutoMaxVariantExecutionCount),
  )
  // 售价未配置时清除本地 key，避免旧值残留
  const listingPriceAdjust = normalizeListingPriceAdjustConfig(payload.listingPriceAdjust)
  if (listingPriceAdjust) {
    await writeSettingValue(STORAGE_KEYS.listingPriceAdjust, JSON.stringify(listingPriceAdjust))
  } else {
    await removeStorageValue(STORAGE_KEYS.listingPriceAdjust)
  }
}

/** @deprecated 使用 applyToPluginStorage */
export const applyToLocalStorage = applyToPluginStorage

/** @deprecated 设置已完全本地化；旧名称现在只读取本地缓存。 */
export async function fetchFromServer(): Promise<UserSystemSettingsPayload | null> {
  return (await isSettingsMissing()) ? null : readSettingsCache()
}

/** @deprecated 设置已完全本地化；旧名称现在只写 chrome.storage.local。 */
export async function saveToServer(payload: UserSystemSettingsPayload): Promise<void> {
  await applyToPluginStorage(payload)
}

/** 初始化本地设置。保留旧函数名以兼容已有组件。 */
export async function syncFromServer(): Promise<void> {
  if (!(await isSettingsMissing())) return
  if (syncInFlight) {
    await syncInFlight
    return
  }
  syncInFlight = (async () => {
    try {
      // 为缺失项补默认值，同时保留旧版本已经写入的其他本地设置。
      await applyToPluginStorage(await readSettingsCache())
    } finally {
      syncInFlight = null
      notifyUserSystemSettingsCacheChanged({ reason: 'synced' })
    }
  })()
  await syncInFlight
}

export type SaveLocalAndRemoteOptions = {
  showSuccessToast?: boolean
  /** @deprecated 本地模式不会发起远端保存。 */
  showRemoteErrorToast?: boolean
  /** @deprecated 本地模式不会发起远端保存。 */
  skipRemote?: boolean
}

/** 保存到插件本地 storage；保留函数名兼容旧组件。 */
export async function saveLocalAndRemote(
  payload: UserSystemSettingsPayload,
  options: SaveLocalAndRemoteOptions = {},
): Promise<void> {
  const { showSuccessToast = true } = options
  await applyToPluginStorage(payload)
  notifyUserSystemSettingsCacheChanged({ reason: 'synced' })
  if (showSuccessToast) {
    showToast('配置已保存', 2000)
  }
}

/** 立即保存到本地（手动点击保存按钮时使用）。 */
export async function saveLocalAndRemoteImmediate(
  payload: UserSystemSettingsPayload,
  options: SaveLocalAndRemoteOptions = {},
): Promise<void> {
  const { showSuccessToast = true } = options
  await applyToPluginStorage(payload)
  notifyUserSystemSettingsCacheChanged({ reason: 'synced' })
  if (showSuccessToast) {
    showToast('配置已保存', 2000)
  }
}

export { STORAGE_KEYS as USER_SYSTEM_SETTINGS_STORAGE_KEYS }
