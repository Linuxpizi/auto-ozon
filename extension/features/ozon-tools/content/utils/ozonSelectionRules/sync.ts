import { fetchSelectionRules } from '../ozonCardSettings/selectionRulesApi'
import { applySelectionTagsAll, clearAllSelectionTags } from './cardTags'
import { normalizeRulesForSave } from './filters'
import { clearSelectionRulesLocal, saveSelectionRulesLocal } from './storage'
import type { SelectionRule } from './types'

/** 从服务端拉取规则写入本地缓存并刷新列表打标 */
export async function syncSelectionRulesFromServer(options?: {
  applyTags?: boolean
}): Promise<SelectionRule[]> {
  const applyTags = options?.applyTags !== false
  try {
    const rules = await fetchSelectionRules()
    const normalized = normalizeRulesForSave(rules as SelectionRule[])
    saveSelectionRulesLocal(normalized)
    if (applyTags) applySelectionTagsAll()
    return normalized
  } catch (e) {
    console.warn('[mjgd][selection] 同步选品规则失败', e)
    return []
  }
}

/** 规则生效：用当前 settings 草稿写入本地并刷新打标 */
export function activateSelectionRules(rules: SelectionRule[]) {
  const normalized = normalizeRulesForSave(rules)
  saveSelectionRulesLocal(normalized)
  applySelectionTagsAll()
}

/** 登出时清除本地规则缓存与页面标签 */
export function clearSelectionOnLogout() {
  clearSelectionRulesLocal()
  clearAllSelectionTags()
}
