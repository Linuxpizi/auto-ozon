/**
 * 按接口共享的「最小间隔」限流器。
 *
 * 把某个后端接口的请求平滑到「每 minInterval 放行一个」——严格无突发，比令牌桶更贴合
 * 服务端「每秒 N 次」的硬限。Clawler 接口仅服务批量导出 enrichment。
 *
 * 服务端硬限：shopsClawler(重量) 15/s、newClawler(销量) 20/s。默认取略低于上限的安全
 * 速率；导出时按速度模式临时下调（steady 最慢），结束后复位。
 */

export class RateLimiterCancelled extends Error {
  constructor() {
    super('rate-limiter-cancelled')
    this.name = 'RateLimiterCancelled'
  }
}

interface Waiter {
  resolve: () => void
  reject: (err: Error) => void
  shouldCancel?: () => boolean
}

export class RateLimiter {
  private minIntervalMs: number
  /** 下一个可放行时刻（epoch ms） */
  private nextAt = 0
  private waiters: Waiter[] = []
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(ratePerSec: number) {
    this.minIntervalMs = ratePerSec > 0 ? 1000 / ratePerSec : 0
  }

  /** 动态调整速率：导出按速度模式设定，结束后复位到默认安全值 */
  setRate(ratePerSec: number): void {
    this.minIntervalMs = ratePerSec > 0 ? 1000 / ratePerSec : 0
  }

  /**
   * 取一个发射时隙。到点放行前会再查一次 shouldCancel：命中则丢弃该请求
   * （既不真正发出、也不占用发射时隙），实现「取消联动」——导出中止后排队中的
   * 请求不会继续消耗服务端配额。
   */
  acquire(shouldCancel?: () => boolean): Promise<void> {
    if (shouldCancel?.()) return Promise.reject(new RateLimiterCancelled())
    return new Promise<void>((resolve, reject) => {
      this.waiters.push({ resolve, reject, shouldCancel })
      this.schedule()
    })
  }

  private schedule(): void {
    if (this.timer || this.waiters.length === 0) return
    const wait = Math.max(0, this.nextAt - Date.now())
    this.timer = setTimeout(() => {
      this.timer = null
      this.grantOne()
      this.schedule()
    }, wait)
  }

  private grantOne(): void {
    while (this.waiters.length) {
      const w = this.waiters.shift() as Waiter
      // 已取消的排队者直接丢弃，不占用发射时隙（下一个有效请求可立即放行）
      if (w.shouldCancel?.()) {
        w.reject(new RateLimiterCancelled())
        continue
      }
      this.nextAt = Date.now() + this.minIntervalMs
      w.resolve()
      return
    }
  }
}

/** 导出 enrichment 使用的默认安全速率（略低于服务端硬限） */
export const SHOPS_CLAWLER_DEFAULT_RATE = 13
export const NEW_CLAWLER_DEFAULT_RATE = 16

/** shopsClawler(重量)：仅批量导出 enrichment 使用 */
export const shopsClawlerLimiter = new RateLimiter(SHOPS_CLAWLER_DEFAULT_RATE)
/** newClawler(销量)：仅导出使用 */
export const newClawlerLimiter = new RateLimiter(NEW_CLAWLER_DEFAULT_RATE)

/**
 * skuss/new(列表/详情卡主数据 getSkuInfo)：以前该接口无客户端限流，只有「同时在途 3 个」，
 * 快速滚动到顶 / 导出结束后补卡会瞬时爆发，触发服务端账号级 60s 限频锁 → 整片卡片被限频。
 * 这里给它套一个共享最小间隔桶，把突发抹平成稳定速率（取略低于服务端硬限的安全值）。
 * 列表贴卡与详情贴卡共用同一实例，两条路径叠加也不会超过服务端上限。
 */
export const SKUSS_DEFAULT_RATE = 15
export const skussLimiter = new RateLimiter(SKUSS_DEFAULT_RATE)
