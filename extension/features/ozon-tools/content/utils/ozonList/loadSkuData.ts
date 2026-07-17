import { apiService } from '../../../utils/api'
import type { OzonSkuCardData } from './types'
import { skussLimiter } from '../ozonBatchCrawl/requestRateLimiter'

export class OzonSkuLoadError extends Error {
  code?: number
  constructor(message: string, code?: number) {
    super(message)
    this.code = code
  }
}

/** 拉取 SKU 销量/佣金等数据 */
export async function loadSkuData(sku: string): Promise<OzonSkuCardData> {
  // 与列表/详情贴卡共用同一限流桶，把突发平滑到服务端硬限之下，
  // 避免快速滚动 / 导出后补卡瞬时爆发触发服务端账号级 60s 限频锁。
  await skussLimiter.acquire()
  const res = await apiService.getSkuInfo(sku)
  if (res?.code === 200 && res.data) {
    return res.data as OzonSkuCardData
  }
  if (res?.code === 403) {
    throw new OzonSkuLoadError('频率过快', 403)
  }
  // 后端限频（账号级 60s 锁）可能以 429、或带「请求频率过快」文案、且数值落在 420–2000
  // 限流响应归一到与 403 相同的「频率过快」瞬时路径。
  const rateLimited =
    res?.code === 429 ||
    (typeof res?.msg === 'string' && /频率过快|请求过快|too\s*many/i.test(res.msg))
  if (rateLimited) {
    throw new OzonSkuLoadError('频率过快', 403)
  }
  throw new OzonSkuLoadError(res?.msg || '本地 API 返回错误', res?.code)
}
