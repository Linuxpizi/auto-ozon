// 三方货源平台识别：按 host / path 判定当前页面属于哪个采集平台，返回描述符（含 platformType / supportsAI / isDetailPage）。
// 列表页与详情页均返回平台描述符；Ozon（投放目的站）、ERP 站点等返回 null。
import type { SourcePlatform, SourcePlatformKey } from './types'

interface PlatformDef {
  key: SourcePlatformKey
  platformType: number
  label: string
  supportsAI: boolean
  usesBridge: boolean
  /** 命中当前 host 则在该站点显示「一键采集 / 复制图片」（含列表页） */
  matchCollectSite(hostname: string): boolean
  /** 详情页判定（href/path）；非详情页点击采集时弹窗提示 */
  isDetailPage(href: string, pathname: string): boolean
}

// 注意顺序：pifa.pinduoduo.com 必须在拼多多之前判定，否则会被吞进 pdd
const PLATFORM_DEFS: PlatformDef[] = [
  {
    key: '1688',
    platformType: 1,
    label: '1688',
    supportsAI: true,
    usesBridge: true,
    matchCollectSite: (h) => /(^|\.)1688\.com$/i.test(h),
    isDetailPage: (href) => href.includes('detail.1688.com'),
  },
  {
    key: 'taobao',
    platformType: 3,
    label: '淘宝/天猫',
    supportsAI: true,
    usesBridge: true,
    matchCollectSite: (h) => /(^|\.)(taobao|tmall)\.com$/i.test(h),
    isDetailPage: (href) => href.includes('item.taobao.com') || href.includes('detail.tmall.com'),
  },
  {
    key: 'pddPifa',
    platformType: 8,
    label: '拼多多批发',
    supportsAI: true,
    usesBridge: true,
    matchCollectSite: (h) => h === 'pifa.pinduoduo.com',
    isDetailPage: (href) => /\/goods\/detail\//.test(href),
  },
  {
    key: 'pdd',
    platformType: 2,
    label: '拼多多',
    supportsAI: true,
    usesBridge: true,
    matchCollectSite: (h) => h.endsWith('yangkeduo.com') || h.endsWith('pinduoduo.com'),
    isDetailPage: (href) => /\/goods.*\.html/.test(href),
  },
  {
    key: 'amazon',
    platformType: 4,
    label: '亚马逊',
    supportsAI: false,
    usesBridge: false,
    matchCollectSite: (h) => /(^|\.)amazon\.[a-z.]+$/i.test(h),
    isDetailPage: (href) => href.includes('/dp/'),
  },
  {
    key: 'aliexpress',
    platformType: 5,
    label: '速卖通',
    supportsAI: false,
    usesBridge: false,
    matchCollectSite: (h) => h.endsWith('aliexpress.ru') || /\.aliexpress\.ru$/i.test(h),
    isDetailPage: (href) => href.includes('aliexpress.ru/item/'),
  },
  {
    key: 'wildberries',
    platformType: 6,
    label: 'Wildberries',
    supportsAI: false,
    usesBridge: false,
    matchCollectSite: (h) => /wildberries\.ru$/i.test(h),
    isDetailPage: (href) => href.includes('detail.aspx'),
  },
  {
    key: 'temu',
    platformType: 7,
    label: 'Temu',
    supportsAI: false,
    usesBridge: false,
    matchCollectSite: (h) => /(^|\.)temu\.com$/i.test(h),
    isDetailPage: (href) => /-g-\d+\.html/.test(href),
  },
]

/**
 * 识别当前页面所属的三方货源平台（列表页与详情页均识别）。
 * @returns 命中的平台描述符；非货源站点（Ozon / ERP 等）返回 null。
 */
export function resolveSourcePlatform(): SourcePlatform | null {
  const hostname = window.location.hostname
  const def = PLATFORM_DEFS.find((d) => d.matchCollectSite(hostname))
  if (!def) return null
  return {
    key: def.key,
    platformType: def.platformType,
    label: def.label,
    supportsAI: def.supportsAI,
    usesBridge: def.usesBridge,
    isDetailPage: () => def.isDetailPage(window.location.href, window.location.pathname),
  }
}
