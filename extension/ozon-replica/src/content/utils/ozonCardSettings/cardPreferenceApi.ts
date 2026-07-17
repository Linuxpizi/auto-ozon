import { getMpChartVisible } from '../ozonMpChart/mpChartPreference'
import {
  buildDefaultCardFieldConfig,
  CARD_FIELD_DEFS,
  CARD_FIELD_KEY_ALIASES,
  parseCardFieldVisible,
  type CardFieldConfig,
  type CardFieldConfigItem,
} from './cardFields'

interface CardPreferenceApiData {
  cardFieldConfig?: { fields?: CardFieldConfigItem[] }
  mpChartVisible?: boolean
}

const CARD_PREFERENCE_STORAGE_KEY = 'ozon_replica_card_preference'

async function readLocalCardPreference(): Promise<CardPreferenceApiData | null> {
  const chromeApi = (globalThis as any).chrome
  try {
    if (chromeApi?.storage?.local) {
      const stored = await chromeApi.storage.local.get(CARD_PREFERENCE_STORAGE_KEY)
      const value = stored[CARD_PREFERENCE_STORAGE_KEY]
      return value && typeof value === 'object' ? value as CardPreferenceApiData : null
    }
  } catch (error) {
    console.warn('[mjgd][card-settings] 读取扩展本地配置失败，尝试页面本地存储', error)
  }

  try {
    const raw = globalThis.localStorage?.getItem(CARD_PREFERENCE_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' ? parsed as CardPreferenceApiData : null
  } catch {
    return null
  }
}

async function writeLocalCardPreference(data: CardPreferenceApiData): Promise<void> {
  const chromeApi = (globalThis as any).chrome
  if (chromeApi?.storage?.local) {
    await chromeApi.storage.local.set({ [CARD_PREFERENCE_STORAGE_KEY]: data })
    return
  }
  globalThis.localStorage?.setItem(CARD_PREFERENCE_STORAGE_KEY, JSON.stringify(data))
}

export function cardFieldConfigFromApiData(data?: CardPreferenceApiData | null): CardFieldConfig {
  const raw = data?.cardFieldConfig?.fields
  if (!Array.isArray(raw) || !raw.length) {
    return buildDefaultCardFieldConfig()
  }

  const validKeys = new Set(CARD_FIELD_DEFS.map((def) => def.key))
  const known = new Set<string>()
  const fields: CardFieldConfigItem[] = []
  raw
    .filter((f) => f?.key)
    .forEach((f) => {
      // 归一化旧构建残留键（packagingDims/packagingWeight → dimensions/weight）
      const key = CARD_FIELD_KEY_ALIASES[f.key] || f.key
      // 丢弃当前版本未知的脏键，避免设置里出现原始英文键
      if (!validKeys.has(key) || known.has(key)) return
      known.add(key)
      const rawVisible = (f as { visible?: unknown; show?: unknown; enabled?: unknown }).visible
        ?? (f as { show?: unknown }).show
        ?? (f as { enabled?: unknown }).enabled
      fields.push({ key, visible: parseCardFieldVisible(rawVisible) })
    })

  CARD_FIELD_DEFS.forEach((def) => {
    if (!known.has(def.key)) {
      fields.push({ key: def.key, visible: true })
    }
  })

  return { fields }
}

export interface CardPreferenceResult {
  config: CardFieldConfig
  mpChartVisible: boolean
}

export async function fetchCardPreference(): Promise<CardPreferenceResult> {
  const stored = await readLocalCardPreference()
  return {
    config: cardFieldConfigFromApiData(stored),
    mpChartVisible: typeof stored?.mpChartVisible === 'boolean'
      ? stored.mpChartVisible
      : getMpChartVisible(),
  }
}

export async function saveCardPreference(fields: CardFieldConfigItem[]): Promise<void> {
  const normalized = cardFieldConfigFromApiData({ cardFieldConfig: { fields } })
  await writeLocalCardPreference({
    cardFieldConfig: {
      fields: normalized.fields.map((field) => ({
        key: field.key,
        visible: field.visible !== false,
      })),
    },
    mpChartVisible: getMpChartVisible(),
  })
}

export async function resetCardFieldOrder(): Promise<CardFieldConfig> {
  const defaults = buildDefaultCardFieldConfig()
  await writeLocalCardPreference({
    cardFieldConfig: { fields: defaults.fields },
    mpChartVisible: getMpChartVisible(),
  })
  return defaults
}
