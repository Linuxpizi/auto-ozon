import type { OzonSkuCardData } from '../ozonList/types'

export interface SelectionFilters extends Record<string, string> {
  brand: 'any' | 'has' | 'none'
  shipMode: string
}

export interface SelectionRule {
  id: string | number
  tagName: string
  tagBg: string
  enabled: boolean
  priority: number
  createdAt?: string
  updatedAt?: string
  filters: SelectionFilters
}

export interface SelectionExportContext {
  priceCny?: number
  priceRub?: number
  lengthMm?: number
  widthMm?: number
  heightMm?: number
  weightG?: number
}

export interface SelectionMatchContext {
  data: OzonSkuCardData
  priceText?: string
  card?: HTMLElement | null
  exportCtx?: SelectionExportContext
}

export interface SelectionRangeSpec {
  minKey: string
  maxKey: string
  label: string
  formLabel?: string
  inputId: string
  unitPrefix?: string
  unitSuffix?: string
  placeholderMin?: string
  placeholderMax?: string
  skipIfNull?: boolean
  getValue(ctx: SelectionMatchContext): number | null | undefined
}