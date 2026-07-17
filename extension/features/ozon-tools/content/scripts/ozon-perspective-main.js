/**
 * M08 透视眼 MAIN world（对齐 ozon_old/content/ozon.js）
 * seller.ozon.ru 分析页本地增强 + 悬浮开关面板
 */
;(function () {
  if (window.__mjgd_perspective_main_loaded) return
  window.__mjgd_perspective_main_loaded = true

  sessionStorage.removeItem('ozon_from_graphs')

  const arrs = ['common']

  const isMainAnalyticsPage = () => {
    const url = window.location.href.split('?')[0].split('#')[0]
    return url === 'https://seller.ozon.ru/app/analytics'
  }

  const PERSPECTIVE_STATE_KEY = 'ozon_perspective_eye_enabled'
  try {
    document.cookie = 'ozon_perspective_eye=0; path=/; domain=.ozon.ru; max-age=0'
  } catch (_) {
    /* ignore */
  }

  let perspectiveEnabled = sessionStorage.getItem(PERSPECTIVE_STATE_KEY) === '1'

  function showToast(message, type) {
    const palette = { warn: '#FF6B00', info: '#1677FF', error: '#FF3333' }
    const bg = palette[type] || palette.warn
    const toast = document.createElement('div')
    toast.className = 'mjgd_ozon_perspective_toast'
    toast.style.cssText = `
      position: fixed; top: 24px; left: 50%; transform: translateX(-50%);
      background: ${bg}; color: #fff; padding: 10px 18px; border-radius: 6px;
      font-size: 13px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 9999999;
      font-family: Arial; max-width: 80vw; line-height: 1.4;
    `
    toast.textContent = message
    ;(document.body || document.documentElement).appendChild(toast)
    setTimeout(() => {
      toast.remove()
    }, 3000)
  }

  window.addEventListener('load', () => {
    initPremiumPanel()
  })

  const PANEL_POS_KEY = 'ozon_premium_panel_pos'

  function savePanelPos(left, top) {
    try {
      sessionStorage.setItem(PANEL_POS_KEY, JSON.stringify({ left, top }))
    } catch (_) {
      /* ignore */
    }
  }

  function loadPanelPos() {
    try {
      const raw = sessionStorage.getItem(PANEL_POS_KEY)
      if (!raw) return null
      const p = JSON.parse(raw)
      if (p && typeof p.left === 'number' && typeof p.top === 'number') return p
    } catch (_) {
      /* ignore */
    }
    return null
  }

  function enableDrag(el, exemptEls) {
    const DRAG_THRESHOLD = 3
    let startX = 0
    let startY = 0
    let originLeft = 0
    let originTop = 0
    let pending = false
    let dragging = false
    let prevUserSelect = ''
    let prevBodyCursor = ''

    function isExempt(target) {
      for (let i = 0; i < exemptEls.length; i += 1) {
        const ex = exemptEls[i]
        if (ex && (ex === target || ex.contains(target))) return true
      }
      return false
    }

    function onMouseDown(e) {
      if (e.button !== 0) return
      if (isExempt(e.target)) return
      const rect = el.getBoundingClientRect()
      originLeft = rect.left
      originTop = rect.top
      startX = e.clientX
      startY = e.clientY
      pending = true
      dragging = false
      window.addEventListener('mousemove', onMouseMove, true)
      window.addEventListener('mouseup', onMouseUp, true)
    }

    function onMouseMove(e) {
      const dx = e.clientX - startX
      const dy = e.clientY - startY
      if (pending && !dragging) {
        if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return
        dragging = true
        pending = false
        el.style.right = 'auto'
        el.style.transform = 'none'
        el.style.left = `${originLeft}px`
        el.style.top = `${originTop}px`
        prevUserSelect = document.body.style.userSelect
        prevBodyCursor = document.body.style.cursor
        document.body.style.userSelect = 'none'
        document.body.style.cursor = 'move'
      }
      if (!dragging) return
      const maxLeft = Math.max(0, window.innerWidth - el.offsetWidth)
      const maxTop = Math.max(0, window.innerHeight - el.offsetHeight)
      let nx = originLeft + dx
      let ny = originTop + dy
      if (nx < 0) nx = 0
      if (ny < 0) ny = 0
      if (nx > maxLeft) nx = maxLeft
      if (ny > maxTop) ny = maxTop
      el.style.left = `${nx}px`
      el.style.top = `${ny}px`
      e.preventDefault()
    }

    function onMouseUp() {
      window.removeEventListener('mousemove', onMouseMove, true)
      window.removeEventListener('mouseup', onMouseUp, true)
      if (dragging) {
        document.body.style.userSelect = prevUserSelect
        document.body.style.cursor = prevBodyCursor
        const left = parseInt(el.style.left, 10)
        const top = parseInt(el.style.top, 10)
        if (!Number.isNaN(left) && !Number.isNaN(top)) savePanelPos(left, top)
      }
      pending = false
      dragging = false
    }

    el.addEventListener('mousedown', onMouseDown)
  }

  function initPremiumPanel() {
    let panel = document.getElementById('mjgd_ozon_perspective_panel')
    if (panel) panel.remove()

    panel = document.createElement('div')
    panel.id = 'mjgd_ozon_perspective_panel'
    panel.className = 'mjgd_ozon_perspective_panel'
    panel.style.cssText = `
      position:fixed; right:20px; top:35%; transform:translateY(-50%);
      width:180px; padding:15px; background:#fff; border-radius:8px;
      box-shadow:0 4px 12px rgba(0,0,0,0.1); z-index:999999;
      font-family:Arial; font-size:12px; border:1px solid #eee;
      cursor:move;
    `

    const savedPos = loadPanelPos()
    if (savedPos) {
      panel.style.right = 'auto'
      panel.style.transform = 'none'
      panel.style.left = `${savedPos.left}px`
      panel.style.top = `${savedPos.top}px`
    }

    const brand = document.createElement('div')
    brand.style.cssText =
      'font-weight:bold; color:#1677FF; text-align:center; margin-bottom:12px; font-size:14px;'
    brand.textContent = 'Auto Ozon · 本地模式'
    panel.appendChild(brand)

    const switchContainer = document.createElement('div')
    switchContainer.style.cssText =
      'display:flex; align-items:center; justify-content:space-between; margin-bottom:15px; padding:0 4px;'

    const switchLabel = document.createElement('span')
    switchLabel.textContent = '透视眼'
    switchLabel.style.cssText = 'font-weight:500; color:#1D2129;'

    const switchBtn = document.createElement('div')
    switchBtn.className = 'mjgd_ozon_perspective_switch'
    switchBtn.style.cssText = `
      width: 40px; height: 20px; border-radius: 10px;
      background: ${perspectiveEnabled ? '#1677FF' : '#DCDFE6'};
      position: relative; cursor: pointer; transition: all 0.2s;
    `

    const switchCircle = document.createElement('div')
    switchCircle.style.cssText = `
      width: 16px; height: 16px; border-radius: 50%; background: #fff;
      position: absolute; top: 2px; left: ${perspectiveEnabled ? '22px' : '2px'};
      transition: all 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.15);
    `

    switchBtn.appendChild(switchCircle)
    switchContainer.appendChild(switchLabel)
    switchContainer.appendChild(switchBtn)
    panel.appendChild(switchContainer)

    switchBtn.onclick = () => {
      const isOn = perspectiveEnabled
      if (isOn) {
        sessionStorage.removeItem(PERSPECTIVE_STATE_KEY)
        setTimeout(() => window.location.reload(), 250)
        return
      }
      sessionStorage.setItem(PERSPECTIVE_STATE_KEY, '1')
      setTimeout(() => window.location.reload(), 250)
    }

    if (perspectiveEnabled) {
      const statusText = document.createElement('div')
      statusText.style.cssText =
        'text-align:center; margin-bottom:10px; font-weight:bold; padding:8px; border-radius:6px; background:#F7F8FA; color:#1D2129;'
      statusText.textContent = '✅ 本地增强已启用'
      panel.appendChild(statusText)
    }

    const dragExemptEls = [switchBtn]
    enableDrag(panel, dragExemptEls)
    document.body.appendChild(panel)

    if (savedPos) {
      const maxLeft = Math.max(0, window.innerWidth - panel.offsetWidth)
      const maxTop = Math.max(0, window.innerHeight - panel.offsetHeight)
      const cx = Math.max(0, Math.min(savedPos.left, maxLeft))
      const cy = Math.max(0, Math.min(savedPos.top, maxTop))
      if (cx !== savedPos.left || cy !== savedPos.top) {
        panel.style.left = `${cx}px`
        panel.style.top = `${cy}px`
        savePanelPos(cx, cy)
      }
    }
  }

  if (!perspectiveEnabled) return

  const log = () => {
    /* 调试日志已关闭 */
  }

  const installFullXHRListener = () => {
    if (XMLHttpRequest.prototype._ozonMonkeyPatched) return
    const nativeOpen = XMLHttpRequest.prototype.open
    const nativeSend = XMLHttpRequest.prototype.send
    const nativeSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader

    XMLHttpRequest.prototype.open = function open(method, url) {
      this._method = method
      this._url = url.toString()
      this._startTime = Date.now()
      return nativeOpen.apply(this, arguments)
    }

    XMLHttpRequest.prototype.setRequestHeader = function setRequestHeader(header, value) {
      this._headers = this._headers || {}
      this._headers[header] = value
      return nativeSetRequestHeader.apply(this, arguments)
    }

    XMLHttpRequest.prototype.send = function send(body) {
      const xhr = this
      const url = this._url || ''
      const originalOnReadyStateChange = this.onreadystatechange
      this.onreadystatechange = function onreadystatechange() {
        if (xhr.readyState === 4) {
          log('RES', `[XHR] ${xhr.status}`, url)
        }
        if (originalOnReadyStateChange) return originalOnReadyStateChange.apply(this, arguments)
      }
      return nativeSend.apply(this, [body])
    }
    XMLHttpRequest.prototype._ozonMonkeyPatched = true
  }

  const installFullFetchListener = () => {
    if (window.fetch._ozonMonkeyPatched) return
    const nativeFetch = window.fetch
    window.fetch = async function fetchWrap(input, init) {
      const url = input instanceof Request ? input.url : input.toString()
      log('REQ', '[Fetch]', url)
      try {
        return await nativeFetch.apply(this, arguments)
      } catch (e) {
        log('ERR', '[Fetch]', url, e)
        throw e
      }
    }
    window.fetch._ozonMonkeyPatched = true
  }

  if (!Array.isArray(arrs) || !arrs.includes('common')) return
  if (window.__OZON_EXT_INSTALLED_V5__) return
  window.__OZON_EXT_INSTALLED_V5__ = true

  const generateResponse = (url) => {
    const baseResponse = {
      status: 'grace_good',
      is_premium: true,
      isPremiumPlus: true,
      isAnalyst: true,
      subscription: {
        current: 'PREMIUM_PLUS',
        available: ['PREMIUM_PLUS'],
        grace_period_end_at: new Date(Date.now() + 30 * 86400000).toISOString(),
      },
      features: {
        analytics: 'full',
        marketing: 'full',
        api: 'full_access',
        graphs: 'full',
        reports: 'full',
        statistics: 'full',
        recommendations: 'full',
      },
    }
    if (/seller-analytics\/premium\/status/i.test(url)) {
      return {
        ...baseResponse,
        dataPoints: Array.from({ length: 15 }, (_, i) => ({
          id: `metric_${i}`,
          value: Math.floor(Math.random() * 1000),
          trend: Math.random() > 0.5 ? 'up' : 'down',
          change: Math.floor(Math.random() * 100),
        })),
        hasAccess: true,
        accessLevel: 'FULL',
      }
    }
    if (/\/analytics\/graphs/i.test(url) || /\/graph\/data/i.test(url)) {
      return {
        ...baseResponse,
        graphsAccess: true,
        dataSets: ['sales', 'traffic', 'conversion'],
        timeRanges: ['day', 'week', 'month'],
      }
    }
    return baseResponse
  }

  const checkTargetCells = () => {
    if (!isMainAnalyticsPage()) {
      return false
    }
    sessionStorage.setItem('ozon_from_graphs', 'true')
    const success = installXHRInterceptor() && installFetchInterceptor()
    if (success) {
      setTimeout(initPremiumPanel, 500)
    }
    return success
  }

  const installXHRInterceptor = () => {
    if (XMLHttpRequest.prototype.send._ozonPatched) return true
    if (!isMainAnalyticsPage()) return false
    const interceptPatterns = [
      /\/premium\/status/i,
      /seller-analytics\/premium\/status/i,
      /get-seller-premium-status/i,
      /\/analytics\/graphs/i,
      /\/graph\/data/i,
      /\/statistics\/data/i,
    ]
    const nativeOpen = XMLHttpRequest.prototype.open
    const nativeSend = XMLHttpRequest.prototype.send
    XMLHttpRequest.prototype.open = function open(method, url) {
      this._ozonUrl = url
      return nativeOpen.apply(this, arguments)
    }
    XMLHttpRequest.prototype.send = function send(body) {
      const url = this._ozonUrl || ''
      const shouldIntercept = interceptPatterns.some((pattern) => pattern.test(url))
      if (shouldIntercept) {
        const fakeResponse = JSON.stringify(generateResponse(url))
        Object.defineProperties(this, {
          responseText: { value: fakeResponse },
          response: { value: fakeResponse },
          status: { value: 200 },
          statusText: { value: 'OK' },
          readyState: { value: 4 },
        })
        const xhr = this
        Promise.resolve().then(() => {
          xhr.onreadystatechange?.()
          xhr.onload?.()
        })
        return
      }
      return nativeSend.apply(this, arguments)
    }
    XMLHttpRequest.prototype.send._ozonPatched = true
    return true
  }

  const installFetchInterceptor = () => {
    if (!isMainAnalyticsPage()) return false
    if (window.fetch._ozonFetchPatched) return true
    const nativeFetch = window.fetch
    window.fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : input || ''
      const interceptPatterns = [/premium/, /analytics/, /graphs/]
      if (interceptPatterns.some((p) => p.test(url))) {
        const fakeData = generateResponse(url)
        return new Response(JSON.stringify(fakeData), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return nativeFetch(input, init)
    }
    window.fetch._ozonFetchPatched = true
    return true
  }

  const initialize = () => {
    installFullXHRListener()
    installFullFetchListener()
    checkTargetCells()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize)
  } else {
    initialize()
  }
})()
