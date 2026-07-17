import { ref } from 'vue'
import type { OzonSidebarAction } from '../../components/OzonList/sidebarButtons'
import { showToast } from '../../../utils/toast'
import {
  probeAndLoadOzonListData,
  probeAndLoadDetailShelfData,
  isOzonListLoading,
} from './ozonListService'
import { isOzonListLikePage, resolveOzonPageType } from './ozonPageContext'
import {
  bindOzonShopCookie,
  copyListingSkuPriceFormat,
  startBatchCrawl,
} from '../ozonBatchCrawl/crawlController'
import { inspectShopCookieAvailability } from '../ozonBatchCrawl/crawlSkuApi'
import { openQuickShelve } from '../ozonQuickShelve/quickShelveController'
import { openEditUploadPopup } from '../ozonEditUpload/editUploadPopup'
import { openSettings } from '../ozonCardSettings/settingsController'

/** Ozon 功能栏按钮点击处理（供 Widget 菜单复用） */
export function useOzonMenuActions() {
  const ozonMenuLoadingAction = ref<OzonSidebarAction | null>(null)

  async function handleCheckCookie() {
    ozonMenuLoadingAction.value = 'check_cookie'
    try {
      const outcome = await inspectShopCookieAvailability({ dedupe: false })
      if (outcome.ok) {
        showToast(`检测完成，${outcome.count} 个店铺 Cookie 有效`)
      } else if (outcome.reason === 'empty') {
        showToast('本地没有有效 Cookie，请先保存店铺 Cookie，以免销量查看、上品等功能受影响', 4000)
      } else {
        showToast('本地服务暂时无法检查 Cookie，请稍后重试', 4000)
      }
    } finally {
      ozonMenuLoadingAction.value = null
    }
  }

  async function handleOzonMenuAction(action: OzonSidebarAction, event?: Event) {
    if (ozonMenuLoadingAction.value) return
    switch (action) {
      case 'check_cookie':
        await handleCheckCookie()
        break
      case 'load_more': {
        const pageType = resolveOzonPageType()
        const isDetail = pageType === 'detail'
        if (!isDetail && !isOzonListLikePage(pageType)) {
          showToast('请在 Ozon 列表/搜索/详情页使用', 3000)
          break
        }
        if (isOzonListLoading()) {
          showToast('数据正在加载中，请耐心等待！', 3000)
          break
        }
        ozonMenuLoadingAction.value = 'load_more'
        try {
          // 详情页：加载下方「相似商品」网格；列表/搜索页：扫描当前列表（均对齐旧版 loadDatas）
          const { processed } = isDetail
            ? await probeAndLoadDetailShelfData()
            : await probeAndLoadOzonListData()
          showToast(processed > 0 ? `已加载 ${processed} 个商品数据` : '没有更多可加载的商品', 3000)
        } catch {
          // probe* 内部已 toast 频率限制
        } finally {
          ozonMenuLoadingAction.value = null
        }
        break
      }
      case 'edit_upload': {
        // 功能菜单「编辑上架」：弹出 当前变体 / 全部变体 选择，锚定到被点击的菜单项（悬浮面板内用 fixed 定位）
        const anchor = (event?.currentTarget || event?.target) as HTMLElement | null
        if (anchor) openEditUploadPopup(anchor, { fixed: true })
        break
      }
      case 'quick_shelve':
        await openQuickShelve()
        break
      case 'copy_format':
        if (!isOzonListLikePage(resolveOzonPageType())) {
          showToast('请在 Ozon 列表或搜索页使用', 3000)
          break
        }
        ozonMenuLoadingAction.value = 'copy_format'
        try {
          await copyListingSkuPriceFormat()
        } finally {
          ozonMenuLoadingAction.value = null
        }
        break
      case 'start_crawl':
        if (!isOzonListLikePage(resolveOzonPageType())) {
          showToast('请在 Ozon 列表或搜索页使用', 3000)
          break
        }
        try {
          startBatchCrawl()
        } catch (e: any) {
          showToast(e?.message || '启动爬取失败', 3000)
        }
        break
      case 'bind_cookie':
        ozonMenuLoadingAction.value = 'bind_cookie'
        try {
          const result = await bindOzonShopCookie()
          showToast(result.success ? '保存店铺成功！' : result.error, result.success ? 3000 : 4000)
        } finally {
          ozonMenuLoadingAction.value = null
        }
        break
      case 'settings':
        await openSettings()
        break
      default:
        break
    }
  }

  return { ozonMenuLoadingAction, handleOzonMenuAction }
}
