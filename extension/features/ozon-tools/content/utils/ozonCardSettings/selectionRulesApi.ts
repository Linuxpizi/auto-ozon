export const SELECTION_MAX_RULES = 3

const SELECTION_RULES_STORAGE_KEY = 'ozon_replica_selection_rules'

export interface SelectionRuleItem {
  id?: string | number
  tagName: string
  tagBg?: string
  enabled: boolean
  priority: number
  updatedAt?: string
  createdAt?: string
  filters?: Record<string, unknown>
}

/**
 * 对齐旧版 mergeDraftRulesFromServerData：
 * 接受 { data: { rules: [...] } } 或 { data: [...] } 两种返回结构。
 * 后端目前用前者，但接口曾经返回过纯数组，统一兜底。
 */
function extractRules(data: unknown): SelectionRuleItem[] {
  if (Array.isArray(data)) return data as SelectionRuleItem[]
  if (data && typeof data === 'object') {
    const maybe = (data as { rules?: unknown }).rules
    if (Array.isArray(maybe)) return maybe as SelectionRuleItem[]
  }
  return []
}

async function readLocalSelectionRules(): Promise<SelectionRuleItem[]> {
  const chromeApi = (globalThis as any).chrome
  let value: unknown
  try {
    if (chromeApi?.storage?.local) {
      const stored = await chromeApi.storage.local.get(SELECTION_RULES_STORAGE_KEY)
      value = stored[SELECTION_RULES_STORAGE_KEY]
    } else {
      const raw = globalThis.localStorage?.getItem(SELECTION_RULES_STORAGE_KEY)
      value = raw ? JSON.parse(raw) : []
    }
  } catch (error) {
    console.warn('[mjgd][selection-rules] 读取本地规则失败', error)
    return []
  }
  return extractRules(value).slice(0, SELECTION_MAX_RULES)
}

async function writeLocalSelectionRules(rules: SelectionRuleItem[]): Promise<void> {
  const chromeApi = (globalThis as any).chrome
  if (chromeApi?.storage?.local) {
    await chromeApi.storage.local.set({ [SELECTION_RULES_STORAGE_KEY]: rules })
    return
  }
  globalThis.localStorage?.setItem(SELECTION_RULES_STORAGE_KEY, JSON.stringify(rules))
}

export async function fetchSelectionRules(): Promise<SelectionRuleItem[]> {
  return readLocalSelectionRules()
}

export async function fetchSelectionRuleDetail(id: string | number): Promise<SelectionRuleItem> {
  const rule = (await readLocalSelectionRules()).find((item) => String(item.id) === String(id))
  if (rule) return rule
  throw new Error('未找到本地规则')
}

export async function saveSelectionRules(rules: SelectionRuleItem[]): Promise<SelectionRuleItem[]> {
  const now = new Date().toISOString()
  const payload = rules.slice(0, SELECTION_MAX_RULES).map((rule, index) => ({
    id: rule.id ?? `local-${Date.now()}-${index}`,
    tagName: String(rule.tagName || '').trim(),
    tagBg: rule.tagBg || '',
    enabled: rule.enabled !== false,
    priority: Number(rule.priority) || 0,
    filters: rule.filters || {},
    updatedAt: now,
    createdAt: rule.createdAt || now,
  }))
  await writeLocalSelectionRules(payload)
  return payload
}
