import { SELECTION_ALL_RANGE_SPECS } from './rangeSpecs'
import type { SelectionMatchContext, SelectionRule } from './types'
import {
  hasBrandValue,
  inRange,
  isNoBrand,
  matchShipModeFilter,
  parseNum,
  rangeBounds,
} from './matchUtils'

function applyRangeSpec(
  f: Record<string, string>,
  spec: (typeof SELECTION_ALL_RANGE_SPECS)[number],
  ctx: SelectionMatchContext,
): boolean {
  const r = rangeBounds(f, spec.minKey, spec.maxKey)
  if (!r.active) return true
  const v = spec.getValue(ctx)
  if (spec.skipIfNull && (v === null || v === undefined)) return true
  return inRange(v ?? null, r.min, r.max)
}

/** 单条规则是否匹配商品数据 */
export function matchSelectionRule(rule: SelectionRule, ctx: SelectionMatchContext): boolean {
  if (!rule || !rule.enabled || !ctx.data) return false
  const f = rule.filters || {}

  // 严格判定：有品牌须真有品牌值；无品牌含 空/null/无品牌/--/-；未就绪（加载中）两者都不命中
  if (f.brand === 'has' && !hasBrandValue(ctx.data.brand ?? undefined)) return false
  if (f.brand === 'none' && !isNoBrand(ctx.data.brand ?? undefined)) return false
  if (!matchShipModeFilter(f.shipMode, ctx.data.sources ?? undefined)) return false

  for (const spec of SELECTION_ALL_RANGE_SPECS) {
    if (!applyRangeSpec(f, spec, ctx)) return false
  }
  return true
}

function getRulePriorityNum(rule: SelectionRule): number {
  const pri = parseNum(rule.priority)
  return pri !== null ? pri : 0
}

/** 命中规则按优先级降序、表格行序升序排序 */
export function pickMatchingRulesSorted(
  rules: SelectionRule[],
  ctx: SelectionMatchContext,
): SelectionRule[] {
  const items: Array<{ rule: SelectionRule; tableIndex: number }> = []
  rules.forEach((rule, tableIndex) => {
    if (!rule || rule.enabled === false) return
    if (!String(rule.tagName || '').trim()) return
    if (!matchSelectionRule(rule, ctx)) return
    items.push({ rule, tableIndex })
  })
  items.sort((a, b) => {
    const pb = getRulePriorityNum(b.rule)
    const pa = getRulePriorityNum(a.rule)
    if (pb !== pa) return pb - pa
    return a.tableIndex - b.tableIndex
  })
  return items.map((it) => it.rule)
}
