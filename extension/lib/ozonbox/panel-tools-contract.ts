import type { OzonboxCollectedProduct } from './contract'
import { assertOzonboxCollectedProduct } from './contract'

export type PanelToolMode = 'mock' | 'real'
export type PanelPricingMode = 'suggest' | 'evaluate'
export type PanelPricingRoute = 'calculate' | 'calculate2'

/** Factual context passed to the extension-owned pricing iframe. */
export interface PanelPricingContext {
  route: PanelPricingRoute
  sellPrice: number
  packageWeight: number
  packageLength: number
  packageWidth: number
  packageHeight: number
  rfbsRate: number[]
  categoryIds: number[]
}

export interface PanelToolSettings {
  mode: PanelToolMode
  erpBaseUrl: string
}

export interface PanelPricingInput {
  mode: PanelPricingMode
  costCny: number
  shippingCny: number
  packagingCny: number
  exchangeRate: number
  ozonCommissionPct: number
  logisticsCommissionPct: number
  targetMarginPct: number
  minMarginPct: number
  competitorPriceRub: number
  minPriceRub: number
  maxPriceRub: number
  salePriceRub?: number
}

export interface PanelPricingResult {
  mode: PanelPricingMode
  costTotalCny: number
  costTotalRub: number
  priceRub: number
  oldPriceRub: number
  marginPct: number
  profitRub: number
  commissionRub: number
  breakdown: Record<string, number>
}

export type PanelSelectionBrandOption = 0 | 1 | 2

export interface PanelSelectionConditions {
  brandOption: PanelSelectionBrandOption
  soldCountMin?: number
  soldCountMax?: number
  soldSumMin?: number
  soldSumMax?: number
  priceMin?: number
  priceMax?: number
  weightMin?: number
  weightMax?: number
  listedDaysMin?: number
  listedDaysMax?: number
  salesDynamicsMin?: number
  salesDynamicsMax?: number
  drrMin?: number
  drrMax?: number
  daysInPromoMin?: number
  daysInPromoMax?: number
  discountMin?: number
  discountMax?: number
  promoRevenueShareMin?: number
  promoRevenueShareMax?: number
  daysWithTrafaretsMin?: number
  daysWithTrafaretsMax?: number
  qtyViewPdpMin?: number
  qtyViewPdpMax?: number
  convToCartPdpMin?: number
  convToCartPdpMax?: number
  sessionCountSearchMin?: number
  sessionCountSearchMax?: number
  convToCartSearchMin?: number
  convToCartSearchMax?: number
  convViewToOrderMin?: number
  convViewToOrderMax?: number
  salesSchema?: '' | 'FBO' | 'FBS'
  cancelRateMin?: number
  cancelRateMax?: number
  sellerCountMin?: number
  sellerCountMax?: number
  minimumPriceFollowMin?: number
  minimumPriceFollowMax?: number
}

export interface PanelSelectionRule {
  id: number
  name: string
  tag: string
  color?: string
  autoFavorite: boolean
  sort: number
  enabled: boolean
  conditions: PanelSelectionConditions
  updatedAt: string
}

export interface PanelSelectionRuleInput {
  name: string
  tag: string
  color?: string
  autoFavorite: boolean
  sort: number
  enabled: boolean
  conditions: PanelSelectionConditions
}

export interface PanelListingStore {
  id: number
  name: string
  currency?: string
  usable: boolean
  reason?: string
}

export interface PanelListingVariant {
  sku: string
  name: string
  priceRub: number
  oldPriceRub: number
  images: string[]
  selected: boolean
  offerId?: string
  originalPrice?: number
  customWeightG?: number
  packageLengthMm?: number
  packageWidthMm?: number
  packageHeightMm?: number
  barcode?: string
}

export interface PanelListingPreview {
  productId: string
  sourceUrl: string
  title: string
  brand?: string
  primaryImage?: string
  stores: PanelListingStore[]
  variants: PanelListingVariant[]
  descriptionCategoryId?: number
  typeId?: number
  previewOnlyTransforms: string[]
}

export interface PanelListingDraftInput {
  storeId: number
  productId: string
  sourceUrl: string
  title: string
  brand?: string
  offerId: string
  descriptionCategoryId: number
  typeId: number
  categoryName: string
  variants: PanelListingVariant[]
  followSourceImages: boolean
  watermarkEnabled: boolean
  randomizeImages: boolean
  modelImagesEnabled: boolean
  floatingPriceEnabled: boolean
  shopIds?: number[]
  currency?: 'CNY' | 'RUB' | 'USD' | 'EUR' | 'BYN' | 'KZT'
  brandMode?: 'copy' | 'none'
  imageOrder?: 'none' | 'shuffle' | 'main_fixed'
  followType?: 'hand' | 'api'
  watermarkId?: number
  modelId?: string
  floatingPrice?: number
  sourcePrice?: string
  sourceUrlNote?: string
  sourceRemark?: string
  showAllSku?: boolean
}

export interface PanelListingDraftResult {
  draftId: number
  status: 'draft' | 'ready'
  offerId: string
  selectedVariantCount: number
  warnings: string[]
}

export interface PanelListingSubmitResult {
  draftId: number
  simulated: boolean
  externalSubmitted: boolean
  taskId?: string
  message: string
}

export type PanelErpRoute =
  | '/'
  | '/stores'
  | '/products'
  | '/selection'
  | '/upload-management'
  | '/intelligence'
  | '/orders'
  | '/finances'
  | '/logistics'

export type PanelToolRequest =
  | { type: 'PANEL_SETTINGS_GET' }
  | { type: 'PANEL_SETTINGS_UPDATE'; settings: PanelToolSettings }
  | { type: 'PANEL_PRICING_RUN'; input: PanelPricingInput }
  | { type: 'PANEL_PRICING_CONTEXT'; route: PanelPricingRoute }
  | { type: 'PANEL_SELECTION_LIST' }
  | { type: 'PANEL_SELECTION_CREATE'; input: PanelSelectionRuleInput }
  | { type: 'PANEL_SELECTION_UPDATE'; id: number; input: PanelSelectionRuleInput }
  | { type: 'PANEL_SELECTION_TOGGLE'; id: number; enabled: boolean }
  | { type: 'PANEL_SELECTION_DELETE'; id: number }
  | { type: 'PANEL_LISTING_PREVIEW'; product?: OzonboxCollectedProduct }
  | { type: 'PANEL_LISTING_PREPARE'; input: PanelListingDraftInput; product?: OzonboxCollectedProduct }
  | { type: 'PANEL_LISTING_SUBMIT'; draftId: number }
  | { type: 'PANEL_ERP_OPEN'; route: PanelErpRoute }

export type PanelToolResponse<T> =
  | { success: true; mode: PanelToolMode; data: T }
  | { success: false; mode: PanelToolMode; error: string }

const PANEL_ERP_ROUTES = new Set<PanelErpRoute>([
  '/',
  '/stores',
  '/products',
  '/selection',
  '/upload-management',
  '/intelligence',
  '/orders',
  '/finances',
  '/logistics',
])

const SELECTION_NUMBER_FIELDS = new Set<keyof PanelSelectionConditions>([
  'soldCountMin', 'soldCountMax', 'soldSumMin', 'soldSumMax',
  'priceMin', 'priceMax', 'weightMin', 'weightMax',
  'listedDaysMin', 'listedDaysMax', 'salesDynamicsMin', 'salesDynamicsMax',
  'drrMin', 'drrMax', 'daysInPromoMin', 'daysInPromoMax',
  'discountMin', 'discountMax', 'promoRevenueShareMin', 'promoRevenueShareMax',
  'daysWithTrafaretsMin', 'daysWithTrafaretsMax',
  'qtyViewPdpMin', 'qtyViewPdpMax', 'convToCartPdpMin', 'convToCartPdpMax',
  'sessionCountSearchMin', 'sessionCountSearchMax',
  'convToCartSearchMin', 'convToCartSearchMax',
  'convViewToOrderMin', 'convViewToOrderMax', 'cancelRateMin', 'cancelRateMax',
  'sellerCountMin', 'sellerCountMax',
  'minimumPriceFollowMin', 'minimumPriceFollowMax',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0
}

function isPanelSettings(value: unknown): value is PanelToolSettings {
  return isRecord(value)
    && (value.mode === 'mock' || value.mode === 'real')
    && typeof value.erpBaseUrl === 'string'
}

function isPricingInput(value: unknown): value is PanelPricingInput {
  if (!isRecord(value) || (value.mode !== 'suggest' && value.mode !== 'evaluate')) return false
  const requiredNumbers: Array<keyof PanelPricingInput> = [
    'costCny', 'shippingCny', 'packagingCny', 'exchangeRate',
    'ozonCommissionPct', 'logisticsCommissionPct', 'targetMarginPct',
    'minMarginPct', 'competitorPriceRub', 'minPriceRub', 'maxPriceRub',
  ]
  if (!requiredNumbers.every(key => isFiniteNumber(value[key]))) return false
  return value.salePriceRub === undefined || isFiniteNumber(value.salePriceRub)
}

function isSelectionConditions(value: unknown): value is PanelSelectionConditions {
  if (!isRecord(value) || (value.brandOption !== 0 && value.brandOption !== 1 && value.brandOption !== 2)) return false
  return Object.entries(value).every(([key, fieldValue]) => {
    if (key === 'brandOption') return true
    if (key === 'salesSchema') return fieldValue === '' || fieldValue === 'FBO' || fieldValue === 'FBS'
    return SELECTION_NUMBER_FIELDS.has(key as keyof PanelSelectionConditions) && isFiniteNumber(fieldValue)
  })
}

function isSelectionRuleInput(value: unknown): value is PanelSelectionRuleInput {
  return isRecord(value)
    && typeof value.name === 'string'
    && value.name.trim().length >= 1
    && value.name.trim().length <= 15
    && typeof value.tag === 'string'
    && value.tag.trim().length >= 1
    && value.tag.trim().length <= 6
    && (value.color === undefined || (typeof value.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(value.color)))
    && typeof value.autoFavorite === 'boolean'
    && Number.isInteger(value.sort)
    && Number(value.sort) >= 0
    && Number(value.sort) <= 100
    && typeof value.enabled === 'boolean'
    && isSelectionConditions(value.conditions)
}

function isListingVariant(value: unknown): value is PanelListingVariant {
  return isRecord(value)
    && typeof value.sku === 'string'
    && typeof value.name === 'string'
    && isFiniteNumber(value.priceRub)
    && isFiniteNumber(value.oldPriceRub)
    && Array.isArray(value.images)
    && value.images.every(image => typeof image === 'string')
    && typeof value.selected === 'boolean'
}

function isListingDraftInput(value: unknown): value is PanelListingDraftInput {
  return isRecord(value)
    && isPositiveInteger(value.storeId)
    && typeof value.productId === 'string'
    && typeof value.sourceUrl === 'string'
    && typeof value.title === 'string'
    && (value.brand === undefined || typeof value.brand === 'string')
    && typeof value.offerId === 'string'
    && isPositiveInteger(value.descriptionCategoryId)
    && isPositiveInteger(value.typeId)
    && typeof value.categoryName === 'string'
    && Array.isArray(value.variants)
    && value.variants.every(isListingVariant)
    && typeof value.followSourceImages === 'boolean'
    && typeof value.watermarkEnabled === 'boolean'
    && typeof value.randomizeImages === 'boolean'
    && typeof value.modelImagesEnabled === 'boolean'
    && typeof value.floatingPriceEnabled === 'boolean'
}

function hasValidOptionalCollectedProduct(value: Record<string, unknown>): boolean {
  if (value.product === undefined) return true
  try {
    assertOzonboxCollectedProduct(value.product)
    return true
  } catch {
    return false
  }
}

export function isPanelToolRequest(value: unknown): value is PanelToolRequest {
  if (!isRecord(value)) return false
  switch (value.type) {
    case 'PANEL_SETTINGS_GET':
    case 'PANEL_SELECTION_LIST':
      return true
    case 'PANEL_LISTING_PREVIEW':
      return hasValidOptionalCollectedProduct(value)
    case 'PANEL_SETTINGS_UPDATE':
      return isPanelSettings(value.settings)
    case 'PANEL_PRICING_RUN':
      return isPricingInput(value.input)
    case 'PANEL_PRICING_CONTEXT':
      return value.route === 'calculate' || value.route === 'calculate2'
    case 'PANEL_SELECTION_CREATE':
      return isSelectionRuleInput(value.input)
    case 'PANEL_SELECTION_UPDATE':
      return isPositiveInteger(value.id) && isSelectionRuleInput(value.input)
    case 'PANEL_SELECTION_TOGGLE':
      return isPositiveInteger(value.id) && typeof value.enabled === 'boolean'
    case 'PANEL_SELECTION_DELETE':
      return isPositiveInteger(value.id)
    case 'PANEL_LISTING_PREPARE':
      return isListingDraftInput(value.input) && hasValidOptionalCollectedProduct(value)
    case 'PANEL_LISTING_SUBMIT':
      return isPositiveInteger(value.draftId)
    case 'PANEL_ERP_OPEN':
      return typeof value.route === 'string' && PANEL_ERP_ROUTES.has(value.route as PanelErpRoute)
    default:
      return false
  }
}

export function requirePanelToolData<T>(value: unknown): { mode: PanelToolMode; data: T } {
  if (!value || typeof value !== 'object') throw new Error('面板服务返回了无效响应')
  const response = value as Partial<PanelToolResponse<T>>
  if (response.success === false) throw new Error(typeof response.error === 'string' ? response.error : '面板服务请求失败')
  if (response.success !== true || (response.mode !== 'mock' && response.mode !== 'real') || !('data' in response)) {
    throw new Error('面板服务返回了无效响应')
  }
  return { mode: response.mode, data: response.data as T }
}