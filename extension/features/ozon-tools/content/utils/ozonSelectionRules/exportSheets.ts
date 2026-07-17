import { AUTO_CRAWL_CATEGORIES, type AutoCrawlConfig } from '../ozonBatchCrawl/autoCrawlFields'
import { priceTextToCnyNumber, priceTextToRubNumber } from '../ozonBatchCrawl/exportPriceUtils'
import type { OzonSkuCardData } from '../ozonList/types'
import { getCardGoodsData, getCardListPriceText } from './cardData'
import { findListCardBySku } from './cardTags'
import { matchSelectionRule } from './match'
import { rangeBounds } from './matchUtils'
import { SELECTION_RANGE_SPECS } from './rangeSpecs'
import { getSelectionRulesLocal } from './storage'
import type { SelectionMatchContext, SelectionRule } from './types'

function exportCategoryHasChecked(config: AutoCrawlConfig, categoryKey: string): boolean {
  const cat = AUTO_CRAWL_CATEGORIES.find((c) => c.key === categoryKey)
  if (!cat) return false
  return cat.fields.some((field) => !!config[field.key])
}

/** 规则中实际填写的筛选维度 */
export function getActiveSelectionFilterDimensions(rule: SelectionRule): string[] {
  if (!rule?.filters) return []
  const f = rule.filters
  const dims: string[] = []
  if (f.brand && f.brand !== 'any') dims.push('brand')
  if (f.shipMode && f.shipMode !== 'any') dims.push('sales')
  if (rangeBounds(f, 'priceMin', 'priceMax').active) dims.push('basicPrice')
  SELECTION_RANGE_SPECS.forEach((spec) => {
    if (!rangeBounds(f, spec.minKey, spec.maxKey).active) return
    if (['length', 'width', 'height', 'weight'].includes(spec.inputId)) {
      dims.push('weight')
    } else if (spec.inputId === 'fbs_comm' || spec.inputId === 'fbp_comm') {
      dims.push('commission')
    } else if (['follow_sellers', 'follow_min', 'follow_max'].includes(spec.inputId)) {
      dims.push('follow')
    } else {
      dims.push('sales')
    }
  })
  const seen = new Set<string>()
  return dims.filter((d) => {
    if (seen.has(d)) return false
    seen.add(d)
    return true
  })
}

export function exportConfigSupportsDimension(config: AutoCrawlConfig, dimension: string): boolean {
  if (!config) return false
  if (dimension === 'basicPrice') return !!(config.price || config.priceCny)
  if (dimension === 'brand') return !!(config.brand || config.brandCert)
  if (dimension === 'sales') return exportCategoryHasChecked(config, 'sales')
  if (dimension === 'weight') return exportCategoryHasChecked(config, 'weight')
  if (dimension === 'commission') {
    return !!(config.fbsCommission || config.fbpCommission) && !!(config.price || config.priceCny)
  }
  if (dimension === 'follow') return exportCategoryHasChecked(config, 'follow')
  return false
}

export function isSelectionRuleSupportedByExportConfig(
  rule: SelectionRule,
  exportConfig: AutoCrawlConfig,
): boolean {
  const dims = getActiveSelectionFilterDimensions(rule)
  if (!dims.length) return true
  return dims.every((dim) => exportConfigSupportsDimension(exportConfig, dim))
}

export function getSelectionRulesEligibleForExport(
  rules: SelectionRule[],
  exportConfig: AutoCrawlConfig,
): SelectionRule[] {
  return (rules || []).filter((rule) => {
    if (rule.enabled === false || !String(rule.tagName || '').trim()) return false
    return isSelectionRuleSupportedByExportConfig(rule, exportConfig)
  })
}

export function sanitizeExcelSheetName(name: string): string {
  let s = String(name || '选品标签')
    .trim()
    .replace(/[\\/*?:\[\]]/g, '_')
  if (!s) s = '选品标签'
  return s.slice(0, 31)
}

export function allocateUniqueSheetName(baseName: string, usedMap: Record<string, boolean>): string {
  let candidate = sanitizeExcelSheetName(baseName)
  if (!usedMap[candidate]) {
    usedMap[candidate] = true
    return candidate
  }
  let i = 2
  while (i < 100) {
    const suffix = `_${i}`
    const trimmed = sanitizeExcelSheetName(baseName).slice(0, 31 - suffix.length) + suffix
    if (!usedMap[trimmed]) {
      usedMap[trimmed] = true
      return trimmed
    }
    i += 1
  }
  const fallback = `标签_${Date.now()}`
  usedMap[fallback] = true
  return fallback.slice(0, 31)
}

export interface ExportMatchPayload {
  data: OzonSkuCardData
  card: HTMLElement | null
  priceText: string
  exportCtx: SelectionMatchContext['exportCtx']
}

export function resolveExportMatchPayload(
  sku: string,
  options?: {
    goodsData?: Partial<OzonSkuCardData>
    priceText?: string
    exportCtx?: SelectionMatchContext['exportCtx']
  },
): ExportMatchPayload {
  const card = findListCardBySku(sku)
  let data: OzonSkuCardData = card ? getCardGoodsData(card) || {} : {}
  if (options?.goodsData) {
    data = { ...data, ...options.goodsData }
  }
  const priceText = options?.priceText || (card ? getCardListPriceText(card) : '')
  if (!options?.exportCtx && priceText) {
    const priceCny = priceTextToCnyNumber(priceText)
    const priceRub = priceTextToRubNumber(priceText)
    return {
      data,
      card,
      priceText,
      exportCtx: {
        priceCny: priceCny ?? undefined,
        priceRub: priceRub ?? undefined,
        ...options?.exportCtx,
      },
    }
  }
  return {
    data,
    card,
    priceText,
    exportCtx: options?.exportCtx || {},
  }
}

export interface SelectionTagSheet {
  name: string
  data: string[][]
}

/** 按选品规则将导出行拆到各标签工作表 */
export function buildSelectionTagSheetsForExport(
  mainData: string[][],
  exportConfig: AutoCrawlConfig,
  rowSkus: string[],
  matchPayloadBySku: Record<string, ExportMatchPayload>,
): SelectionTagSheet[] {
  if (!mainData.length || mainData.length < 2 || !rowSkus.length) return []

  const rules = getSelectionRulesLocal()
  const eligible = getSelectionRulesEligibleForExport(rules, exportConfig)
  if (!eligible.length) return []

  const headers = mainData[0]
  const usedNames: Record<string, boolean> = {}
  const sheets: SelectionTagSheet[] = []

  eligible.forEach((rule) => {
    const sheetRows: string[][] = [headers]
    for (let i = 0; i < rowSkus.length; i += 1) {
      const sku = rowSkus[i]
      const payload = matchPayloadBySku[sku]
      if (!payload?.data) continue
      const ctx: SelectionMatchContext = {
        data: payload.data,
        card: payload.card,
        priceText: payload.priceText,
        exportCtx: payload.exportCtx,
      }
      if (matchSelectionRule(rule, ctx)) {
        sheetRows.push(mainData[i + 1])
      }
    }
    if (sheetRows.length > 1) {
      sheets.push({
        name: allocateUniqueSheetName(rule.tagName, usedNames),
        data: sheetRows,
      })
    }
  })

  return sheets
}
