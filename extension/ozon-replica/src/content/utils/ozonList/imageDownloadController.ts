/**
 * 商品图下载 — 状态机 / 订阅 / 取消（对齐 crawlStorage 的订阅-快照模式）
 *
 * 与爬取遮罩相反：完成后自动关闭，取消后立即清空、不保留半成品。
 * 用递增的 sessionId 作废在途异步：取消/重开即 bump，抓图循环据此 shouldCancel。
 */

export type ImageDownloadPhase =
  | 'idle'
  | 'loading_variants'
  | 'downloading_images'
  | 'packing'
  | 'done'
  | 'cancelled'
  | 'error'

export type ImageDownloadMode = 'variant' | 'all'

export interface ImageDownloadSnapshot {
  visible: boolean
  phase: ImageDownloadPhase
  mode: ImageDownloadMode
  variantCurrent: number
  variantTotal: number
  imageCurrent: number
  imageTotal: number
  errorText: string
  canRetry: boolean
}

let visible = false
let phase: ImageDownloadPhase = 'idle'
let mode: ImageDownloadMode = 'variant'
let variantCurrent = 0
let variantTotal = 0
let imageCurrent = 0
let imageTotal = 0
let errorText = ''
let canRetry = false

/** 递增的会话号：取消 / 重开 / 关闭都会 bump，使旧会话的在途异步失效 */
let sessionId = 0
let lastRetry: (() => void) | null = null
let autoCloseTimer: number | null = null

/** 当前会话绑定的 MAIN 世界 progressScopeId（取消/新开会话时通知 MAIN 作废） */
let activeProgressScopeId: string | null = null
const sessionCleanups: Array<() => void> = []

const listeners = new Set<() => void>()

function runSessionCleanups(): void {
  const fns = sessionCleanups.splice(0)
  fns.forEach((fn) => {
    try {
      fn()
    } catch {
      /* ignore */
    }
  })
}

/** 绑定 MAIN 世界 prefetch 进度 scope（与 session token 一致） */
export function bindImageDownloadProgressScope(scopeId: string | null): void {
  activeProgressScopeId = scopeId
}

export function getActiveImageDownloadProgressScope(): string | null {
  return activeProgressScopeId
}

/** 注册本会话取消时需执行的清理（如 offProgress、AbortController） */
export function registerImageDownloadCleanup(cleanup: () => void): void {
  sessionCleanups.push(cleanup)
}

function notify() {
  listeners.forEach((fn) => fn())
}

function clearAutoCloseTimer() {
  if (autoCloseTimer != null) {
    window.clearTimeout(autoCloseTimer)
    autoCloseTimer = null
  }
}

function resetState() {
  phase = 'idle'
  variantCurrent = 0
  variantTotal = 0
  imageCurrent = 0
  imageTotal = 0
  errorText = ''
  canRetry = false
}

export function subscribeImageDownload(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getImageDownloadSnapshot(): ImageDownloadSnapshot {
  return {
    visible,
    phase,
    mode,
    variantCurrent,
    variantTotal,
    imageCurrent,
    imageTotal,
    errorText,
    canRetry,
  }
}

/** 当前阶段内的进度百分比（每阶段独立 0～100，避免切阶段时条跳到中间） */
export function computePhasePercent(s: ImageDownloadSnapshot): number {
  if (s.phase === 'done') return 100
  if (s.phase === 'packing') return 99
  if (s.phase === 'loading_variants') {
    if (s.variantTotal > 0) {
      return Math.round(Math.min(1, s.variantCurrent / s.variantTotal) * 99)
    }
    return 0
  }
  if (s.phase === 'downloading_images') {
    if (s.imageTotal > 0) {
      return Math.round(Math.min(1, s.imageCurrent / s.imageTotal) * 99)
    }
    return 0
  }
  return 0
}

/** 开新会话：显示遮罩、进入阶段1，返回本次会话 token */
export function startImageDownloadSession(nextMode: ImageDownloadMode): number {
  clearAutoCloseTimer()
  runSessionCleanups()
  sessionId++
  mode = nextMode
  visible = true
  resetState()
  phase = 'loading_variants'
  lastRetry = null
  notify()
  return sessionId
}

/** token 是否仍是当前会话（取消/重开后旧 token 失效） */
export function isActiveSession(token: number): boolean {
  return token === sessionId
}

/** 供抓图循环使用：非当前会话即视为已取消 */
export function isCancelled(token: number): boolean {
  return token !== sessionId
}

export function setVariantProgress(token: number, current: number, total: number): void {
  if (!isActiveSession(token)) return
  variantCurrent = current
  variantTotal = total
  notify()
}

export function enterDownloadingImages(token: number, total: number): void {
  if (!isActiveSession(token)) return
  phase = 'downloading_images'
  imageCurrent = 0
  imageTotal = total
  notify()
}

export function setImageProgress(token: number, current: number, total: number): void {
  if (!isActiveSession(token)) return
  imageCurrent = current
  imageTotal = total
  notify()
}

export function enterPacking(token: number): void {
  if (!isActiveSession(token)) return
  phase = 'packing'
  notify()
}

/** 完成：显示「下载完成」约 0.9s 后自动关闭并重置（不需用户点关闭） */
export function finishImageDownloadSession(token: number): void {
  if (!isActiveSession(token)) return
  phase = 'done'
  notify()
  clearAutoCloseTimer()
  const finishedSession = sessionId
  autoCloseTimer = window.setTimeout(() => {
    if (sessionId !== finishedSession) return
    visible = false
    resetState()
    notify()
  }, 900)
}

/** 失败：停在 error 态，展示「关闭」（+可选「重试」）。 */
export function failImageDownloadSession(token: number, message: string, retry?: () => void): void {
  if (!isActiveSession(token)) return
  clearAutoCloseTimer()
  phase = 'error'
  errorText = message || '下载失败'
  lastRetry = retry || null
  canRetry = !!retry
  notify()
}

/** 取消：立即作废在途、清空并关闭遮罩（与爬取相反，不保留半成品）。 */
export function cancelImageDownload(): void {
  clearAutoCloseTimer()
  runSessionCleanups()
  sessionId++ // 作废在途会话
  lastRetry = null
  visible = false
  resetState()
  phase = 'cancelled'
  notify()
  // cancelled 仅作为一次性信号，随即回到 idle（遮罩已隐藏）
  phase = 'idle'
}

/** 关闭遮罩（error 态的「关闭」按钮）：清空并隐藏。 */
export function closeImageDownloadOverlay(): void {
  clearAutoCloseTimer()
  runSessionCleanups()
  sessionId++
  lastRetry = null
  visible = false
  resetState()
  notify()
}

/** 重试（error 态的「重试」按钮）：重跑上次入口。 */
export function retryImageDownload(): void {
  const retry = lastRetry
  if (retry) retry()
}
