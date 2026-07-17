import { SELECTION_ALL_RANGE_SPECS } from './rangeSpecs'
import type { SelectionFilters, SelectionRule } from './types'
import { SELECTION_MAX_RULES } from './constants'

export function createEmptySelectionFilters(): SelectionFilters {
  const f: SelectionFilters = { brand: 'any', shipMode: 'any' }
  SELECTION_ALL_RANGE_SPECS.forEach((spec) => {
    f[spec.minKey] = ''
    f[spec.maxKey] = ''
  })
  return f
}

export function normalizeFiltersForSave(filters?: Record<string, unknown> | null): SelectionFilters {
  const base = createEmptySelectionFilters()
  if (!filters) return base
  Object.keys(base).forEach((key) => {
    if (filters[key] !== undefined && filters[key] !== null) {
      base[key] = String(filters[key])
    }
  })
  if (filters.brand) base.brand = String(filters.brand) as SelectionFilters['brand']
  if (filters.shipMode) base.shipMode = String(filters.shipMode)
  return base
}

export function createEmptySelectionRule(): SelectionRule {
  const now = new Date().toISOString()
  return {
    id: `sr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    tagName: '',
    tagBg: '',
    enabled: true,
    priority: 0,
    createdAt: now,
    updatedAt: now,
    filters: createEmptySelectionFilters(),
  }
}

export function normalizeRulesForSave(rules: SelectionRule[]): SelectionRule[] {
  return (rules || []).slice(0, SELECTION_MAX_RULES).map((rule) => ({
    id: rule.id,
    tagName: String(rule.tagName || '').trim(),
    tagBg: rule.tagBg || '',
    enabled: rule.enabled !== false,
    priority: Number(rule.priority) || 0,
    filters: normalizeFiltersForSave(rule.filters),
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
  }))
}

export function formatSelectionRuleTime(ts?: string): string {
  if (!ts) return '--'
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return String(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
