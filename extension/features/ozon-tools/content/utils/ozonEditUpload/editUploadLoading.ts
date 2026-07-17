// 编辑上架全局 Loading 覆盖层
// 移植旧版 dom-elements.js #loading-screen + utils.js showGlobalLoading/hideGlobalLoading，
// 扩展分 SKU 进度条（采集变体 / 获取商品属性）。

const LOADING_ID = 'loading-screen'
const PROGRESS_WRAP_CLASS = 'bcs-edit-upload-progress-wrap'
const PROGRESS_BAR_CLASS = 'bcs-edit-upload-progress-bar'
const PROGRESS_TEXT_CLASS = 'bcs-edit-upload-progress-text'

export type EditUploadProgressPhase = 'variants' | 'shops'

const PHASE_LABEL: Record<EditUploadProgressPhase, string> = {
  variants: '正在采集变体',
  shops: '正在获取商品属性',
}

function appendProgressUi(el: HTMLElement): void {
  if (el.querySelector('.' + PROGRESS_WRAP_CLASS)) return
  el.style.flexDirection = 'column'
  el.style.gap = '12px'
  const h1 = el.querySelector('h1')
  if (h1 instanceof HTMLElement) {
    h1.style.margin = '0'
    h1.style.fontSize = '18px'
    h1.style.fontWeight = '500'
    h1.style.color = '#333'
  }
  const wrap = document.createElement('div')
  wrap.className = PROGRESS_WRAP_CLASS
  wrap.style.cssText = 'display: none; flex-direction: column; align-items: center; gap: 8px; min-width: 240px;'
  const track = document.createElement('div')
  track.style.cssText =
    'width: 280px; max-width: 80vw; height: 8px; background: #e8eff7; border-radius: 4px; overflow: hidden;'
  const bar = document.createElement('div')
  bar.className = PROGRESS_BAR_CLASS
  bar.style.cssText = 'height: 100%; width: 0%; background: linear-gradient(90deg, #4085FB 0%, #36B0FD 100%); transition: width 0.2s ease;'
  track.appendChild(bar)
  const text = document.createElement('div')
  text.className = PROGRESS_TEXT_CLASS
  text.style.cssText = 'font-size: 13px; color: #666;'
  text.textContent = ''
  wrap.appendChild(track)
  wrap.appendChild(text)
  el.appendChild(wrap)
}

function ensureLoadingScreen(): HTMLElement {
  const existed = document.getElementById(LOADING_ID)
  if (existed) {
    appendProgressUi(existed)
    return existed
  }
  const el = document.createElement('div')
  el.id = LOADING_ID
  el.style.cssText =
    'display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(255,255,255,0.5); z-index: 809800; pointer-events: none; flex-direction: column; justify-content: center; align-items: center; height: 100vh; gap: 12px;'
  const h1 = document.createElement('h1')
  h1.style.cssText = 'margin: 0; font-size: 18px; font-weight: 500; color: #333;'
  h1.textContent = 'BcsOzon提示：请稍等，正在为您跳转...'
  el.appendChild(h1)

  const wrap = document.createElement('div')
  wrap.className = PROGRESS_WRAP_CLASS
  wrap.style.cssText = 'display: none; flex-direction: column; align-items: center; gap: 8px; min-width: 240px;'
  const track = document.createElement('div')
  track.style.cssText =
    'width: 280px; max-width: 80vw; height: 8px; background: #e8eff7; border-radius: 4px; overflow: hidden;'
  const bar = document.createElement('div')
  bar.className = PROGRESS_BAR_CLASS
  bar.style.cssText = 'height: 100%; width: 0%; background: linear-gradient(90deg, #4085FB 0%, #36B0FD 100%); transition: width 0.2s ease;'
  track.appendChild(bar)
  const text = document.createElement('div')
  text.className = PROGRESS_TEXT_CLASS
  text.style.cssText = 'font-size: 13px; color: #666;'
  text.textContent = ''
  wrap.appendChild(track)
  wrap.appendChild(text)
  el.appendChild(wrap)

  document.body.appendChild(el)
  return el
}

function getProgressWrap(el: HTMLElement): HTMLElement | null {
  return el.querySelector('.' + PROGRESS_WRAP_CLASS)
}

function setProgressVisible(el: HTMLElement, visible: boolean): void {
  const wrap = getProgressWrap(el)
  if (wrap) wrap.style.display = visible ? 'flex' : 'none'
}

/** 显示全局 Loading（移植旧版 showGlobalLoading） */
export function showGlobalLoading(message?: string, opts?: { showProgress?: boolean }): void {
  const el = ensureLoadingScreen()
  const h1 = el.querySelector('h1')
  if (h1) h1.textContent = 'BcsOzon提示：' + (message || '请稍候...')
  setProgressVisible(el, !!opts?.showProgress)
  el.style.display = 'flex'
}

/** 更新编辑上架分 SKU 进度（variants=采集变体，shops=ERP属性） */
export function updateEditUploadProgress(info: {
  phase: EditUploadProgressPhase
  current: number
  total: number
}): void {
  const el = ensureLoadingScreen()
  const wrap = getProgressWrap(el)
  const bar = el.querySelector('.' + PROGRESS_BAR_CLASS) as HTMLElement | null
  const text = el.querySelector('.' + PROGRESS_TEXT_CLASS) as HTMLElement | null
  const h1 = el.querySelector('h1')
  if (!wrap || !bar || !text || !h1) return

  const current = Math.max(0, info.current)
  const total = Math.max(info.total, current, 1)
  const pct = Math.min(100, Math.round((current / total) * 100))
  const label = PHASE_LABEL[info.phase] || '处理中'

  h1.textContent = 'BcsOzon提示：' + label
  bar.style.width = pct + '%'
  text.textContent = current + ' / ' + total
  wrap.style.display = 'flex'
  el.style.display = 'flex'
}

/** 隐藏全局 Loading（移植旧版 hideGlobalLoading） */
export function hideGlobalLoading(): void {
  const el = document.getElementById(LOADING_ID)
  if (!el) return
  el.style.display = 'none'
  setProgressVisible(el, false)
  const bar = el.querySelector('.' + PROGRESS_BAR_CLASS) as HTMLElement | null
  if (bar) bar.style.width = '0%'
  const text = el.querySelector('.' + PROGRESS_TEXT_CLASS) as HTMLElement | null
  if (text) text.textContent = ''
}
