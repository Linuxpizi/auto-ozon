export interface MpChartItem {
  LastDate?: string
  firstDate?: string
  pricesGraph?: number[]
  ordersGraph?: number[]
  Orders?: number[]
  searchVisibilityGraph?: number[]
  rubricsGraph?: number[]
  countGraph?: number[]
}

export interface MpChartApiResponse {
  code?: number
  msg?: string
  data?: {
    items?: Record<string, MpChartItem>
  }
}