/**
 * 通用悬浮采集按钮
 * 在商品详情页注入一个悬浮按钮, 点击后采集当前页面商品并上报到后端
 */

export type ButtonState = 'idle' | 'scraping' | 'success' | 'error'

const BTN_ID = 'auto-ozon-scrape-btn'

const STYLES = `
#${BTN_ID} {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 2147483647;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  border: none;
  border-radius: 12px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 24px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.12);
  transition: all 0.2s ease;
  user-select: none;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  line-height: 1;
}
#${BTN_ID}:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 32px rgba(0,0,0,0.22), 0 4px 12px rgba(0,0,0,0.15);
}
#${BTN_ID}:active {
  transform: translateY(0);
}
#${BTN_ID} .btn-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}
#${BTN_ID} .btn-text {
  white-space: nowrap;
}
#${BTN_ID} .btn-spinner {
  width: 18px;
  height: 18px;
  border: 2.5px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: aoz-spin 0.7s linear infinite;
  flex-shrink: 0;
}
@keyframes aoz-spin {
  to { transform: rotate(360deg); }
}
#${BTN_ID}[data-state="idle"] {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
}
#${BTN_ID}[data-state="idle"]:hover {
  background: linear-gradient(135deg, #5a6fd6 0%, #6a4298 100%);
}
#${BTN_ID}[data-state="scraping"] {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  color: #fff;
  pointer-events: none;
}
#${BTN_ID}[data-state="success"] {
  background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
  color: #fff;
}
#${BTN_ID}[data-state="error"] {
  background: linear-gradient(135deg, #f5576c 0%, #ff6b6b 100%);
  color: #fff;
}
`

const SVG_ICON = `<svg class="btn-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>`

const LABELS: Record<ButtonState, string> = {
  idle: '采集商品',
  scraping: '采集中...',
  success: '✓ 采集成功',
  error: '✗ 采集失败',
}

/**
 * 在页面注入悬浮采集按钮
 * @param onScrape 点击按钮时的回调, 返回 Promise
 */
export function injectFloatingButton(onScrape: () => Promise<void>): void {
  // 防止重复注入
  if (document.getElementById(BTN_ID)) return

  // 注入样式
  const style = document.createElement('style')
  style.textContent = STYLES
  document.head.appendChild(style)

  // 创建按钮
  const btn = document.createElement('button')
  btn.id = BTN_ID
  btn.setAttribute('data-state', 'idle')
  btn.innerHTML = `${SVG_ICON}<span class="btn-text">${LABELS.idle}</span>`

  function setState(state: ButtonState) {
    btn.setAttribute('data-state', state)
    btn.querySelector('.btn-text')!.textContent = LABELS[state]
    // 替换 icon / spinner
    if (state === 'scraping') {
      const spinner = document.createElement('span')
      spinner.className = 'btn-spinner'
      const icon = btn.querySelector('.btn-icon')
      if (icon) icon.replaceWith(spinner)
    } else {
      const spinner = btn.querySelector('.btn-spinner')
      if (spinner) {
        const iconSpan = document.createElement('span')
        iconSpan.innerHTML = SVG_ICON
        spinner.replaceWith(iconSpan.firstElementChild!)
      }
    }
  }

  btn.addEventListener('click', async () => {
    try {
      setState('scraping')
      await onScrape()
      setState('success')
      setTimeout(() => setState('idle'), 2500)
    } catch (err) {
      console.error('[Auto-Ozon] 浮窗采集失败:', err)
      setState('error')
      setTimeout(() => setState('idle'), 3000)
    }
  })

  document.body.appendChild(btn)
}
