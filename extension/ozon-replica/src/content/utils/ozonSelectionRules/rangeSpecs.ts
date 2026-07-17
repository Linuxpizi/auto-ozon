import type { SelectionMatchContext, SelectionRangeSpec } from './types'
import {
  parsePackagingDimsFromCard,
  parsePackagingWeightFromCard,
} from '../ozonListShared/packagingParse'
import {
  getActiveCommissionPercent,
  getAvgPriceCny,
  getFollowMaxPriceCny,
  getFollowMinPriceCny,
  getFollowSellersValue,
  getListingDays,
  getMonthlyRevenueCny,
  getPriceCnyFromContext,
  getPriceRubFromContext,
  parseMonthlySalesNum,
  parseNum,
  parseSalesDynamicsNum,
} from './matchUtils'

/** 价格范围（人民币） */
export const SELECTION_PRICE_SPEC: SelectionRangeSpec = {
  minKey: 'priceMin',
  maxKey: 'priceMax',
  label: '价格',
  formLabel: '价格范围',
  inputId: 'price',
  unitPrefix: '¥',
  placeholderMin: '最小价格',
  placeholderMax: '最大价格',
  getValue(ctx) {
    if (ctx.exportCtx?.priceCny != null && Number.isFinite(ctx.exportCtx.priceCny)) {
      return ctx.exportCtx.priceCny
    }
    return getPriceCnyFromContext(ctx.priceText)
  },
}

/** 列表页可筛选数值维度（对齐旧版 BCS_SELECTION_RANGE_SPECS） */
export const SELECTION_RANGE_SPECS: SelectionRangeSpec[] = [
  {
    minKey: 'fbsCommissionMin',
    maxKey: 'fbsCommissionMax',
    label: 'FBS佣金',
    inputId: 'fbs_comm',
    unitSuffix: '%',
    getValue(ctx) {
      const priceRub =
        ctx.exportCtx?.priceRub != null && Number.isFinite(ctx.exportCtx.priceRub)
          ? ctx.exportCtx.priceRub
          : getPriceRubFromContext(ctx.priceText)
      return getActiveCommissionPercent(ctx.data.commission, 'fbs', priceRub)
    },
  },
  {
    minKey: 'fbpCommissionMin',
    maxKey: 'fbpCommissionMax',
    label: 'FBP佣金',
    inputId: 'fbp_comm',
    unitSuffix: '%',
    getValue(ctx) {
      const priceRub =
        ctx.exportCtx?.priceRub != null && Number.isFinite(ctx.exportCtx.priceRub)
          ? ctx.exportCtx.priceRub
          : getPriceRubFromContext(ctx.priceText)
      return getActiveCommissionPercent(ctx.data.commission, 'fbp', priceRub)
    },
  },
  {
    minKey: 'monthlySalesMin',
    maxKey: 'monthlySalesMax',
    label: '月销量',
    inputId: 'sales',
    getValue: (ctx) => parseMonthlySalesNum(ctx.data.monthsales),
  },
  {
    minKey: 'monthlyRevenueMin',
    maxKey: 'monthlyRevenueMax',
    label: '月销售额',
    inputId: 'revenue',
    unitPrefix: '¥',
    getValue: (ctx) => getMonthlyRevenueCny(ctx.data),
  },
  {
    minKey: 'salesDynamicsMin',
    maxKey: 'salesDynamicsMax',
    label: '月周转动态',
    inputId: 'dyn',
    unitSuffix: '%',
    getValue: (ctx) => parseSalesDynamicsNum(ctx.data.salesDynamics),
  },
  {
    minKey: 'adCostRatioMin',
    maxKey: 'adCostRatioMax',
    label: '广告费用占比',
    inputId: 'ad',
    unitSuffix: '%',
    getValue: (ctx) => parseNum(ctx.data.drr),
  },
  {
    minKey: 'promoDaysMin',
    maxKey: 'promoDaysMax',
    label: '参与促销天数',
    inputId: 'promo_days',
    unitSuffix: '天',
    getValue: (ctx) => parseNum(ctx.data.daysInPromo),
  },
  {
    minKey: 'promoDiscountMin',
    maxKey: 'promoDiscountMax',
    label: '参与促销的折扣',
    inputId: 'promo_discount',
    unitSuffix: '%',
    getValue: (ctx) => parseNum(ctx.data.discount),
  },
  {
    minKey: 'promoConversionMin',
    maxKey: 'promoConversionMax',
    label: '促销活动的转化率',
    inputId: 'promo_conv',
    unitSuffix: '%',
    getValue: (ctx) => parseNum(ctx.data.promoRevenueShare),
  },
  {
    minKey: 'paidPromoDaysMin',
    maxKey: 'paidPromoDaysMax',
    label: '付费推广天数',
    inputId: 'paid_promo',
    unitSuffix: '天',
    getValue: (ctx) => parseNum(ctx.data.daysWithTrafarets),
  },
  {
    minKey: 'followSellersMin',
    maxKey: 'followSellersMax',
    label: '跟卖卖家数',
    inputId: 'follow_sellers',
    skipIfNull: true,
    getValue: (ctx) => getFollowSellersValue(ctx.data, ctx.card),
  },
  {
    minKey: 'followMinPriceMin',
    maxKey: 'followMinPriceMax',
    label: '跟卖最低价',
    inputId: 'follow_min',
    unitPrefix: '¥',
    skipIfNull: true,
    getValue: (ctx) => getFollowMinPriceCny(ctx.data, ctx.card),
  },
  {
    minKey: 'followMaxPriceMin',
    maxKey: 'followMaxPriceMax',
    label: '跟卖最高价',
    inputId: 'follow_max',
    unitPrefix: '¥',
    skipIfNull: true,
    getValue: (ctx) => getFollowMaxPriceCny(ctx.data, ctx.card),
  },
  {
    minKey: 'cardViewsMin',
    maxKey: 'cardViewsMax',
    label: '商品卡浏览量',
    inputId: 'card_views',
    getValue: (ctx) => parseNum(ctx.data.sessioncount),
  },
  {
    minKey: 'cartRateMin',
    maxKey: 'cartRateMax',
    label: '商品卡加购率',
    inputId: 'cart_rate',
    unitSuffix: '%',
    getValue: (ctx) => parseNum(ctx.data.convTocartPdp),
  },
  {
    minKey: 'searchViewsMin',
    maxKey: 'searchViewsMax',
    label: '搜索目录浏览量',
    inputId: 'search_views',
    getValue: (ctx) => parseNum(ctx.data.sessionCountSearch),
  },
  {
    minKey: 'searchCartRateMin',
    maxKey: 'searchCartRateMax',
    label: '搜索目录加购率',
    inputId: 'search_cart',
    unitSuffix: '%',
    getValue: (ctx) => parseNum(ctx.data.convToCartSearchRate),
  },
  {
    minKey: 'totalViewsMin',
    maxKey: 'totalViewsMax',
    label: '商品展示总量',
    inputId: 'total_views',
    getValue: (ctx) => parseNum(ctx.data.views),
  },
  {
    minKey: 'viewConversionMin',
    maxKey: 'viewConversionMax',
    label: '展示转化率',
    inputId: 'view_conv',
    unitSuffix: '%',
    getValue: (ctx) => parseNum(ctx.data.convViewToOrder),
  },
  {
    minKey: 'clickRateMin',
    maxKey: 'clickRateMax',
    label: '商品点击率',
    inputId: 'click_rate',
    unitSuffix: '%',
    getValue: (ctx) => parseNum(ctx.data.goodsClickRate),
  },
  {
    minKey: 'returnRateMin',
    maxKey: 'returnRateMax',
    label: '退货取消率',
    inputId: 'return_rate',
    unitSuffix: '%',
    getValue: (ctx) => parseNum(ctx.data.returnCancelRate),
  },
  {
    minKey: 'volumeMin',
    maxKey: 'volumeMax',
    label: '体积',
    inputId: 'volume',
    unitSuffix: 'L',
    getValue: (ctx) => parseNum(ctx.data.volume),
  },
  {
    minKey: 'avgPriceMin',
    maxKey: 'avgPriceMax',
    label: '平均价格',
    inputId: 'avg_price',
    unitPrefix: '¥',
    getValue: (ctx) => getAvgPriceCny(ctx.data),
  },
  {
    minKey: 'lengthMin',
    maxKey: 'lengthMax',
    label: '长度',
    inputId: 'length',
    unitSuffix: 'mm',
    placeholderMin: '最小长度',
    placeholderMax: '最大长度',
    skipIfNull: true,
    getValue(ctx) {
      if (ctx.exportCtx?.lengthMm != null) return ctx.exportCtx.lengthMm
      if (ctx.card?.dataset.lengthMm) return parseNum(ctx.card.dataset.lengthMm)
      if (ctx.card) return parsePackagingDimsFromCard(ctx.card).length
      return null
    },
  },
  {
    minKey: 'widthMin',
    maxKey: 'widthMax',
    label: '宽度',
    inputId: 'width',
    unitSuffix: 'mm',
    placeholderMin: '最小宽度',
    placeholderMax: '最大宽度',
    skipIfNull: true,
    getValue(ctx) {
      if (ctx.exportCtx?.widthMm != null) return ctx.exportCtx.widthMm
      if (ctx.card?.dataset.widthMm) return parseNum(ctx.card.dataset.widthMm)
      if (ctx.card) return parsePackagingDimsFromCard(ctx.card).width
      return null
    },
  },
  {
    minKey: 'heightMin',
    maxKey: 'heightMax',
    label: '高度',
    inputId: 'height',
    unitSuffix: 'mm',
    placeholderMin: '最小高度',
    placeholderMax: '最大高度',
    skipIfNull: true,
    getValue(ctx) {
      if (ctx.exportCtx?.heightMm != null) return ctx.exportCtx.heightMm
      if (ctx.card?.dataset.heightMm) return parseNum(ctx.card.dataset.heightMm)
      if (ctx.card) return parsePackagingDimsFromCard(ctx.card).height
      return null
    },
  },
  {
    minKey: 'weightMin',
    maxKey: 'weightMax',
    label: '重量',
    inputId: 'weight',
    unitSuffix: 'g',
    placeholderMin: '最小重量',
    placeholderMax: '最大重量',
    skipIfNull: true,
    getValue(ctx) {
      if (ctx.exportCtx?.weightG != null) return ctx.exportCtx.weightG
      if (ctx.card?.dataset.weightG) return parseNum(ctx.card.dataset.weightG)
      if (ctx.card) return parsePackagingWeightFromCard(ctx.card)
      return null
    },
  },
  {
    minKey: 'listDaysMin',
    maxKey: 'listDaysMax',
    label: '上架时间',
    inputId: 'days',
    unitSuffix: '天',
    placeholderMin: '最小天数',
    placeholderMax: '最大天数',
    getValue: (ctx) => getListingDays(ctx.data.createDate),
  },
]

export const SELECTION_ALL_RANGE_SPECS: SelectionRangeSpec[] = [
  SELECTION_PRICE_SPEC,
  ...SELECTION_RANGE_SPECS,
]
