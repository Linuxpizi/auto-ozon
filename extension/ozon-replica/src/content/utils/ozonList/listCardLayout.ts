/** 列表贴卡后解除祖先 overflow 裁切；垂直对齐沿用 Ozon 原生（底部），展开利润面板时由 bcs-list-ipc-expanded 顶对齐 */
export function ensureListTileLayoutForCard(card: HTMLElement): void {
  const tile = card.closest('.tile-root') as HTMLElement | null

  let el: HTMLElement | null = card.parentElement
  while (el && el !== tile) {
    try {
      const st = window.getComputedStyle(el)
      if (st.overflow === 'hidden' || st.overflowY === 'hidden') {
        el.style.setProperty('overflow', 'visible', 'important')
      }
      if (st.maxHeight && st.maxHeight !== 'none') {
        el.style.setProperty('max-height', 'none', 'important')
      }
    } catch {
      // ignore
    }
    el = el.parentElement
  }
}

/** 商品链接所在 tile（用于去重）；无 tile 时退回链接父节点 */
export function resolveListCardScope(anchor: HTMLAnchorElement): HTMLElement | null {
  const tile = anchor.closest('.tile-root')
  if (tile instanceof HTMLElement) return tile
  return anchor.parentElement
}
