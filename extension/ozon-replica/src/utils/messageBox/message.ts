/**
 * 全局 Message 提示（Element UI $message 风格）
 */
import { Z } from '../../content/styles/zIndex'

export type MessageType = 'success' | 'info' | 'warning' | 'error'

export interface MessageOptions {
  message: string
  type?: MessageType
  /** 显示时长（毫秒），默认 3000 */
  duration?: number
}

const STYLE_ID = 'mjgd_global_message_style'
const MESSAGE_CLASS = 'mjgd_global_message_item'

const TYPE_STYLES: Record<MessageType, { bg: string; border: string; color: string; icon: string }> = {
  success: { bg: '#f0f9eb', border: '#e1f3d8', color: '#67c23a', icon: '✓' },
  info: { bg: '#edf2fc', border: '#ebeef5', color: '#909399', icon: 'i' },
  warning: { bg: '#fdf6ec', border: '#faecd8', color: '#e6a23c', icon: '!' },
  error: { bg: '#fef0f0', border: '#fde2e2', color: '#f56c6c', icon: '×' },
}

let styleInjected = false

function injectStyles(): void {
  if (styleInjected || document.getElementById(STYLE_ID)) {
    styleInjected = true
    return
  }

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .mjgd_global_message_wrap {
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      z-index: ${Z.TOAST};
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      pointer-events: none;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    }
    .mjgd_global_message_item {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 280px;
      max-width: calc(100vw - 40px);
      padding: 10px 16px;
      border-radius: 4px;
      border: 1px solid;
      font-size: 14px;
      line-height: 1.4;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
      pointer-events: auto;
      animation: mjgd_global_message_in 0.25s ease;
    }
    @keyframes mjgd_global_message_in {
      from { opacity: 0; transform: translateY(-12px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .mjgd_global_message_icon {
      flex-shrink: 0;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 700;
      color: #fff;
      line-height: 1;
    }
    .mjgd_global_message_text {
      flex: 1;
      word-break: break-word;
    }
  `
  document.head.appendChild(style)
  styleInjected = true
}

function getMessageWrap(): HTMLDivElement {
  let wrap = document.getElementById('mjgd_global_message_wrap') as HTMLDivElement | null
  if (!wrap) {
    wrap = document.createElement('div')
    wrap.id = 'mjgd_global_message_wrap'
    wrap.className = 'mjgd_global_message_wrap'
    document.body.appendChild(wrap)
  }
  return wrap
}

function normalizeMessageOptions(input: string | MessageOptions, type?: MessageType): Required<MessageOptions> {
  const opts = typeof input === 'string' ? { message: input } : input
  return {
    message: opts.message,
    type: opts.type ?? type ?? 'info',
    duration: opts.duration ?? 3000,
  }
}

function showMessageItem(options: Required<MessageOptions>): void {
  injectStyles()
  const wrap = getMessageWrap()
  const theme = TYPE_STYLES[options.type]

  const item = document.createElement('div')
  item.className = MESSAGE_CLASS
  item.style.background = theme.bg
  item.style.borderColor = theme.border
  item.style.color = '#606266'

  const icon = document.createElement('span')
  icon.className = 'mjgd_global_message_icon'
  icon.style.backgroundColor = theme.color
  icon.textContent = theme.icon

  const text = document.createElement('span')
  text.className = 'mjgd_global_message_text'
  text.textContent = options.message

  item.append(icon, text)
  wrap.appendChild(item)

  const remove = () => {
    item.style.opacity = '0'
    item.style.transform = 'translateY(-8px)'
    item.style.transition = 'opacity 0.2s ease, transform 0.2s ease'
    setTimeout(() => item.remove(), 200)
  }

  if (options.duration > 0) {
    setTimeout(remove, options.duration)
  }
}

type MessageCallable = {
  (options: string | MessageOptions): void
  success: (message: string, duration?: number) => void
  info: (message: string, duration?: number) => void
  warning: (message: string, duration?: number) => void
  error: (message: string, duration?: number) => void
}

function createMessageFn(type?: MessageType): MessageCallable {
  const fn = ((input: string | MessageOptions) => {
    showMessageItem(normalizeMessageOptions(input, type))
  }) as MessageCallable

  fn.success = (message, duration) => showMessageItem(normalizeMessageOptions({ message, duration }, 'success'))
  fn.info = (message, duration) => showMessageItem(normalizeMessageOptions({ message, duration }, 'info'))
  fn.warning = (message, duration) => showMessageItem(normalizeMessageOptions({ message, duration }, 'warning'))
  fn.error = (message, duration) => showMessageItem(normalizeMessageOptions({ message, duration }, 'error'))

  return fn
}

/** 与 Element UI $message 调用方式一致，直接 import 使用 */
export const showMessage = createMessageFn()
