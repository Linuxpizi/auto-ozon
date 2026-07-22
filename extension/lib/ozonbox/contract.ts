/**
 * The single wire contract for the Ozonbox-compatible flow.
 *
 * This module deliberately contains no collection defaults.  Values that are
 * not present in the page/API remain absent or null and are rejected later by
 * the product-record contract when they are facts required for persistence.
 */

export interface OzonboxStore {
  id: number
  name: string
  storeName: string
  clientId: string
  status: string
  usable: boolean
}

export interface OzonboxCategoryResult {
  categoryId: number
  descriptionCategoryId: number
  typeId: number | null
  categoryPath?: string | null
}

export interface OzonboxPackageAttribute {
  key: '9454' | '9455' | '9456' | '4497'
  value: string
}

export interface OzonboxPackageShopFacts {
  attributes: OzonboxPackageAttribute[]
  categories: unknown[]
}

export interface OzonboxVariant {
  id?: string | null
  productId?: string | null
  sku?: string | null
  offerId?: string | null
  /** Offer-specific price. Absent when the selector does not expose one. */
  price?: number | null
  oldPrice?: number | null
  images: string[]
  video?: string | null
  videos?: string[]
  weight?: number | null
  depth?: number | null
  width?: number | null
  height?: number | null
  stock?: number | null
  sourceUrl?: string | null
  supplierSkuId?: string | null
  supplierSpecText?: string | null
  supplierAttrs: Array<Record<string, unknown>>
  variantAttrs: Record<string, unknown>
}

import type { OzonMetrics } from '@/lib/utils/types'

/** Product shape returned by the Ozon collector before category enrichment. */
export interface OzonboxCollectedProduct {
  source: 'OZON'
  sourceUrl: string
  productId: string
  recordName: string
  sku?: string | null
  title: string
  /** Factual product-level brand; absent when Ozon does not expose one. */
  brand?: string | null
  titleRu?: string | null
  description?: string | null
  descriptionRu?: string | null
  /** Automatically collected from explicitly named factual PDP characteristics. */
  tags?: string[]
  images: string[]
  price: number
  specs: Array<Record<string, unknown>>
  variantsData: OzonboxVariant[]
  variantAttrIds: number[]
  categoryPath?: string | null
  categoryId?: number | null
  typeId?: number | null
  descriptionCategoryId?: number | null
  /** Optional factual analytics/logistics enrichment; absent when unavailable. */
  ozonMetrics?: OzonMetrics | null
  warehouse?: string | null
  warehouseId?: string | null
  logisticsType?: string | null
  deliveryMethod?: string | null
  deliveryRegion?: string | null
  deliveryDays?: number | null
  discount?: string | null
  stock?: string | null
  status: 'draft'
}

export type OzonboxProductRecord = OzonboxCollectedProduct & {
  storeId: number
}

export interface OzonboxEnvelope<T> {
  code: number
  data: T
  message: string
}

export interface OzonboxProductRecordSaved {
  id: number
  storeId: number
  productId: string
  status: string
}

export interface OzonboxSellerIdRequest {
  type: 'OZONBOX_READ_SELLER_ID'
}

export interface OzonboxSellerIdResponse {
  sellerId: string
}

export interface OzonboxSellerAnalyticsRequest {
  type: 'OZONBOX_FETCH_SELLER_ANALYTICS'
  sku: string
  shopId: string
}

export interface OzonboxPackageFactsRequest {
  type: 'OZONBOX_FETCH_PACKAGE_FACTS'
  sku: string
}

export interface OzonboxSellerVariantPackageRequest {
  type: 'OZONBOX_FETCH_SELLER_VARIANT_PACKAGE'
  variantId: string
  shopId: string
}

export interface OzonboxSellerApiResponse {
  data: unknown
  status: number
  ok: boolean
}

export interface OzonboxRuntimeErrorResponse {
  error: string
}

export interface OzonboxCollectRequest {
  type: 'COLLECT_PRODUCT'
  /** Present only when the popup asks the background to target a tab. */
  tabId?: number
}

export type OzonboxRuntimeMessage =
  | OzonboxCollectRequest
  | OzonboxSellerIdRequest
  | OzonboxSellerAnalyticsRequest
  | OzonboxPackageFactsRequest
  | OzonboxSellerVariantPackageRequest

export type OzonboxRuntimeResponse =
  | OzonboxCollectedProduct
  | OzonboxSellerIdResponse
  | OzonboxSellerApiResponse
  | OzonboxRuntimeErrorResponse

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Ozon 商品缺少真实的 ${field}`)
  }
  return value.trim()
}

function positiveNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`Ozon 商品的 ${field} 必须是正数`)
  }
  return value
}

function validateVariant(value: unknown, index: number): OzonboxVariant {
  if (!isRecord(value)) throw new Error(`第 ${index + 1} 个变体不是对象`)
  const identity = ['id', 'productId', 'sku', 'offerId']
    .map((key) => value[key])
    .find((item) => typeof item === 'string' && item.trim())
  if (!identity) throw new Error(`第 ${index + 1} 个变体缺少真实身份`)
  if (value.price !== undefined && value.price !== null && value.price !== '') {
    positiveNumber(value.price, `第 ${index + 1} 个变体价格`)
  }
  if (!Array.isArray(value.images)) throw new Error(`第 ${index + 1} 个变体图片必须是数组`)
  if (!Array.isArray(value.supplierAttrs)) throw new Error(`第 ${index + 1} 个变体供应商属性必须是数组`)
  if (!isRecord(value.variantAttrs)) throw new Error(`第 ${index + 1} 个变体属性必须是对象`)
  return value as unknown as OzonboxVariant
}

/** Validate facts immediately before they cross the save API boundary. */
export function assertOzonboxProductRecord(value: unknown): OzonboxProductRecord {
  if (!isRecord(value)) throw new Error('Ozon 商品记录必须是对象')
  if (value.source !== 'OZON') throw new Error('商品来源必须是 OZON')
  const storeId = value.storeId
  if (typeof storeId !== 'number' || !Number.isInteger(storeId) || storeId <= 0) {
    throw new Error('必须选择有效的目标店铺')
  }
  const productId = nonEmptyString(value.productId, 'productId')
  if (!/^\d+$/.test(productId) || Number(productId) <= 0) {
    throw new Error('productId 必须是正整数的字符串')
  }
  nonEmptyString(value.sourceUrl, 'sourceUrl')
  nonEmptyString(value.recordName, 'recordName')
  nonEmptyString(value.title, 'title')
  if (value.brand != null) nonEmptyString(value.brand, 'brand')
  positiveNumber(value.price, '商品价格')
  if (!Array.isArray(value.images) || !Array.isArray(value.specs) || !Array.isArray(value.variantAttrIds)) {
    throw new Error('商品图片、规格和变体属性 ID 必须是数组')
  }
  if (value.tags !== undefined && !Array.isArray(value.tags)) {
    throw new Error('商品标签必须是数组')
  }
  if (Array.isArray(value.tags) && value.tags.some((tag) => typeof tag !== 'string' || !tag.trim())) {
    throw new Error('商品标签必须是非空字符串数组')
  }
  if (!Array.isArray(value.variantsData) || value.variantsData.length === 0) {
    throw new Error('商品必须包含至少一个真实变体')
  }
  value.variantsData.forEach((variant, index) => validateVariant(variant, index))
  if (value.categoryId != null && value.descriptionCategoryId != null
    && value.categoryId !== value.descriptionCategoryId) {
    throw new Error('categoryId 与 descriptionCategoryId 必须一致')
  }
  return value as unknown as OzonboxProductRecord
}

export function assertOzonboxEnvelope<T>(value: unknown): OzonboxEnvelope<T> {
  if (!isRecord(value) || typeof value.code !== 'number' || !('data' in value)) {
    throw new Error('后端服务返回了无效响应')
  }
  return value as unknown as OzonboxEnvelope<T>
}