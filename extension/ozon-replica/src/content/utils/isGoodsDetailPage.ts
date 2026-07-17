/** 目标域名列表：1688 + 淘宝 + 天猫 */
const TARGET_HOSTS = [
  'detail.1688.com',
  'item.taobao.com',
  'detail.tmall.com',
] as const

/** Ozon 域名（俄罗斯站点 + 哈萨克斯坦站点） */
export const OZON_HOSTS = [
  'www.ozon.ru',
  'www.ozon.kz',
] as const

/** 判断当前页面是否为商品详情页（与 Widget 菜单 AI 采集入口规则一致） */
export function isGoodsDetailPage(): boolean {
  const { hostname, pathname } = window.location
  const isTargetHost = TARGET_HOSTS.includes(hostname as (typeof TARGET_HOSTS)[number])
  const isGoodsPath = pathname.startsWith('/goods')
  const isOzonHost = OZON_HOSTS.includes(hostname as (typeof OZON_HOSTS)[number])
  const isOzonProductPath = pathname.startsWith('/product')
  const isOzonDetailPage = isOzonHost && isOzonProductPath
  return isTargetHost || isGoodsPath || isOzonDetailPage
}
