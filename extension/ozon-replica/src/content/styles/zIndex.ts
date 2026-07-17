/** 插件 UI 层级常量，基准 800000，避免被宿主站点元素覆盖 */
export const Z = {
  WIDGET_FLOAT: 800000,
  WIDGET_DIALOG: 800010,
  PAGE_INJECT: 800050,
  MODAL_TIER_1: 800100,
  MODAL_TIER_2: 800110,
  /** AI 采集工作台：高于自动选品相关弹窗 */
  MODAL_TIER_COLLECT: 800115,
  MODAL_NESTED: 800120,
  MODAL_INNER: 800130,
  POPPER: 800200,
  CATEGORY_DIALOG: 800210,
  RICH_EDITOR: 800220,
  PROFIT_MASK: 809900,
  PROFIT_DRAWER: 809901,
  /** 全局确认弹窗：高于业务弹窗，便于在任何页面层级唤起 */
  CONFIRM: 809995,
  TOAST: 809990,
} as const

export type ZIndexKey = keyof typeof Z
