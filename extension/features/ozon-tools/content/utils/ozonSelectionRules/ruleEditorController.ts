import { reactive } from 'vue'
import { showToast } from '../../../utils/toast'
import {
  fetchSelectionRuleDetail,
  saveSelectionRules,
  type SelectionRuleItem,
} from '../ozonCardSettings/selectionRulesApi'
import { settingsState } from '../ozonCardSettings/settingsController'
import { SELECTION_MAX_RULES } from './constants'
import {
  createEmptySelectionFilters,
  createEmptySelectionRule,
  normalizeFiltersForSave,
  normalizeRulesForSave,
} from './filters'
import { SELECTION_ALL_RANGE_SPECS } from './rangeSpecs'
import type { SelectionFilters } from './types'

export const ruleEditorState = reactive({
  visible: false,
  loading: false,
  saving: false,
  isNew: false,
  editingId: null as string | number | null,
  tagName: '',
  tagBg: '',
  tagBgSet: false,
  priority: 0,
  brand: 'any' as SelectionFilters['brand'],
  shipMode: 'any',
  filters: createEmptySelectionFilters(),
})

function resetForm() {
  const empty = createEmptySelectionRule()
  ruleEditorState.tagName = ''
  ruleEditorState.tagBg = ''
  ruleEditorState.tagBgSet = false
  ruleEditorState.priority = 0
  ruleEditorState.brand = 'any'
  ruleEditorState.shipMode = 'any'
  ruleEditorState.filters = empty.filters
}

function fillFormFromRule(rule: SelectionRuleItem) {
  ruleEditorState.tagName = rule.tagName || ''
  ruleEditorState.tagBg = rule.tagBg || ''
  ruleEditorState.tagBgSet = !!rule.tagBg
  ruleEditorState.priority = Number(rule.priority) || 0
  const f = normalizeFiltersForSave(rule.filters as Record<string, unknown>)
  ruleEditorState.brand = f.brand
  ruleEditorState.shipMode = f.shipMode
  ruleEditorState.filters = f
}

export function closeRuleEditor() {
  ruleEditorState.visible = false
  ruleEditorState.editingId = null
  ruleEditorState.loading = false
  ruleEditorState.saving = false
}

export async function openRuleEditor(options?: { ruleId?: string | number; isNew?: boolean }) {
  ruleEditorState.visible = true
  ruleEditorState.isNew = !!options?.isNew
  ruleEditorState.editingId = options?.isNew ? null : options?.ruleId ?? null
  resetForm()

  if (options?.isNew) {
    if (settingsState.selectionRules.length >= SELECTION_MAX_RULES) {
      showToast(`最多 ${SELECTION_MAX_RULES} 条选品规则`, 3000)
      closeRuleEditor()
      return
    }
    return
  }

  if (options?.ruleId) {
    ruleEditorState.loading = true
    try {
      const detail = await fetchSelectionRuleDetail(options.ruleId)
      fillFormFromRule(detail)
    } catch (e: any) {
      showToast(e?.message || '加载规则失败', 4000)
      closeRuleEditor()
    } finally {
      ruleEditorState.loading = false
    }
    return
  }

  const idx = settingsState.selectionRules.length
  if (!options?.ruleId && !options?.isNew) {
    fillFormFromRule(settingsState.selectionRules[idx - 1] || createEmptySelectionRule())
  }
}

export function setRuleEditorFilter(key: string, value: string) {
  ruleEditorState.filters[key] = value
}

export function setRuleEditorTagColor(color: string) {
  const c = String(color || '').trim()
  if (!c) {
    ruleEditorState.tagBg = ''
    ruleEditorState.tagBgSet = false
    return
  }
  ruleEditorState.tagBg = c
  ruleEditorState.tagBgSet = true
}

export async function saveRuleFromEditor(): Promise<boolean> {
  const tagName = ruleEditorState.tagName.trim()
  if (!tagName) {
    showToast('请输入标签名称', 3000)
    return false
  }
  if (tagName.length > 6) {
    showToast('标签名称最多 6 个字符', 3000)
    return false
  }
  const priority = Number(ruleEditorState.priority)
  if (!Number.isFinite(priority) || priority < 0 || priority > 100) {
    showToast('优先级须在 0-100 之间', 3000)
    return false
  }

  const payload: SelectionRuleItem = {
    tagName,
    tagBg: ruleEditorState.tagBgSet ? ruleEditorState.tagBg : '',
    priority,
    enabled: true,
    updatedAt: new Date().toISOString(),
    filters: {
      ...ruleEditorState.filters,
      brand: ruleEditorState.brand,
      shipMode: ruleEditorState.shipMode,
    },
  }

  let draft = [...settingsState.selectionRules]
  if (ruleEditorState.editingId) {
    const idx = draft.findIndex((r) => String(r.id) === String(ruleEditorState.editingId))
    if (idx >= 0) {
      payload.id = ruleEditorState.editingId
      payload.enabled = draft[idx].enabled !== false
      draft[idx] = { ...draft[idx], ...payload }
    }
  } else {
    if (draft.length >= SELECTION_MAX_RULES) {
      showToast(`最多 ${SELECTION_MAX_RULES} 条选品规则`, 3000)
      return false
    }
    const nr = createEmptySelectionRule()
    draft.push({
      ...nr,
      ...payload,
      id: nr.id,
      enabled: true,
      createdAt: nr.createdAt,
    })
  }

  ruleEditorState.saving = true
  try {
    const saved = await saveSelectionRules(normalizeRulesForSave(draft as any))
    settingsState.selectionRules = saved.map((r) => ({ ...r }))
    showToast('规则已保存', 2000)
    closeRuleEditor()
    return true
  } catch (e: any) {
    showToast(e?.message || '保存规则失败', 4000)
    return false
  } finally {
    ruleEditorState.saving = false
  }
}

export function getRangeFilterValue(spec: (typeof SELECTION_ALL_RANGE_SPECS)[number], side: 'min' | 'max'): string {
  const key = side === 'min' ? spec.minKey : spec.maxKey
  return String(ruleEditorState.filters[key] ?? '')
}

export function setRangeFilterValue(
  spec: (typeof SELECTION_ALL_RANGE_SPECS)[number],
  side: 'min' | 'max',
  value: string,
) {
  const key = side === 'min' ? spec.minKey : spec.maxKey
  ruleEditorState.filters[key] = value
}
