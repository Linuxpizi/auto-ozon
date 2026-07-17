/**
 * 全局Toast提示工具
 * 可在任何地方调用，显示提示消息
 */
import { Z } from '../content/styles/zIndex'

/**
 * 显示Toast提示
 * @param message 提示消息
 * @param duration 显示时长（毫秒），默认3000ms
 */
export function showToast(message: string, duration: number = 3000): void {
  // 移除已存在的Toast
  const existingToast = document.getElementById('mjgd-global-toast')
  if (existingToast) {
    existingToast.remove()
  }

  // 创建Toast元素
  const toast = document.createElement('div')
  toast.id = 'mjgd-global-toast'
  toast.className = 'mjgd-global-toast'
  toast.textContent = message

  // 添加样式
  toast.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 12px 24px;
    border-radius: 4px;
    z-index: ${Z.TOAST};
    font-size: 14px;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.3s ease-in-out;
  `

  // 添加到body
  document.body.appendChild(toast)

  // 触发显示动画
  requestAnimationFrame(() => {
    toast.style.opacity = '1'
  })

  // 自动移除
  setTimeout(() => {
    toast.style.opacity = '0'
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast)
      }
    }, 300) // 等待淡出动画完成
  }, duration)
}

