// ═══════════════════════════════════════════════════════════════
//  拟人化操作工具库 — 模拟真实用户行为,避免 Ozon 反爬风控
// ═══════════════════════════════════════════════════════════════

/**
 * 随机延时 (毫秒),在 [min, max] 区间内均匀分布
 * 用于替代固定延时,让操作间隔不可预测
 */
export function randomDelay(min: number, max: number): Promise<void> {
  const ms = min + Math.random() * (max - min)
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * 正态分布随机延时 (Box-Muller)
 * 大部分值集中在 mean 附近,偶尔出现较长延时
 * 更贴近真人操作:大部分操作差不多快,偶尔走神
 */
export function normalDelay(mean: number, stddev: number): Promise<void> {
  const u = 1 - Math.random()
  const v = Math.random()
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
  const ms = Math.max(0, mean + z * stddev)
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * 模拟人类的"微停顿" — 操作之间的短暂停留
 * 用于在采集过程中的小动作之间插入自然停顿
 */
export function microPause(): Promise<void> {
  return randomDelay(200, 600)
}

/**
 * 模拟真人的阅读停顿 — 在页面内容变化后
 * 仿佛用户在快速扫一眼新内容
 */
export function readingPause(): Promise<void> {
  // 真人快速扫一眼内容约 0.5~1.5 秒
  return randomDelay(500, 1500)
}

/**
 * 模拟"打了个哈欠"的长停顿 — 偶尔插入一次较长的停顿
 * 约 15% 的概率触发 3~6 秒的长停顿
 */
export async function occasionalLongPause(): Promise<void> {
  if (Math.random() < 0.15) {
    await randomDelay(3000, 6000)
  }
}

// ═══════════════════════════════════════════════════════════════
//  拟人化滚动 — 模拟真实用户的滚动行为
// ═══════════════════════════════════════════════════════════════

/** 滚动速度配置 (每帧像素) */
interface ScrollProfile {
  /** 每帧滚动的像素范围 [min, max] */
  pixelsPerFrame: [number, number]
  /** 每帧间隔 (ms) 范围 */
  frameInterval: [number, number]
  /** 总共滚动多少帧 */
  totalFrames: number
}

/**
 * 根据目标距离计算一个自然的滚动配置
 * 短距离快速滚,长距离分多段慢滚
 */
function buildScrollProfile(distance: number): ScrollProfile {
  if (distance < 400) {
    // 短距离:快速滚 2~3 帧
    return { pixelsPerFrame: [200, 350], frameInterval: [30, 60], totalFrames: 2 + Math.floor(Math.random() * 2) }
  }
  if (distance < 1000) {
    // 中距离:3~5 帧
    return { pixelsPerFrame: [200, 400], frameInterval: [35, 80], totalFrames: 3 + Math.floor(Math.random() * 3) }
  }
  // 长距离:分段滚动,中间可能加速或减速
  return { pixelsPerFrame: [150, 350], frameInterval: [25, 70], totalFrames: 4 + Math.floor(Math.random() * 4) }
}

/**
 * 拟人化滚动指定距离
 * - 分多帧滚动,每帧距离和间隔有随机波动
 * - 偶尔会有微小的回滚 (模拟手滑)
 * - 开始和结束有减速效果
 */
export async function humanScroll(distance: number): Promise<void> {
  if (distance <= 0) return

  const profile = buildScrollProfile(distance)
  let remaining = distance

  for (let frame = 0; frame < profile.totalFrames && remaining > 0; frame++) {
    // 帧内随机滚动量
    const [minPx, maxPx] = profile.pixelsPerFrame
    const px = Math.min(remaining, minPx + Math.random() * (maxPx - minPx))

    window.scrollBy(0, px)
    remaining -= px

    // 帧间延时,带随机波动
    const [minInterval, maxInterval] = profile.frameInterval
    await randomDelay(minInterval, maxInterval)
  }

  // 模拟手滑回滚:约 10% 概率回滚一小段
  if (Math.random() < 0.10) {
    const backtrack = 20 + Math.random() * 60
    window.scrollBy(0, -backtrack)
    await randomDelay(80, 200)
    // 再滚回来
    window.scrollBy(0, backtrack)
    await randomDelay(50, 150)
  }
}

/**
 * 拟人化滚动到指定位置 (scrollTo)
 * 使用平滑滚动 + 随机速度
 */
export async function humanScrollTo(targetY: number): Promise<void> {
  const currentY = window.scrollY
  const distance = targetY - currentY
  if (Math.abs(distance) < 10) return

  await humanScroll(distance)
}

/**
 * 拟人化滚动回顶部
 * 不是一口气滚上去,而是分段滚
 */
export async function humanScrollToTop(): Promise<void> {
  const startY = window.scrollY
  if (startY < 10) return

  // 分 2~4 段滚回
  const segments = 2 + Math.floor(Math.random() * 3)
  const segmentSize = startY / segments

  for (let i = 0; i < segments; i++) {
    const dist = Math.min(segmentSize, window.scrollY)
    if (dist <= 0) break
    await humanScroll(-dist)
    await randomDelay(100, 300)
  }

  // 最终精确滚到 0
  window.scrollTo(0, 0)
}

/**
 * 拟人化滚动到底部
 */
export async function humanScrollToBottom(): Promise<void> {
  const target = document.documentElement.scrollHeight
  await humanScrollTo(target)
}

// ═══════════════════════════════════════════════════════════════
//  拟人化鼠标/点击 — 模拟真实用户的鼠标行为
// ═══════════════════════════════════════════════════════════════

/**
 * 模拟鼠标移动到元素附近 (通过派发 mouseenter/mouseover 事件)
 * 注意:不使用 CDP mouse.moveTo,因为 content script 无法控制真实鼠标
 * 而是派发 DOM 事件让网站的交互检测 (hover 效果) 正常触发
 */
export function simulateHover(el: HTMLElement): void {
  const rect = el.getBoundingClientRect()
  const x = rect.left + Math.random() * rect.width
  const y = rect.top + Math.random() * rect.height

  const commonProps = {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    screenX: x + window.screenX,
    screenY: y + window.screenY,
  }

  el.dispatchEvent(new MouseEvent('mouseenter', commonProps))
  el.dispatchEvent(new MouseEvent('mouseover', { ...commonProps, button: 0 }))
}

/**
 * 模拟鼠标移出元素
 */
export function simulateMouseLeave(el: HTMLElement): void {
  const rect = el.getBoundingClientRect()
  el.dispatchEvent(new MouseEvent('mouseleave', {
    bubbles: true,
    cancelable: true,
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height + 5,
  }))
  el.dispatchEvent(new MouseEvent('mouseout', {
    bubbles: true,
    cancelable: true,
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height + 5,
  }))
}

/**
 * 拟人化点击 — 在点击前模拟 hover,点击后有微小延时
 * 用于"展开更多"等交互按钮
 */
export async function humanClick(el: HTMLElement): Promise<void> {
  // 先 hover 一下
  simulateHover(el)
  await randomDelay(100, 300)

  // 移动鼠标到元素中心 (在元素范围内随机偏移)
  const rect = el.getBoundingClientRect()
  const x = rect.left + rect.width * (0.3 + Math.random() * 0.4)
  const y = rect.top + rect.height * (0.3 + Math.random() * 0.4)

  // 派发完整的鼠标事件序列
  const opts: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: x,
    clientY: y,
    screenX: x + window.screenX,
    screenY: y + window.screenY,
    button: 0,
    buttons: 1,
  }

  el.dispatchEvent(new MouseEvent('mousedown', opts))
  await randomDelay(50, 120)
  el.dispatchEvent(new MouseEvent('mouseup', opts))
  el.dispatchEvent(new MouseEvent('click', opts))

  // 点击后的自然停顿
  await randomDelay(100, 300)
}

/**
 * 拟人化导航链接点击 — 用于分页等
 * 模拟:移动到链接 → 停顿 → 按下 → 松开
 */
export async function humanLinkClick(el: HTMLElement): Promise<void> {
  simulateHover(el)
  await randomDelay(150, 400)

  // 触发 focus (链接会获得焦点)
  el.dispatchEvent(new FocusEvent('focus', { bubbles: true }))
  await randomDelay(50, 150)

  // 模拟 mousedown → mouseup → click
  const rect = el.getBoundingClientRect()
  const x = rect.left + rect.width * (0.2 + Math.random() * 0.6)
  const y = rect.top + rect.height * (0.2 + Math.random() * 0.6)

  el.dispatchEvent(new MouseEvent('mousedown', {
    bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0, buttons: 1,
  }))
  await randomDelay(60, 180)
  el.dispatchEvent(new MouseEvent('mouseup', {
    bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0,
  }))
  el.dispatchEvent(new MouseEvent('click', {
    bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0,
  }))
}

// ═══════════════════════════════════════════════════════════════
//  拟人化 Fetch 请求 — 模拟真实浏览器的网络请求特征
// ═══════════════════════════════════════════════════════════════

/**
 * 拟人化 fetch — 添加随机的请求头变体和延时
 * 模拟真实浏览器发起 API 请求的特征
 */
export async function humanFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  // 请求前的微停顿 (模拟网络延迟的不可预测性)
  await randomDelay(80, 300)

  const defaultHeaders: Record<string, string> = {
    'accept': 'application/json, text/plain, */*',
    'accept-language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
    'x-requested-with': 'XMLHttpRequest',
  }

  // 随机添加一些常见的浏览器头
  if (Math.random() < 0.4) {
    defaultHeaders['sec-fetch-dest'] = 'empty'
    defaultHeaders['sec-fetch-mode'] = 'cors'
    defaultHeaders['sec-fetch-site'] = 'same-origin'
  }
  if (Math.random() < 0.3) {
    defaultHeaders['referer'] = url.split('?')[0]
  }

  return fetch(url, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...(options.headers as Record<string, string> || {}),
    },
    credentials: 'include',
  })
}

// ═══════════════════════════════════════════════════════════════
//  拟人化采集节奏 — 控制整个采集过程的节奏
// ═══════════════════════════════════════════════════════════════

/**
 * 采集阶段之间的过渡延时
 * 从滚动采集切换到补全详情时,模拟用户切换操作的间隔
 */
export async function transitionPause(): Promise<void> {
  // 真人切换操作模式一般需要 1~3 秒
  await randomDelay(1000, 3000)
}

/**
 * 批次之间的过渡延时
 * 每批商品采集完毕后,停顿一下再开始下一批
 */
export async function batchTransitionPause(): Promise<void> {
  // 偶尔来个长停顿
  if (Math.random() < 0.2) {
    await randomDelay(2000, 5000)
  } else {
    await randomDelay(800, 2000)
  }
}

/**
 * API 请求之间的延时 — 带渐进加速
 * 模拟真人的行为:开始时比较谨慎(慢),逐渐找到节奏后加速
 * @param index 当前是第几个请求 (0-based)
 * @param total 总请求数
 * @param baseMin 基础最小延时 (ms)
 * @param baseMax 基础最大延时 (ms)
 */
export async function enrichDelay(
  index: number,
  total: number,
  baseMin = 1500,
  baseMax = 3500,
): Promise<void> {
  // 渐进加速:前几个请求间隔较长,后面逐渐缩短到基础值
  const progress = total > 1 ? index / (total - 1) : 1
  const warmupFactor = 1.5 - 0.5 * progress // 从 1.5x 降到 1x

  const min = Math.round(baseMin * warmupFactor)
  const max = Math.round(baseMax * warmupFactor)

  // 15% 概率额外等待更久 (模拟用户切到别的窗口又回来)
  const extraWait = Math.random() < 0.15 ? randomDelay(2000, 5000) : Promise.resolve()

  await Promise.all([randomDelay(min, max), extraWait])

  // 偶尔加入一次"打字停顿" (3% 概率等 6~12 秒,模拟用户在打字或做别的事)
  if (Math.random() < 0.03) {
    await randomDelay(6000, 12000)
  }
}

/**
 * 滚动之间的延时 — 带波动
 * 真人滚屏不会完全匀速,每次滚动后的停顿也不同
 * @param baseDelay 基础延时 (ms)
 */
export async function scrollPause(baseDelay: number): Promise<void> {
  // 在基础延时上加减 30% 的波动
  const min = Math.round(baseDelay * 0.7)
  const max = Math.round(baseDelay * 1.3)
  await randomDelay(min, max)
}
