// Widget 组合式：三方「一键采集 / 复制图片」按钮的显隐与点击逻辑，集中在此以保持 Widget.vue 精简。
import { computed, ref } from 'vue'
import { apiService } from '../../../utils/api'
import { showConfirm } from '../../../utils/messageBox'
import { showToast } from '../../../utils/toast'
import { resolveSourcePlatform } from './platformRegistry'
import { collectImagesForPlatform } from './copyImages'
import { collectProductData } from './collectProduct'

export function useThirdPartyCollect() {
  // host 在单页应用内稳定，启动时识别一次即可（与 Widget 现有 isGoodsDetailPage 处理一致）
  const sourcePlatform = resolveSourcePlatform()
  const oneClickLoading = ref(false)
  /** 列表页点击「一键采集 / 复制图片」时弹窗提示（对齐旧版 alert） */
  const showNeedDetailModal = ref(false)

  /** 三方货源站点显示「一键采集 / 复制图片」（含列表页） */
  const showCollectButtons = computed(() => !!sourcePlatform)
  /** 不支持 AI 的平台隐藏 AI 按钮；非货源站点（Ozon 等）保持现状 */
  const showAiButtons = computed(() => !sourcePlatform || sourcePlatform.supportsAI)

  function promptNeedDetailPage() {
    showNeedDetailModal.value = true
  }

  async function handleOneClickCollect() {
    if (!sourcePlatform || oneClickLoading.value) return
    if (!sourcePlatform.isDetailPage()) {
      promptNeedDetailPage()
      return
    }
    oneClickLoading.value = true
    try {
      const payload = await collectProductData(sourcePlatform)
      if (!payload || (!payload.title && !payload.images)) {
        showToast('未采集到商品数据，请刷新页面后重试')
        return
      }
      await apiService.ozonCollect(payload)
      await showConfirm({
        title: '采集成功',
        message: '商品采集成功,请到软件后台采集箱查看！',
        type: 'success',
        showCancelButton: false,
      })
    } catch (e) {
      console.error('[thirdPartyCollect][oneClick]', e)
      showToast('商品采集失败')
    } finally {
      oneClickLoading.value = false
    }
  }

  function handleCopyImages() {
    if (!sourcePlatform) return
    if (!sourcePlatform.isDetailPage()) {
      promptNeedDetailPage()
      return
    }
    const images = collectImagesForPlatform(sourcePlatform.key)
    if (!images.length) {
      showToast('未找到商品图片，请刷新页面后重试')
      return
    }
    navigator.clipboard
      .writeText(images.join('\n'))
      .then(() => showToast('商品图片已复制，请到后台粘贴使用'))
      .catch((e) => {
        console.error('[thirdPartyCollect][copyImages]', e)
        showToast('复制失败，请重试')
      })
  }

  return {
    sourcePlatform,
    showCollectButtons,
    showAiButtons,
    oneClickLoading,
    showNeedDetailModal,
    handleOneClickCollect,
    handleCopyImages,
  }
}
