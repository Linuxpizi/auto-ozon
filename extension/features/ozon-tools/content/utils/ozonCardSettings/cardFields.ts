/** Ozon 列表/详情卡片可配置字段（对齐旧版 BCS_CARD_FIELDS） */
export interface CardFieldDef {
  key: string
  label: string
}

export const CARD_FIELD_DEFS: CardFieldDef[] = [
  { key: 'sku', label: 'SKU' },
  { key: 'article', label: '货号' },
  { key: 'brand', label: '品牌' },
  { key: 'category', label: '类目' },
  { key: 'fbsCommission', label: 'FBS佣金' },
  { key: 'fbpCommission', label: 'FBP佣金' },
  { key: 'monthlySales', label: '月销量' },
  { key: 'monthlyRevenue', label: '月销售额' },
  { key: 'salesDynamics', label: '月周转动态' },
  { key: 'adCostRatio', label: '广告费用占比' },
  { key: 'promoDays', label: '参与促销天数' },
  { key: 'promoDiscount', label: '参与促销的折扣' },
  { key: 'promoConversion', label: '促销活动的转化率' },
  { key: 'paidPromoDays', label: '付费推广天数' },
  { key: 'followSellers', label: '跟卖列表/卖家数' },
  { key: 'followMinPrice', label: '跟卖最低价' },
  { key: 'followMaxPrice', label: '跟卖最高价' },
  { key: 'cardViews', label: '商品卡浏览量' },
  { key: 'cartRate', label: '商品卡加购率' },
  { key: 'searchViews', label: '搜索目录浏览量' },
  { key: 'searchCartRate', label: '搜索目录加购率' },
  { key: 'totalViews', label: '商品展示总量' },
  { key: 'viewConversion', label: '展示转化率' },
  { key: 'clickRate', label: '商品点击率' },
  { key: 'shipMode', label: '发货模式' },
  { key: 'returnRate', label: '退货取消率' },
  { key: 'volume', label: '体积' },
  { key: 'avgPrice', label: '平均价格' },
  { key: 'dimensions', label: '长 宽 高' },
  { key: 'weight', label: '重量' },
  { key: 'listDate', label: '上架时间' },
  { key: 'shopId', label: '店铺ID' },
  { key: 'corpName', label: '公司名称' },
  { key: 'subjectTags', label: '主题标签' },
]

/** 列表页偏好设置中不展示的字段（对齐旧版 LIST_PAGE_HIDDEN_FIELDS） */
export const LIST_PAGE_HIDDEN_FIELD_KEYS = new Set(['shopId', 'corpName', 'subjectTags'])

/**
 * 旧构建键名兼容映射：早期版本曾把长宽高/重量字段命名为 packagingDims/packagingWeight，
 * 与旧版/后端的规范键 dimensions/weight 不一致。读取偏好时归一化，避免残留脏键。
 */
export const CARD_FIELD_KEY_ALIASES: Record<string, string> = {
  packagingDims: 'dimensions',
  packagingWeight: 'weight',
}

export interface CardFieldConfigItem {
  key: string
  visible: boolean
}

export interface CardFieldConfig {
  fields: CardFieldConfigItem[]
}

export function buildDefaultCardFieldConfig(): CardFieldConfig {
  return {
    fields: CARD_FIELD_DEFS.map((f) => ({ key: f.key, visible: true })),
  }
}

export function cardFieldLabel(key: string): string {
  return CARD_FIELD_DEFS.find((f) => f.key === key)?.label || key
}

/** 归一化后端 visible/show/enabled 多种写法，仅显式 false 视为关闭 */
export function parseCardFieldVisible(value: unknown): boolean {
  if (value === false || value === 0 || value === '0' || value === 'false') return false
  return true
}
