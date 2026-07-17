import { SELECTION_MAX_RULES, SELECTION_STORAGE_KEY } from './constants'
import type { SelectionRule } from './types'

export function getSelectionRulesLocal(): SelectionRule[] {
  try {
    const raw = localStorage.getItem(SELECTION_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed.rules)) return parsed.rules.slice(0, SELECTION_MAX_RULES)
    if (Array.isArray(parsed)) return parsed.slice(0, SELECTION_MAX_RULES)
  } catch {
    /* ignore */
  }
  return []
}

export function saveSelectionRulesLocal(rules: SelectionRule[]) {
  const list = (rules || []).slice(0, SELECTION_MAX_RULES)
  localStorage.setItem(SELECTION_STORAGE_KEY, JSON.stringify({ rules: list }))
}

export function clearSelectionRulesLocal() {
  localStorage.removeItem(SELECTION_STORAGE_KEY)
}
