export type PaginationDisplayItem =
  | { type: 'page'; page: number }
  | { type: 'ellipsis'; id: 'left' | 'right' }

/**
 * 生成截断式分页项：首页 + 当前附近页码 + 末页，中间用省略号
 * pagerCount 为滑动窗口宽度（含首尾页时的中间可见位数）
 */
export function buildPaginationItems(current: number, total: number, pagerCount = 7): PaginationDisplayItem[] {
  if (total <= 1) return []
  if (total <= pagerCount + 2) {
    return Array.from({ length: total }, (_, i) => ({ type: 'page' as const, page: i + 1 }))
  }

  const items: PaginationDisplayItem[] = []
  const half = Math.floor(pagerCount / 2)

  items.push({ type: 'page', page: 1 })

  let start = Math.max(2, current - half + 1)
  let end = Math.min(total - 1, current + half - 1)

  // 靠近开头/末尾时窗口贴边，保证可见页码数量稳定
  if (current <= half + 1) {
    start = 2
    end = pagerCount - 1
  } else if (current >= total - half) {
    start = total - (pagerCount - 2)
    end = total - 1
  }

  // 单页间隙直接显示页码，不插入省略号
  if (start > 2) {
    if (start === 3) {
      items.push({ type: 'page', page: 2 })
    } else {
      items.push({ type: 'ellipsis', id: 'left' })
    }
  }

  for (let p = start; p <= end; p++) {
    items.push({ type: 'page', page: p })
  }

  if (end < total - 1) {
    if (end === total - 2) {
      items.push({ type: 'page', page: total - 1 })
    } else {
      items.push({ type: 'ellipsis', id: 'right' })
    }
  }

  items.push({ type: 'page', page: total })
  return items
}
