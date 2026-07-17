<template>
  <!-- 无 UI：仅负责 Ozon 列表贴卡生命周期 -->
  <span style="display:none" aria-hidden="true" />
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue'
import { useOzonPageWatch } from '../../utils/ozonList/useOzonPageWatch'
import {
  requestSilentCookieBind,
  tryActivateOzonListFeatures,
} from '../../utils/ozonList/authSession'
import {
  stopOzonListAutoScan,
} from '../../utils/ozonList/ozonListService'
import { stopDetailPageCard } from '../../utils/ozonList/detailPageService'
import { stopImageDownloadButtons } from '../../utils/ozonList/imageDownloadOverlay'

const { ozonPageType } = useOzonPageWatch()

onMounted(() => {
  void (async () => {
    // 本地模式直接启用功能；Cookie 绑定仍由 Ozon 页面状态决定。
    requestSilentCookieBind()
    await tryActivateOzonListFeatures()
  })()
})

onUnmounted(() => {
  stopOzonListAutoScan()
  stopDetailPageCard()
  stopImageDownloadButtons()
})

watch(ozonPageType, (pageType) => {
  void tryActivateOzonListFeatures(pageType)
})
</script>
