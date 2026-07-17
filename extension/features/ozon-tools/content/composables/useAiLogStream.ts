/**
 * 用于流式渲染 AI 日志的 composable
 * 通过 requestAnimationFrame + insertAdjacentText 增量直写 DOM，避免大量 DOM 操作导致性能问题
 */

import { onUnmounted, watch, type Ref } from 'vue'

/** DOM 内保留的最大字符数，超出截断头部；fullText 仍保留完整内容供持久化 */
const MAX_DOM_CHARS = 512 * 1024
/** 距底部小于此像素视为「贴底」，自动滚动 */
const STICKY_BOTTOM_THRESHOLD = 48
/** 视口未挂载时 rAF 重试上限，避免 v-if 遮罩未渲染时无限循环 */
const MAX_STRUCTURED_FLUSH_ATTEMPTS = 120

export type AiLogLevelKey = 'info' | 'success' | 'warning' | 'error'

export interface AiLogStructuredLine {
  time: string
  level: string
  message: string
  levelKey?: AiLogLevelKey
  animated?: boolean
}

export interface AiLogStreamSink {
  reset: () => void
  appendDelta: (delta: string) => void
  appendLine: (line: string) => void
  appendStructuredLine: (line: AiLogStructuredLine) => void
  setFullText: (text: string) => void
  getFullText: () => string
}

export function useAiLogStream(viewportRef: Ref<HTMLElement | null>) {
  let fullText = ''
  let pendingText = ''
  let rafId: number | null = null
  let structuredRafId: number | null = null
  let structuredFlushAttempts = 0
  let stickToBottom = true
  let streamTextEl: HTMLElement | null = null
  const pendingStructuredLines: AiLogStructuredLine[] = []

  const getViewport = () => viewportRef.value

  /** 流式文本专用节点，与结构化行分离，避免 SSE 每条消息新建 DOM */
  const applyStreamWrapStyles = (block: HTMLElement, pre: HTMLElement) => {
    block.style.width = '100%'
    block.style.maxWidth = '100%'
    block.style.minWidth = '0'
    pre.style.margin = '0'
    pre.style.width = '100%'
    pre.style.maxWidth = '100%'
    pre.style.minWidth = '0'
    pre.style.whiteSpace = 'pre-wrap'
    pre.style.wordBreak = 'break-all'
    pre.style.overflowWrap = 'anywhere'
    pre.style.overflowX = 'hidden'
  }

  const ensureStreamTextEl = (container: HTMLElement): HTMLElement => {
    if (streamTextEl && streamTextEl.isConnected) return streamTextEl
    const block = document.createElement('div')
    block.className = 'mjgd_ai_log_stream_block'
    streamTextEl = document.createElement('pre')
    streamTextEl.className = 'mjgd_ai_log_stream_text'
    applyStreamWrapStyles(block, streamTextEl)
    block.appendChild(streamTextEl)
    container.appendChild(block)
    return streamTextEl
  }

  const isNearBottom = (el: HTMLElement) => {
    return el.scrollHeight - el.scrollTop - el.clientHeight <= STICKY_BOTTOM_THRESHOLD
  }

  const trimDomIfNeeded = (el: HTMLElement) => {
    while ((el.textContent?.length ?? 0) > MAX_DOM_CHARS && el.firstChild) {
      const first = el.firstChild as HTMLElement
      if (first.classList?.contains('mjgd_ai_log_stream_block') && streamTextEl?.textContent) {
        const overflow = (el.textContent?.length ?? 0) - MAX_DOM_CHARS
        if (overflow > 0 && streamTextEl.textContent.length > overflow) {
          streamTextEl.textContent = streamTextEl.textContent.slice(overflow)
        }
        break
      }
      el.removeChild(el.firstChild)
    }
  }

  const formatStructuredPlainLine = (line: AiLogStructuredLine) => {
    const suffix = line.animated ? ' ...' : ''
    return `[${line.time}] ${line.message}${suffix}`
  }

  const resolveLevelKey = (level: string, levelKey?: AiLogLevelKey): AiLogLevelKey => {
    if (levelKey) return levelKey
    const normalized = level.toLowerCase()
    if (normalized === 'success' || normalized === 'warning' || normalized === 'error') {
      return normalized
    }
    return 'info'
  }

  const scrollToBottomIfSticky = (el: HTMLElement) => {
    if (stickToBottom) {
      el.scrollTop = el.scrollHeight
    }
  }

  const renderStructuredLineToDom = (line: AiLogStructuredLine, el: HTMLElement) => {
    const levelKey = resolveLevelKey(line.level, line.levelKey)
    const item = document.createElement('div')
    item.className = `mjgd-ai-log-item mjgd-ai-log-${levelKey}`
    const timeSpan = document.createElement('span')
    timeSpan.className = 'mjgd-ai-log-time'
    timeSpan.textContent = `[${line.time}] `
    const contentSpan = document.createElement('span')
    contentSpan.className = line.animated ? 'mjgd-ai-log-content mjgd-ai-log-content--generating' : 'mjgd-ai-log-content'
    contentSpan.textContent = `${line.message}${line.animated ? ' ...' : ''}`
    item.appendChild(timeSpan)
    item.appendChild(contentSpan)
    el.appendChild(item)
  }

  const flushPendingStructuredLines = () => {
    structuredRafId = null
    if (pendingStructuredLines.length === 0) return
    const el = getViewport()
    if (!el) {
      if (structuredFlushAttempts++ < MAX_STRUCTURED_FLUSH_ATTEMPTS) {
        scheduleStructuredFlush()
      }
      return
    }
    structuredFlushAttempts = 0
    bindScrollListener()
    while (pendingStructuredLines.length > 0) {
      const line = pendingStructuredLines.shift()
      if (line) renderStructuredLineToDom(line, el)
    }
    trimDomIfNeeded(el)
    scrollToBottomIfSticky(el)
  }

  const scheduleStructuredFlush = () => {
    if (structuredRafId != null) return
    structuredRafId = requestAnimationFrame(flushPendingStructuredLines)
  }

  const flushPending = () => {
    rafId = null
    if (!pendingText) return
    const el = getViewport()
    const chunk = pendingText
    pendingText = ''
    fullText += chunk
    if (!el) return
    bindScrollListener()
    const textEl = ensureStreamTextEl(el)
    textEl.insertAdjacentText('beforeend', chunk)
    trimDomIfNeeded(el)
    scrollToBottomIfSticky(el)
  }

  const scheduleFlush = () => {
    if (rafId != null) return
    rafId = requestAnimationFrame(flushPending)
  }

  const bindScrollListener = () => {
    const el = getViewport()
    if (!el || el.dataset.aiLogScrollBound === '1') return
    el.dataset.aiLogScrollBound = '1'
    el.addEventListener('scroll', () => {
      stickToBottom = isNearBottom(el)
    }, { passive: true })
  }

  const reset = () => {
    if (rafId != null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
    if (structuredRafId != null) {
      cancelAnimationFrame(structuredRafId)
      structuredRafId = null
    }
    pendingText = ''
    pendingStructuredLines.length = 0
    structuredFlushAttempts = 0
    fullText = ''
    stickToBottom = true
    streamTextEl = null
    const el = getViewport()
    if (el) {
      el.replaceChildren()
      el.scrollTop = 0
    }
  }

  const appendDelta = (delta: string) => {
    if (!delta) return
    bindScrollListener()
    pendingText += delta
    scheduleFlush()
  }

  const appendLine = (line: string) => {
    if (!line) return
    appendDelta((fullText + pendingText) ? `\n${line}` : line)
  }

  const appendStructuredLine = (line: AiLogStructuredLine) => {
    if (!line.message && !line.animated) return
    const plainLine = formatStructuredPlainLine(line)
    fullText += fullText ? `\n${plainLine}` : plainLine
    pendingStructuredLines.push(line)
    scheduleStructuredFlush()
  }

  const setFullText = (text: string) => {
    if (rafId != null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
    if (structuredRafId != null) {
      cancelAnimationFrame(structuredRafId)
      structuredRafId = null
    }
    pendingText = ''
    pendingStructuredLines.length = 0
    structuredFlushAttempts = 0
    fullText = text
    stickToBottom = true
    streamTextEl = null
    const el = getViewport()
    if (el) {
      el.replaceChildren()
      if (text) {
        const textEl = ensureStreamTextEl(el)
        textEl.textContent = text
      }
      scrollToBottomIfSticky(el)
    }
  }

  const getFullText = () => fullText + pendingText

  // 日志遮罩 v-if 挂载后视口才可用，挂载时补刷队列中的结构化日志
  watch(viewportRef, (el) => {
    if (el && pendingStructuredLines.length > 0) {
      scheduleStructuredFlush()
    }
  })

  onUnmounted(() => {
    if (rafId != null) cancelAnimationFrame(rafId)
    if (structuredRafId != null) cancelAnimationFrame(structuredRafId)
  })

  const sink: AiLogStreamSink = { reset, appendDelta, appendLine, appendStructuredLine, setFullText, getFullText }

  return { sink, reset, appendDelta, appendLine, appendStructuredLine, setFullText, getFullText }
}
