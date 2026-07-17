/**
 * 运行在 profit-tools-hub 同源 frame 内：读 URL（含 hash 内 query）回显搜索词并触发查询；可选 pack* 包装字段。
 * 回显时机：① 首次出现搜索框；② 路由 hash/popstate 变化；③ Tab 切换等导致「新的」搜索 input 挂载。
 * 不因用户清空/编辑输入框而反复写入（不监听 value，只在 input 元素引用变化时处理）。
 */
;(function profitToolsHubBridge() {
  const path = window.location.pathname || ''
  const hashPath = (window.location.hash || '').replace(/^#/, '').split('?')[0] || ''
  if (!path.includes('profit-tools-hub') && !hashPath.includes('profit-tools-hub')) return

  /** 上一次已做过 URL 回显的搜索框 input；仅当 DOM 换成新节点时再回显 */
  let lastSearchInputEl: HTMLInputElement | null = null

  function readProfitBridgeParams(): URLSearchParams {
    const merged = new URLSearchParams(window.location.search)
    const hash = window.location.hash || ''
    const qi = hash.indexOf('?')
    if (qi >= 0) {
      const q = hash.slice(qi + 1)
      new URLSearchParams(q).forEach((v, k) => {
        if (!merged.has(k) || merged.get(k) === '') merged.set(k, v)
      })
    }
    return merged
  }

  function setNativeInputValue(el: HTMLInputElement, value: string) {
    const proto = Object.getPrototypeOf(el) as HTMLInputElement
    const desc = Object.getOwnPropertyDescriptor(proto, 'value')
    if (desc?.set) {
      desc.set.call(el, value)
    } else {
      el.value = value
    }
    el.dispatchEvent(new Event('input', { bubbles: true }))
    try {
      el.dispatchEvent(new InputEvent('input', { bubbles: true, data: value }))
    } catch {
      /* IE 等环境无 InputEvent */
    }
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }

  function pickTextInput(container: Element): HTMLInputElement | null {
    const sels = [
      'input.el-input__inner',
      'textarea.el-textarea__inner',
      'input.el-input-number__input',
      '.el-input-number input',
      'input[type="number"]',
      'input[type="text"]',
    ]
    for (const sel of sels) {
      const el = container.querySelector(sel) as HTMLInputElement | null
      if (el && !el.disabled && el.type !== 'hidden') return el
    }
    return null
  }

  function fillByLabelRegex(labelRe: RegExp, value: string) {
    if (!value) return false
    let hit = false

    document.querySelectorAll('.el-form-item').forEach((item) => {
      const labelText = (
        item.querySelector('.el-form-item__label')?.textContent ||
        item.querySelector('label')?.textContent ||
        ''
      )
        .replace(/\s+/g, ' ')
        .trim()
      if (!labelText || !labelRe.test(labelText)) return
      const input = pickTextInput(item)
      if (input) {
        setNativeInputValue(input, value)
        hit = true
      }
    })

    document.querySelectorAll('tr').forEach((tr) => {
      const cells = tr.querySelectorAll('td, th')
      if (cells.length < 2) return
      const label = (cells[0].textContent || '').replace(/\s+/g, ' ').trim()
      if (!label || !labelRe.test(label)) return
      const input = pickTextInput(tr)
      if (input) {
        setNativeInputValue(input, value)
        hit = true
      }
    })

    return hit
  }

  function fillByPlaceholderHints(hints: RegExp[], value: string) {
    if (!value) return false
    let hit = false
    document.querySelectorAll('input, textarea').forEach((el) => {
      const input = el as HTMLInputElement
      if (input.disabled || input.type === 'hidden') return
      const ph = (input.placeholder || '').trim()
      if (!ph) return
      if (hints.some((re) => re.test(ph))) {
        setNativeInputValue(input, value)
        hit = true
      }
    })
    return hit
  }

  function fillByFormItemLabelSubstring(substrs: string[], value: string) {
    if (!value) return false
    let hit = false
    const lower = substrs.map((s) => s.toLowerCase())
    document.querySelectorAll('.el-form-item').forEach((item) => {
      const blob = (item.textContent || '').replace(/\s+/g, ' ').trim()
      if (!blob) return
      const ok = lower.some((s) => blob.toLowerCase().includes(s))
      if (!ok) return
      const input = pickTextInput(item)
      if (input && input.closest('.search-row') === null) {
        setNativeInputValue(input, value)
        hit = true
      }
    })
    return hit
  }

  function findSearchNodes(): { input: HTMLInputElement; btn: HTMLButtonElement } | null {
    const row = document.querySelector('.search-row')
    const input =
      (row?.querySelector('input.el-input__inner') as HTMLInputElement | null) ||
      (document.querySelector('.search-row input.el-input__inner') as HTMLInputElement | null) ||
      (document.querySelector('.search-input input.el-input__inner') as HTMLInputElement | null)

    const btn =
      (row?.querySelector('button.search-submit-btn') as HTMLButtonElement | null) ||
      (document.querySelector('.search-row button.search-submit-btn') as HTMLButtonElement | null) ||
      (document.querySelector('button.search-submit-btn') as HTMLButtonElement | null)

    if (input && btn) return { input, btn }
    return null
  }

  function applyPackagingFields(p: URLSearchParams) {
    const packWeightG = (p.get('packWeightG') || '').trim()
    const packLength = (p.get('packLength') || '').trim()
    const packWidth = (p.get('packWidth') || '').trim()
    const packHeight = (p.get('packHeight') || '').trim()
    const packVolumeCm3 = (p.get('packVolumeCm3') || '').trim()
    const hasPack = !!(packWeightG || packLength || packWidth || packHeight || packVolumeCm3)
    if (!hasPack) return

    if (packWeightG) {
      fillByLabelRegex(/包装重量|毛重|商品重量|包裹重量|发货重量|重量\s*[（(]?\s*g|重量\s*[（(]?\s*克|重量\s*$/i, packWeightG)
      fillByPlaceholderHints([/重量|毛重|克|g\s*$/i, /weight/i], packWeightG)
      fillByFormItemLabelSubstring(['毛重', '包装重量', '商品重量', '包裹重量', '重量(g', '重量（g'], packWeightG)
    }
    if (packVolumeCm3) {
      fillByLabelRegex(/体积|容积|cm[³3]|立方厘米|包裹体积/i, packVolumeCm3)
      fillByPlaceholderHints([/体积|容积|cm[³3]/i], packVolumeCm3)
      fillByFormItemLabelSubstring(['体积', '容积', 'cm³', 'cm3'], packVolumeCm3)
    }
    if (packLength) {
      fillByLabelRegex(/长度|^长[^宽高]?$|长\s*[（(]?\s*mm|长\s*[（(]?\s*cm|包装长/i, packLength)
      fillByPlaceholderHints([/长\s*mm|长度|包装长/i], packLength)
      fillByFormItemLabelSubstring(['长度', '包装长', '长(mm', '长（mm', '长(cm'], packLength)
    }
    if (packWidth) {
      fillByLabelRegex(/宽度|宽[^高]?$|包装宽/i, packWidth)
      fillByPlaceholderHints([/宽\s*mm|宽度|包装宽/i], packWidth)
      fillByFormItemLabelSubstring(['宽度', '包装宽', '宽(mm', '宽（mm'], packWidth)
    }
    if (packHeight) {
      fillByLabelRegex(/高度|高[^宽]?$|包装高/i, packHeight)
      fillByPlaceholderHints([/高\s*mm|高度|包装高/i], packHeight)
      fillByFormItemLabelSubstring(['高度', '包装高', '高(mm', '高（mm'], packHeight)
    }
  }

  /** 当前是否出现「与上次不同」的搜索框（Tab 切换 / 首次挂载） */
  function isNewSearchInputMounted(): boolean {
    const nodes = findSearchNodes()
    if (!nodes) return false
    if (lastSearchInputEl === nodes.input) return false
    lastSearchInputEl = nodes.input
    return true
  }

  /** 从 URL 写入标题、包装；若 autoSearch 则点查询（仅在新搜索框或路由重置后调用） */
  function applyFromUrlFull(): void {
    const p = readProfitBridgeParams()
    const productName = (p.get('productName') || '').trim()
    const autoSearch = p.get('autoSearch') === '1'

    const packWeightG = (p.get('packWeightG') || '').trim()
    const packLength = (p.get('packLength') || '').trim()
    const packWidth = (p.get('packWidth') || '').trim()
    const packHeight = (p.get('packHeight') || '').trim()
    const packVolumeCm3 = (p.get('packVolumeCm3') || '').trim()
    const hasPack = !!(packWeightG || packLength || packWidth || packHeight || packVolumeCm3)

    if (!productName && !hasPack) return

    const nodes = findSearchNodes()
    if (productName && nodes) {
      setNativeInputValue(nodes.input, productName)
      if (autoSearch) {
        window.setTimeout(() => {
          const again = findSearchNodes()
          if (again) again.btn.click()
        }, 80)
      }
    }

    if (hasPack) {
      applyPackagingFields(p)
    }
  }

  function tryApplyIfNewSearchMount(): void {
    const p = readProfitBridgeParams()
    const hasName = !!(p.get('productName') || '').trim()
    const hasPk = !!(
      (p.get('packWeightG') || '').trim() ||
      (p.get('packLength') || '').trim() ||
      (p.get('packWidth') || '').trim() ||
      (p.get('packHeight') || '').trim() ||
      (p.get('packVolumeCm3') || '').trim()
    )
    if (!hasName && !hasPk) return

    if (isNewSearchInputMounted()) {
      applyFromUrlFull()
    }
  }

  function onRouteChange(): void {
    lastSearchInputEl = null
    window.setTimeout(() => {
      if (isNewSearchInputMounted()) {
        applyFromUrlFull()
      }
    }, 80)
  }

  let debounceTimer: number | null = null
  function scheduleTryNewMount(delayMs: number) {
    if (debounceTimer) window.clearTimeout(debounceTimer)
    debounceTimer = window.setTimeout(() => {
      debounceTimer = null
      tryApplyIfNewSearchMount()
    }, delayMs)
  }

  const maxAttempts = 120
  const intervalMs = 100
  let attempts = 0

  function pollUntilSearchRowThenListen() {
    attempts++
    const p = readProfitBridgeParams()
    const hasName = !!(p.get('productName') || '').trim()
    const hasPk = !!(
      (p.get('packWeightG') || '').trim() ||
      (p.get('packLength') || '').trim() ||
      (p.get('packWidth') || '').trim() ||
      (p.get('packHeight') || '').trim() ||
      (p.get('packVolumeCm3') || '').trim()
    )
    if (!hasName && !hasPk) return

    tryApplyIfNewSearchMount()

    if (findSearchNodes() || attempts >= maxAttempts) {
      startRouteAndDomWatchers()
      return
    }
    window.setTimeout(pollUntilSearchRowThenListen, intervalMs)
  }

  let mo: MutationObserver | null = null
    let moStopTimer: number | null = null

  function startRouteAndDomWatchers() {
    window.addEventListener('hashchange', onRouteChange)
    window.addEventListener('popstate', onRouteChange)

    if (mo) return
  let t: number | null = null
    mo = new MutationObserver(() => {
      if (t) window.clearTimeout(t)
      t = window.setTimeout(() => {
        t = null
        scheduleTryNewMount(0)
      }, 200)
    })
    mo.observe(document.body, { childList: true, subtree: true })

    if (moStopTimer) window.clearTimeout(moStopTimer)
    moStopTimer = window.setTimeout(() => {
      mo?.disconnect()
      mo = null
      moStopTimer = null
    }, 600000)
  }

  function boot() {
    window.setTimeout(pollUntilSearchRowThenListen, 150)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot)
  } else {
    boot()
  }
})()
