import { readStorageValue, removeStorageValue, writeStorageValue } from '../../../utils/runtime'
import { createSessionId } from './tabSession'
import { normalizeAiAutoSelectConfig, type AiAutoSelectConfig } from './types'

/** 跨标签页传递选品表单配置（经 chrome.storage，避免 www/s 子域 localStorage 隔离） */
export const PENDING_CONFIG_STORAGE_KEY = 'mjgd_ai_auto_select_pending_config_v2'

const PENDING_TTL_MS = 5 * 60 * 1000

export type PendingAutoSelectPayload = {
  sessionId: string
  config: AiAutoSelectConfig
  createdAt: number
  /** 落地后自动开始采集（由「开始智能选品」跳转触发） */
  autoStart?: boolean
  /** 落地后恢复已有草稿续采（由任务恢复弹窗「继续采集」触发） */
  resume?: boolean
}

export type SavePendingAutoSelectOptions = {
  sessionId: string
  autoStart?: boolean
  resume?: boolean
}

type PendingConfigMap = Record<string, PendingAutoSelectPayload>

function parsePayloadEntry(raw: unknown): PendingAutoSelectPayload | null {
  if (raw == null || typeof raw !== 'object') return null
  try {
    const parsed = raw as PendingAutoSelectPayload
    if (!parsed?.config || typeof parsed.createdAt !== 'number') return null
    if (Date.now() - parsed.createdAt > PENDING_TTL_MS) return null
    const sessionId = typeof parsed.sessionId === 'string' && parsed.sessionId
      ? parsed.sessionId
      : createSessionId()
    return {
      ...parsed,
      sessionId,
      config: normalizeAiAutoSelectConfig(parsed.config),
    }
  } catch {
    return null
  }
}

/** 兼容 v1 单槽结构迁移为 v2 Map */
function parsePendingMap(raw: unknown): PendingConfigMap {
  if (raw == null) return {}
  if (typeof raw === 'object' && raw !== null && 'config' in raw && 'createdAt' in raw) {
    const legacy = parsePayloadEntry(raw)
    if (!legacy) return {}
    return { [legacy.sessionId]: legacy }
  }
  if (typeof raw !== 'object') return {}
  const map: PendingConfigMap = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const parsed = parsePayloadEntry(value)
    if (parsed) map[parsed.sessionId || key] = parsed
  }
  return map
}

async function readPendingMap(): Promise<PendingConfigMap> {
  try {
    const raw = await readStorageValue(PENDING_CONFIG_STORAGE_KEY)
    return parsePendingMap(raw)
  } catch {
    return {}
  }
}

async function writePendingMap(map: PendingConfigMap): Promise<void> {
  const keys = Object.keys(map)
  if (!keys.length) {
    await removeStorageValue(PENDING_CONFIG_STORAGE_KEY)
    return
  }
  await writeStorageValue(PENDING_CONFIG_STORAGE_KEY, map)
}

function pickLatestPayload(entries: PendingAutoSelectPayload[]): PendingAutoSelectPayload | null {
  if (!entries.length) return null
  return entries.reduce((latest, item) => (item.createdAt >= latest.createdAt ? item : latest))
}

export async function savePendingAutoSelectConfig(
  config: AiAutoSelectConfig,
  options: SavePendingAutoSelectOptions,
): Promise<void> {
  const payload: PendingAutoSelectPayload = {
    sessionId: options.sessionId,
    config,
    createdAt: Date.now(),
    autoStart: options.autoStart,
    resume: options.resume,
  }
  try {
    const map = await readPendingMap()
    map[options.sessionId] = payload
    await writePendingMap(map)
  } catch (error) {
    console.warn('[aiAutoSelect] savePendingAutoSelectConfig failed:', error)
  }
}

export async function peekPendingAutoSelectConfig(sessionId?: string): Promise<PendingAutoSelectPayload | null> {
  try {
    const map = await readPendingMap()
    if (sessionId) {
      return map[sessionId] ?? null
    }
    return pickLatestPayload(Object.values(map))
  } catch {
    return null
  }
}

/** 扫描 autoStart 待落地配置，取最新一条 */
export async function peekPendingForAutoStart(): Promise<PendingAutoSelectPayload | null> {
  try {
    const map = await readPendingMap()
    const autoStartEntries = Object.values(map).filter((item) => item.autoStart)
    return pickLatestPayload(autoStartEntries)
  } catch {
    return null
  }
}

export async function consumePendingAutoSelectConfig(sessionId: string): Promise<PendingAutoSelectPayload | null> {
  const map = await readPendingMap()
  const pending = map[sessionId] ?? null
  if (!pending) return null
  delete map[sessionId]
  try {
    await writePendingMap(map)
  } catch {
    // 消费失败时仍返回数据，由调用方决定是否应用
  }
  return pending
}

export async function clearPendingAutoSelectConfig(sessionId?: string): Promise<void> {
  try {
    if (!sessionId) {
      await removeStorageValue(PENDING_CONFIG_STORAGE_KEY)
      return
    }
    const map = await readPendingMap()
    delete map[sessionId]
    await writePendingMap(map)
  } catch (error) {
    console.warn('[aiAutoSelect] clearPendingAutoSelectConfig failed:', error)
  }
}
