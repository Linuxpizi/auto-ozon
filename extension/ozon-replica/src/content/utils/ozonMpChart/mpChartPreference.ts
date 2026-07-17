const MP_CHART_VISIBLE_KEY = 'ozon_replica_mp_chart_visible'
const LEGACY_MP_CHART_VISIBLE_KEY = 'bcs_mp_chart_visible'

/** 读取 MP 图表显隐，默认展开（对齐旧版） */
export function getMpChartVisible(): boolean {
  try {
    let raw = localStorage.getItem(MP_CHART_VISIBLE_KEY)
    if (raw === null) {
      raw = localStorage.getItem(LEGACY_MP_CHART_VISIBLE_KEY)
      if (raw !== null) {
        localStorage.setItem(MP_CHART_VISIBLE_KEY, raw)
        localStorage.removeItem(LEGACY_MP_CHART_VISIBLE_KEY)
      }
    }
    if (raw === null) return true
    return raw !== 'false'
  } catch {
    return true
  }
}

/** 写入本地。保留第二参数仅兼容旧调用，不再依赖远端账户偏好。 */
export function setMpChartVisible(visible: boolean, _syncServer = true): void {
  try {
    localStorage.setItem(MP_CHART_VISIBLE_KEY, visible ? 'true' : 'false')
  } catch {
    /* ignore */
  }
}

export function applyMpChartVisibleFromApi(visible?: boolean): void {
  if (typeof visible === 'boolean') {
    setMpChartVisible(visible, false)
  }
}

export function clearMpChartVisible(): void {
  localStorage.removeItem(MP_CHART_VISIBLE_KEY)
  localStorage.removeItem(LEGACY_MP_CHART_VISIBLE_KEY)
}
