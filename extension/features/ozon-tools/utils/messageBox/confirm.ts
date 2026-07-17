/**
 * 全局确认弹窗工具
 * 纯 DOM 实现，无需引入 Vue 组件，一行 await 即可调用
 *
 * @example
 * if (await showConfirm('此操作将永久删除该文件, 是否继续?')) { ... }
 */
import { Z } from '../../content/styles/zIndex'

export type ConfirmType = 'warning' | 'info' | 'error' | 'success'

export interface ConfirmOptions {
  /** 标题，默认「提示」 */
  title?: string
  /** 正文内容 */
  message: string
  /** 确定按钮文案，默认「确定」 */
  confirmText?: string
  /** 取消按钮文案，默认「取消」 */
  cancelText?: string
  /** 是否显示取消按钮，默认 true；仅提示时可设为 false */
  showCancelButton?: boolean
  /** 图标类型，默认 warning */
  type?: ConfirmType
  /** 点击遮罩是否关闭，默认 false */
  closeOnClickOverlay?: boolean
}

/** Element UI MessageBox.confirm 第三参数 */
export interface ElementConfirmOptions {
  confirmButtonText?: string
  cancelButtonText?: string
  type?: ConfirmType
  /** 与 Element UI closeOnClickModal 对齐 */
  closeOnClickModal?: boolean
  closeOnClickOverlay?: boolean
}

export type MessageBoxConfirmFn = (
  message: string,
  title?: string,
  options?: ElementConfirmOptions
) => Promise<void>

const CONFIRM_ROOT_ID = 'mjgd_global_confirm_root'
const STYLE_ID = 'mjgd_global_confirm_style'

const ICON_COLORS: Record<ConfirmType, string> = {
  warning: '#e6a23c',
  info: '#909399',
  error: '#f56c6c',
  success: '#67c23a',
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
    .mjgd_global_confirm_overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: ${Z.CONFIRM};
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      animation: mjgd_global_confirm_fade_in 0.2s ease;
    }
    @keyframes mjgd_global_confirm_fade_in {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    .mjgd_global_confirm_box {
      width: 420px;
      max-width: calc(100vw - 32px);
      background: #fff;
      border-radius: 4px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12), 0 8px 24px rgba(0, 0, 0, 0.12);
      overflow: hidden;
    }
    .mjgd_global_confirm_header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 15px 15px 10px;
    }
    .mjgd_global_confirm_title {
      font-size: 18px;
      font-weight: 500;
      color: #303133;
      line-height: 1;
    }
    .mjgd_global_confirm_close {
      border: none;
      background: transparent;
      color: #909399;
      font-size: 20px;
      line-height: 1;
      cursor: pointer;
      padding: 0;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 2px;
    }
    .mjgd_global_confirm_close:hover {
      color: #409eff;
    }
    .mjgd_global_confirm_body {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 10px 15px 20px;
    }
    .mjgd_global_confirm_icon {
      flex-shrink: 0;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-size: 14px;
      font-weight: 700;
      line-height: 1;
    }
    .mjgd_global_confirm_message {
      flex: 1;
      margin-top: 1px;
      font-size: 14px;
      color: #606266;
      line-height: 1.6;
      word-break: break-word;
    }
    .mjgd_global_confirm_footer {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      padding: 10px 15px 15px;
    }
    .mjgd_global_confirm_btn {
      min-width: 74px;
      height: 32px;
      padding: 0 15px;
      font-size: 14px;
      border-radius: 4px;
      cursor: pointer;
      border: 1px solid transparent;
      line-height: 30px;
      box-sizing: border-box;
    }
    .mjgd_global_confirm_btn_cancel {
      background: #fff;
      border-color: #dcdfe6;
      color: #606266;
    }
    .mjgd_global_confirm_btn_cancel:hover {
      color: #409eff;
      border-color: #c6e2ff;
      background: #ecf5ff;
    }
    .mjgd_global_confirm_btn_ok {
      background: #409eff;
      border-color: #409eff;
      color: #fff;
    }
    .mjgd_global_confirm_btn_ok:hover {
      background: #66b1ff;
      border-color: #66b1ff;
    }
  `
  document.head.appendChild(style)
  styleInjected = true
}

function normalizeOptions(input: string | ConfirmOptions): Required<ConfirmOptions> {
  const opts = typeof input === 'string' ? { message: input } : input
  return {
    title: opts.title ?? '提示',
    message: opts.message,
    confirmText: opts.confirmText ?? '确定',
    cancelText: opts.cancelText ?? '取消',
    showCancelButton: opts.showCancelButton ?? true,
    type: opts.type ?? 'warning',
    closeOnClickOverlay: opts.closeOnClickOverlay ?? false,
  }
}

function removeExistingConfirm(): void {
  document.getElementById(CONFIRM_ROOT_ID)?.remove()
}

/**
 * 显示确认弹窗
 * @returns true=确定，false=取消或关闭
 */
export function showConfirm(input: string | ConfirmOptions): Promise<boolean> {
  const options = normalizeOptions(input)
  injectStyles()
  removeExistingConfirm()

  return new Promise<boolean>((resolve) => {
    let settled = false

    const finish = (result: boolean) => {
      if (settled) return
      settled = true
      document.removeEventListener('keydown', onKeydown)
      overlay.remove()
      resolve(result)
    }

    const overlay = document.createElement('div')
    overlay.id = CONFIRM_ROOT_ID
    overlay.className = 'mjgd_global_confirm_overlay'

    const box = document.createElement('div')
    box.className = 'mjgd_global_confirm_box'
    box.setAttribute('role', 'alertdialog')
    box.setAttribute('aria-modal', 'true')
    box.setAttribute('aria-labelledby', 'mjgd_global_confirm_title')

    const header = document.createElement('div')
    header.className = 'mjgd_global_confirm_header'

    const title = document.createElement('span')
    title.id = 'mjgd_global_confirm_title'
    title.className = 'mjgd_global_confirm_title'
    title.textContent = options.title

    const closeBtn = document.createElement('button')
    closeBtn.type = 'button'
    closeBtn.className = 'mjgd_global_confirm_close'
    closeBtn.setAttribute('aria-label', '关闭')
    closeBtn.textContent = '×'
    closeBtn.addEventListener('click', () => finish(false))

    header.append(title, closeBtn)

    const body = document.createElement('div')
    body.className = 'mjgd_global_confirm_body'

    const icon = document.createElement('div')
    icon.className = 'mjgd_global_confirm_icon'
    icon.style.backgroundColor = ICON_COLORS[options.type]
    icon.textContent = options.type === 'info' ? 'i' : '!'

    const message = document.createElement('div')
    message.className = 'mjgd_global_confirm_message'
    message.textContent = options.message

    body.append(icon, message)

    const footer = document.createElement('div')
    footer.className = 'mjgd_global_confirm_footer'

    const okBtn = document.createElement('button')
    okBtn.type = 'button'
    okBtn.className = 'mjgd_global_confirm_btn mjgd_global_confirm_btn_ok'
    okBtn.textContent = options.confirmText
    okBtn.addEventListener('click', () => finish(true))

    if (options.showCancelButton) {
      const cancelBtn = document.createElement('button')
      cancelBtn.type = 'button'
      cancelBtn.className = 'mjgd_global_confirm_btn mjgd_global_confirm_btn_cancel'
      cancelBtn.textContent = options.cancelText
      cancelBtn.addEventListener('click', () => finish(false))
      footer.append(cancelBtn, okBtn)
    } else {
      footer.append(okBtn)
    }
    box.append(header, body, footer)
    overlay.appendChild(box)

    // 点击遮罩关闭（默认不开启，与 Element MessageBox 行为一致）
    overlay.addEventListener('click', (e) => {
      if (options.closeOnClickOverlay && e.target === overlay) {
        finish(false)
      }
    })

    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        finish(false)
      } else if (e.key === 'Enter') {
        finish(true)
      }
    }
    document.addEventListener('keydown', onKeydown)

    document.body.appendChild(overlay)
    okBtn.focus()
  })
}

function toConfirmOptions(
  message: string,
  title?: string,
  options?: ElementConfirmOptions
): ConfirmOptions {
  return {
    title: title ?? '提示',
    message,
    confirmText: options?.confirmButtonText ?? '确定',
    cancelText: options?.cancelButtonText ?? '取消',
    type: options?.type ?? 'warning',
    closeOnClickOverlay: options?.closeOnClickModal ?? options?.closeOnClickOverlay ?? false,
  }
}

/**
 * Element UI 风格 confirm：确定 resolve，取消/关闭 reject('cancel')
 * import { messageBoxConfirm } from '@/utils/messageBox'
 */
export const messageBoxConfirm: MessageBoxConfirmFn = (message, title, options) => {
  return showConfirm(toConfirmOptions(message, title, options)).then((ok) => {
    if (ok) return
    return Promise.reject('cancel')
  })
}
