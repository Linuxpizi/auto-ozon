import type { OzonSkuCardData } from './types'
import { skussLimiter } from '../ozonBatchCrawl/requestRateLimiter'
import { collectOzonSkuMetrics } from './ozonMetricCollector'
import { apiService } from '../../../utils/api'

export class OzonSkuLoadError extends Error {
  code?: number
  constructor(message: string, code?: number) {
    super(message)
    this.code = code
  }
}

function hasAggregateMetrics(data: OzonSkuCardData | null): data is OzonSkuCardData {
  if (!data) return false
  return Object.keys(data).some((key) => key !== 'article' && data[key] != null && data[key] !== '')
}

/**
 * 合并两个真实数据源：Ozon 商城公开商品资料，以及旧卡片一直使用的本地
 * /system/sku/skuss/new 聚合记录。聚合接口不可用时仍显示公开字段；绝不构造 0 或用评论数
 * 冒充展示量。
 */
export async function loadSkuData(sku: string): Promise<OzonSkuCardData> {
  // 沿用共享限流桶，避免快速滚动时突发请求触发 Ozon 风控。
  await skussLimiter.acquire()
  const [ozonResult, aggregateResult] = await Promise.allSettled([
    collectOzonSkuMetrics(sku),
    apiService.getSkuInfo(sku),
  ])

  const ozonData = ozonResult.status === 'fulfilled' ? ozonResult.value : null
  const aggregateResponse = aggregateResult.status === 'fulfilled' ? aggregateResult.value : null
  const aggregateData = aggregateResponse?.code === 200 && hasAggregateMetrics(aggregateResponse.data as OzonSkuCardData)
    ? aggregateResponse.data as OzonSkuCardData
    : null

  if (ozonData || aggregateData) {
    return {
      ...(ozonData || {}),
      ...(aggregateData || {}),
      article: aggregateData?.article ?? ozonData?.article ?? sku,
      metricSource: aggregateData ? 'ozon+local-aggregate' : 'ozon',
    }
  }

  const error = ozonResult.status === 'rejected' ? ozonResult.reason : null
  try {
    throw error || new Error('Ozon 商品指标采集失败')
  } catch (error) {
    const status = Number((error as { status?: unknown })?.status)
    if (status === 403 || status === 429) {
      throw new OzonSkuLoadError('频率过快', 403)
    }
    throw new OzonSkuLoadError(
      error instanceof Error ? error.message : 'Ozon 商品指标采集失败',
      Number.isFinite(status) && status > 0 ? status : undefined,
    )
  }
}
