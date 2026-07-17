import type { OzonPageType } from '../../utils/ozonList/ozonPageContext'
import { isOzonListLikePage } from '../../utils/ozonList/ozonPageContext'

import cookieIcon from '../../../assets/img/cookie.png'
import loadIcon from '../../../assets/img/load.png'
import collectIcon from '../../../assets/img/collect.png'
import copyIcon from '../../../assets/img/copy.png'
import crawlIcon from '../../../assets/img/crawl.png'
import settingIcon from '../../../assets/img/setting.png'
import editIcon from '../../../assets/img/edit.png'
/** Ozon 功能栏按钮 action 标识（与旧版 #cj_move_page 内按钮 1:1 对齐） */
export type OzonSidebarAction =
  | 'check_cookie'
  | 'load_more'
  | 'edit_upload'
  | 'quick_shelve'
  | 'copy_format'
  | 'start_crawl'
  | 'bind_cookie'
  | 'settings'

export interface OzonSidebarButtonDef {
  action: OzonSidebarAction
  label: string
  icon: string
  /** 在哪些页面类型下显示 */
  visibleOn: OzonPageType[]
}

/** Ozon 专属功能栏按钮配置（不含 Widget 已有功能） */
export const OZON_SIDEBAR_BUTTONS: OzonSidebarButtonDef[] = [
  {
    action: 'check_cookie',
    label: '检查Cookie',
    icon: cookieIcon,
    visibleOn: ['list', 'search', 'detail'],
  },
  {
    action: 'load_more',
    label: '加载更多',
    icon: loadIcon,
    // 对齐旧版 #cj_but1：列表/搜索/详情页都可见。
    // 列表/搜索页：扫描当前列表贴卡；详情页：加载下方「相似商品」网格贴卡（对齐旧版 loadDatas）
    visibleOn: ['list', 'search', 'detail'],
  },
  {
    action: 'quick_shelve',
    label: '急速上架',
    icon: collectIcon,
    visibleOn: ['list', 'search', 'detail'],
  },
  {
    action: 'edit_upload',
    label: '编辑上架',
    icon: editIcon,
    // 旧版 #cj_editUpload 仅在商品详情页显示（isOzonProductPath），列表/搜索页隐藏
    visibleOn: ['detail'],
  },
  {
    action: 'copy_format',
    label: '复制格式',
    icon: copyIcon,
    visibleOn: ['list', 'search'],
  },
  {
    action: 'start_crawl',
    label: '启动爬取',
    icon: crawlIcon,
    visibleOn: ['list', 'search'],
  },
  {
    action: 'bind_cookie',
    label: '绑定Cookie',
    icon: copyIcon,
    // 旧版 #cokkieCrawl 默认仅在列表/搜索页显示；按业务要求扩展到详情页
    visibleOn: ['list', 'search', 'detail'],
  },
  {
    action: 'settings',
    label: '偏好设置',
    icon: settingIcon,
    visibleOn: ['list', 'search', 'detail'],
  },
]

/** 按当前页面类型过滤可见按钮 */
export function getVisibleSidebarButtons(pageType: OzonPageType): OzonSidebarButtonDef[] {
  if (pageType === 'other') return []
  return OZON_SIDEBAR_BUTTONS.filter((btn) => btn.visibleOn.includes(pageType))
}

/** 供外部判断爬取类按钮是否应在当前页可用 */
export function isCrawlActionAvailable(pageType: OzonPageType): boolean {
  return isOzonListLikePage(pageType)
}
