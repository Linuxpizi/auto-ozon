/** 平台类型 */
export type Platform = 'ozon' | 'wb' | '1688' | 'pdd'

/** 页面/API 中可核验的单个变体维度。 */
export interface ProductVariantValue {
  name: string
  value: string
  sourcePath?: string
  provenance?: FactProvenance
  [key: string]: unknown
}

/** 可追溯事实的来源；未知的新来源仍可按原值无损透传。 */
export type FactSource =
  | 'ozon_pdp_characteristic'
  | 'ozon_pdp_structured_data'
  | 'ozon_seller_analytics'
  | 'ozon_seller_variant_package'
  | 'ozon_seller_package_api'
  | 'legacy_variant_physical'
  | 'manual_override'
  | (string & {})

export interface FactProvenance {
  source: FactSource
  sourcePath?: string
  capturedAt?: string
  /** 人工覆盖时必填；采集来源通常不提供。 */
  reason?: string
  [key: string]: unknown
}

export type PackagePhysicalField =
  | 'packageWeightG'
  | 'packageDepthMm'
  | 'packageWidthMm'
  | 'packageHeightMm'

/** 每个包装物理量独立记录来源，禁止用一个模糊来源覆盖不同接口的事实。 */
export type PackagePhysicalProvenance = Partial<Record<PackagePhysicalField, FactProvenance>>

/**
 * SKU 的包装/运输物理事实。它与 ProductSpec 的商品净重、商品尺寸语义严格分离。
 * 采集阶段允许字段不完整；可上架性由提交边界验证。
 */
export interface PackagePhysicalSnapshot {
  packageWeightG?: number
  packageDepthMm?: number
  packageWidthMm?: number
  packageHeightMm?: number
  packagePhysicalProvenance?: PackagePhysicalProvenance
}

export interface OzonAttributeFactValue {
  /** Ozon 字典值 ID；只有正整数才可用于发布。 */
  dictionaryValueId?: number
  /** 非字典属性的事实文本；不得被解释为属性 ID。 */
  value?: string
  [key: string]: unknown
}

/**
 * 已识别的 Ozon 类目属性事实。任意 PDP 文本特征必须留在 ProductFact/supplierAttrs，
 * 不能仅凭名称推导 attributeId。发布器还会再次校验正整数 ID 与显式发布标记。
 */
export interface OzonAttributeFact {
  attributeId: number
  values: OzonAttributeFactValue[]
  unit?: string
  scope: 'product' | 'sku'
  /** 同一 complex_attributes 条目的稳定分组身份。 */
  complexGroupId?: string
  recognized: boolean
  publishable: boolean
  provenance: FactProvenance
  [key: string]: unknown
}

/** 从页面 DOM、结构化数据、平台接口或明确标记的插件节点采集到的事实。 */
export interface ProductFact {
  name: string
  value: string
  sourcePath?: string
  provenance?: FactProvenance
  [key: string]: unknown
}

/**
 * 商品的一个真实可售 SKU/变体组合。
 *
 * 不允许根据标题或默认值构造；只保存页面 DOM、页面内嵌数据或平台接口
 * 明确提供的字段。`values` 必须描述该 SKU 的完整变体组合；对于平台明确
 * 只有一个 Offer 且不存在颜色/尺码等变体维度的普通商品，完整组合是空数组。
 */
export interface ProductVariant extends PackagePhysicalSnapshot {
  sku: string
  barcode?: string
  values: ProductVariantValue[]
  price?: number
  oldPrice?: number
  stock?: number
  /** 该 SKU 自己的完整事实图集；imageUrl 保留为首图兼容字段。 */
  images?: string[]
  imageUrl?: string
  /** 该 SKU 自己的事实视频地址。 */
  videoUrls?: string[]
  weight?: number
  depth?: number
  width?: number
  height?: number
  sourceUrl?: string
  id?: string
  productId?: string
  offerId?: string
  supplierSkuId?: string
  supplierSpecText?: string
  supplierAttrs?: Array<Record<string, unknown>>
  variantAttrs?: Record<string, unknown>
  /** 仅保存有明确 Ozon 属性 ID/来源的 SKU 属性；普通文本事实不得放入这里。 */
  ozonAttributeFacts?: OzonAttributeFact[]
  /** 变体事实来源，便于区分页面结构化数据、DOM 与平台接口。 */
  sourcePath?: string
}

export interface ProductSpec {
  weight_g?: number
  depth_mm?: number
  height_mm?: number
  width_mm?: number
  package_weight_g?: number
  package_depth_mm?: number
  package_width_mm?: number
  package_height_mm?: number
  volume_cm3?: number
  [key: string]: unknown
}

/** 采集的商品数据 */
export interface ScrapedProduct {
  platform: Platform
  sourceId: string
  title: string
  /** 币种: CNY/RUB/USD 等,默认根据平台推断 */
  currency: string
  price: number
  oldPrice: number
  images: string[]
  rating: number
  reviewCount: number
  brand?: string
  category?: string
  sellerName?: string
  sellerUrl?: string
  description?: string
  sourceUrl: string
  scrapedAt: string

  // ── Ozon 商品级采集元数据 ──
  /** Ozonbox 采集记录名。 */
  recordName?: string
  /** 当前 PDP 明确选中的 SKU；与完整 skuList/variants 分开保存。 */
  selectedSku?: string
  /** 页面/API 明确提供的俄文标题与描述。 */
  titleRu?: string
  descriptionRu?: string
  /** Ozon 变体属性 ID 图谱。 */
  variantAttrIds?: number[]
  /** 采集记录状态，不等同于正式上架状态。 */
  collectionStatus?: string
  /** Ozon categoryId；与 description_category_id 分开保存。 */
  ozonCategoryPathId?: number

  // ── 多值字段 (JSON arrays) ──
  /** 商品视频 URL 列表 */
  videoUrls?: string[]
  /** 页面事实中的 SKU + 条形码标识列表。 */
  skuList: Array<{ sku: string; barcode: string }>
  /** 所有可售 SKU 及其完整变体组合。 */
  variants: ProductVariant[]
  /** 规格列表 [{weight_g, depth_mm, height_mm, width_mm, color, size, ...}] */
  specList: ProductSpec[]
  /** 关于商品、特征及 BCS 追加信息等可追溯事实。 */
  facts?: ProductFact[]
  /** 当前精确选中 SKU 的包装快照，便于后端在不猜测变体的情况下建草稿。 */
  packageFacts?: PackagePhysicalSnapshot
  /** 有明确 Ozon 属性 ID 的商品级/当前 SKU 级事实。 */
  ozonAttributeFacts?: OzonAttributeFact[]
  /** 从颜色事实和真实 SKU 变体维度汇总的颜色列表。 */
  colorList?: string[]
  /** 从平台明确的主题/风格/场景特征自动采集，可在选品页修正。 */
  tags?: string[]

  // ── 新增:Ozon 内部分类(从内部 API 获取) ──
  /** Ozon description_category_id */
  ozonCategoryId?: number
  /** Ozon type_id */
  ozonTypeId?: number

  /** Ozon 强制采集指标，按 docs/采集强制要求.md 固定输出 */
  ozonMetrics?: OzonMetrics

  // ── Ozon 物流采集字段 (docs/采集强制要求.md 推荐模型) ──
  warehouse?: string
  warehouseId?: string
  logisticsType?: string
  deliveryMethod?: string
  deliveryRegion?: string
  deliveryDays?: number

  /** 折扣文本 (如 -52%) */
  discount?: string
  /** 库存文本 (如 Осталось 5 штук) */
  stock?: string

  // ── 1688 专有字段 ──
  /** 阶梯价格 [{minQty, maxQty, price}] */
  priceRanges?: Array<{ minQty: number; maxQty: number; price: number }>
  /** 起订量 */
  minOrderQty?: number
  /** 供应商店铺 URL */
  supplierUrl?: string
  /** 成交量 */
  tradeQuantity?: number
}

export type RequiredProductField = 'skuList' | 'variants'

export interface ProductCompleteness {
  complete: boolean
  missing: RequiredProductField[]
}

export interface OzonMetrics {
  /** SKU */
  sku: string
  /** 货号 / Артикул */
  articleNumber: string
  brand: string
  category: string
  /** 促销活动 */
  promotions: string[]
  /** 付费推广 */
  paidPromotion: string
  /** 月销售额，RUB */
  monthlyRevenue: number
  /** 月销量 */
  monthlySales: number
  /** 周转动态 */
  turnoverDynamics: string
  /** 被跟数量 */
  followersCount: number
  minPrice: number
  maxPrice: number
  rfbsCommission: number
  fbpCommission: number
  /** 成交率，百分比数值 */
  conversionRate: number
  /** 体积，cm³ */
  volumeCm3: number
  lengthMm: number
  widthMm: number
  heightMm: number
  weightG: number
  /** 包装重量与包装长宽高，区别于 SKU 规格 */
  packageWeightG: number
  packageLengthMm: number
  packageWidthMm: number
  packageHeightMm: number
  /** 仓库/配送/物流模式 */
  warehouse: string
  warehouseId: string
  logisticsType: string
  deliveryMethod: string
  deliveryRegion: string
  deliveryDays: number
  /** 上架时间 */
  listedAt: string
  /** 当前页面/API 未能可靠命中的强制字段，便于后续补采排查 */
  missingFields: string[]
}

/** 单个平台的采集条件 */
export interface PlatformScrapingConfig {
  /** 价格区间 */
  priceMin: number
  priceMax: number
  /** 最低评分 */
  minRating: number
  /** 最低评价数量 */
  minReviews: number
  /** 品牌白名单 (仅采集这些品牌,空=不限) */
  brandWhitelist: string[]
  /** 品牌黑名单 (不采集这些品牌) */
  brandBlacklist: string[]
  /** 列表采集:最大采集数量 */
  maxItems: number
  /** 列表采集:每次滚动间隔 (ms) */
  scrollDelay: number
  /** 列表采集:每批次上报数量 (增量上报) */
  batchSize: number
}

/** 插件设置 */
export interface PluginSettings {
  /** 后端 API 地址 */
  apiBaseUrl: string
  /** 右下角面板工具运行模式；真实模式绝不回退到 MOCK。 */
  panelToolMode: 'mock' | 'real'
  /** ERP Web 根地址，必须由用户明确配置。 */
  erpBaseUrl: string
  /** 自动采集 */
  autoScrape: boolean
  /** Ozon 采集条件 */
  ozon: PlatformScrapingConfig
  /** Wildberries 采集条件 */
  wb: PlatformScrapingConfig
  /** 1688 采集条件 */
  '1688': PlatformScrapingConfig
  /** 拼多多采集条件 */
  pdd: PlatformScrapingConfig
}

export interface AuthUser {
  id: number
  email: string
  name?: string | null
}

export interface AuthSession {
  access_token: string
  token_type: string
  user: AuthUser
}

/** 列表采集的商品摘要(非完整商品数据) */
export interface ListProductSummary {
  platform: Platform
  sourceId: string
  title: string
  price: number
  oldPrice: number
  imageUrl: string
  rating: number
  reviewCount: number
  sourceUrl: string
  scrapedAt: string
}

const defaultPlatformConfig: PlatformScrapingConfig = {
  priceMin: 0,
  priceMax: 0,
  minRating: 0,
  minReviews: 0,
  brandWhitelist: [],
  brandBlacklist: [],
  maxItems: 50,
  scrollDelay: 1500,
  batchSize: 10,
}

export const DEFAULT_SETTINGS: PluginSettings = {
  apiBaseUrl: 'http://localhost:9000',
  panelToolMode: 'mock',
  erpBaseUrl: '',
  autoScrape: true,
  ozon: { ...defaultPlatformConfig },
  wb: { ...defaultPlatformConfig },
  '1688': { ...defaultPlatformConfig },
  pdd: { ...defaultPlatformConfig },
}
