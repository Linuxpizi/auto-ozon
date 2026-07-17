export type OzonCardScalar = string | number | null

/** Ozon 不同价格档位下的履约佣金。接口可能省略任意档位。 */
export interface OzonSkuCommission {
  rfbs1500?: OzonCardScalar
  rfbs1500To5000?: OzonCardScalar
  rfbsGreater5000?: OzonCardScalar
  fbp1500?: OzonCardScalar
  fbp1500To5000?: OzonCardScalar
  fbpGreater5000?: OzonCardScalar
  [key: string]: unknown
}

/**
 * 商品卡片接口数据。
 *
 * 列表、详情和 Excel 导出会渐进式合并不同接口的响应，因此所有字段均为可选，
 * 并保留扩展字段以兼容 Ozon 响应的增量变化。
 */
export interface OzonSkuCardData {
  article?: OzonCardScalar
  brand?: string | null
  catname?: OzonCardScalar
  monthsales?: OzonCardScalar
  gmvSum?: OzonCardScalar
  salesDynamics?: OzonCardScalar
  drr?: OzonCardScalar
  daysInPromo?: OzonCardScalar
  discount?: OzonCardScalar
  promoRevenueShare?: OzonCardScalar
  daysWithTrafarets?: OzonCardScalar
  gnumber?: OzonCardScalar
  priceMin?: OzonCardScalar
  priceMax?: OzonCardScalar
  priceMinSku?: string | number
  priceMaxSku?: string | number
  sessioncount?: OzonCardScalar
  convTocartPdp?: OzonCardScalar
  sessionCountSearch?: OzonCardScalar
  convToCartSearchRate?: OzonCardScalar
  views?: OzonCardScalar
  convViewToOrder?: OzonCardScalar
  goodsClickRate?: OzonCardScalar
  sources?: string | null
  returnCancelRate?: OzonCardScalar
  volume?: OzonCardScalar
  avgprice?: OzonCardScalar
  createDate?: string
  commission?: OzonSkuCommission | null
  [key: string]: unknown
}

/** 扫描 Ozon 列表或详情页货架后得到的待增强商品。 */
export interface OzonListProductItem {
  sku: string
  href: string
  anchor: HTMLAnchorElement
  host: HTMLElement
  img?: string
  priceText: string
}