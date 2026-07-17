export interface OzonShopInfo {
  id: string | number
  name?: string
  shopName?: string
  companyName?: string
  [key: string]: unknown
}

export interface QuickShelveOpenOptions {
  targetSku?: string
}

export type QuickShelvePriceCurrency = 'rub' | 'rmb' | 'usd'

export type QuickShelvePriceSource = 'now' | 'original' | 'actual' | 'recommend'

export interface QuickShelveSkuRow {
  sku: string
  title: string
  image: string
  price: string
  originalPrice: string
  blackPrice?: string
  salePrice: string
  goodsNo: string
  sales: string
  createdAt?: string
  pricePairSource?: 'api' | 'aspect' | 'dom'
}

export interface QuickShelveSubmitFlags {
  upperShelveDirect: boolean
  aiImage: boolean
  oModel: boolean
  handMovementStatus: boolean
  Btxh: boolean
  madeCountryStatus: boolean
  jsonStatus: boolean
  tagStatus: boolean
  bigmodelAi: number
  pricateStatus: number
  removeBrandText: boolean
  generateBarcode: 0 | 1
  antiFollowEnabled: 0 | 1
  antiFollowTemplateId: number | null
  brandStatus: boolean
  brand: string | null
  brandId: string | null
  productSuffix: string | null
  aiTemplateId: string | null
}

export interface WarehouseOption {
  warehouse_id: string
  name: string
}

export interface ShopWarehouseConfig {
  shopId: string
  warehouseId: string
  stock: number | string
  warehouseList: WarehouseOption[]
  quotaHtml?: string
  quotaLoading?: boolean
}

export interface TemplateShopWarehouseConfig {
  shopId: string
  warehouseId: string | null
  stock?: number | string
}

export interface UpperTemplateRaw extends Record<string, unknown> {
  statusFlag?: unknown
  imageStatus?: unknown
  oModel?: unknown
  handMovementStatus?: unknown
  btxh?: unknown
  madeCountryStatus?: unknown
  tagStatus?: unknown
  jsonStatus?: unknown
  bigmodelAiStatus?: unknown
  aiTemplateId?: unknown
  productSuffix?: unknown
  removeBrandText?: unknown
  generateBarcode?: unknown
  antiFollowEnabled?: unknown
  antiFollowTemplateId?: unknown
  brandMode?: unknown
  brand?: unknown
  brandId?: unknown
  pricateStatus?: unknown
  shopWarehouseConfigs?: unknown
}

export interface UpperTemplateItem {
  id: string
  label: string
  raw: UpperTemplateRaw
}

export interface TemplateSelectItem {
  id: string
  label: string
}

export interface QuotaUsageBlock {
  usage?: number | string
  limit?: number | string
}

export interface ShopRecordQuotaData {
  daily_create?: QuotaUsageBlock
  daily_update?: QuotaUsageBlock
  total?: QuotaUsageBlock
}

export interface VariantLoadProgress {
  current: number
  total: number
  pending: number
}