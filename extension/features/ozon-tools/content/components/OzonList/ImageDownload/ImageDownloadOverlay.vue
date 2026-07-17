<template>
  <Teleport to="body">
    <div
      v-if="snapshot.visible"
      class="mjgd_img_dl_overlay_root"
      :class="isFull ? 'mjgd_img_dl_overlay_full' : 'mjgd_img_dl_overlay_light'"
    >
      <div class="mjgd_img_dl_card">
        <div class="mjgd_img_dl_card_head">
          <span
            class="mjgd_img_dl_spinner"
            :class="{
              mjgd_img_dl_spinner_done: isDone,
              mjgd_img_dl_spinner_error: isError,
            }"
          ></span>
          <span class="mjgd_img_dl_title">{{ statusTitle }}</span>
        </div>

        <div v-if="!isError" class="mjgd_img_dl_stage">{{ stageText }}</div>
        <div v-else class="mjgd_img_dl_error">{{ snapshot.errorText }}</div>

        <div v-if="showProgress" class="mjgd_img_dl_track">
          <div
            :key="snapshot.phase"
            class="mjgd_img_dl_bar"
            :style="{ width: percent + '%' }"
          ></div>
        </div>

        <div class="mjgd_img_dl_actions">
          <template v-if="isError">
            <button
              v-if="snapshot.canRetry"
              type="button"
              class="mjgd_img_dl_btn_action mjgd_img_dl_btn_retry"
              @click="onRetry"
            >
              重试
            </button>
            <button
              type="button"
              class="mjgd_img_dl_btn_action mjgd_img_dl_btn_close"
              @click="onClose"
            >
              关闭
            </button>
          </template>
          <button
            v-else-if="!isDone"
            type="button"
            class="mjgd_img_dl_btn_action mjgd_img_dl_btn_cancel"
            @click="onCancel"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import {
  cancelImageDownload,
  closeImageDownloadOverlay,
  computePhasePercent,
  getImageDownloadSnapshot,
  retryImageDownload,
  subscribeImageDownload,
} from '../../../utils/ozonList/imageDownloadController'
import { showToast } from '../../../../utils/toast'

const snapshot = ref(getImageDownloadSnapshot())
let unsubscribe: (() => void) | null = null

const isFull = computed(() => snapshot.value.mode === 'all')
const isDone = computed(() => snapshot.value.phase === 'done')
const isError = computed(() => snapshot.value.phase === 'error')

const percent = computed(() => computePhasePercent(snapshot.value))

const showProgress = computed(() => !isError.value)

const statusTitle = computed(() => {
  switch (snapshot.value.phase) {
    case 'loading_variants':
      return '正在加载商品变体'
    case 'downloading_images':
      return '正在下载图片'
    case 'packing':
      return '正在打包压缩包'
    case 'done':
      return '下载完成'
    case 'error':
      return '下载失败'
    default:
      return '准备中'
  }
})

const stageText = computed(() => {
  const s = snapshot.value
  switch (s.phase) {
    case 'loading_variants':
      return s.variantTotal > 0
        ? `正在加载商品变体 (${s.variantCurrent}/${s.variantTotal})`
        : '正在加载商品变体…'
    case 'downloading_images':
      return `正在下载图片 (${s.imageCurrent}/${s.imageTotal})`
    case 'packing':
      return '正在打包压缩包…'
    case 'done':
      return '压缩包已开始下载'
    default:
      return '请稍候…'
  }
})

function onCancel() {
  // 与爬取相反：取消即全部作废、遮罩立即关闭，不保留半成品
  cancelImageDownload()
  showToast('已取消下载', 2000)
}

function onClose() {
  closeImageDownloadOverlay()
}

function onRetry() {
  retryImageDownload()
}

onMounted(() => {
  unsubscribe = subscribeImageDownload(() => {
    snapshot.value = getImageDownloadSnapshot()
  })
})

onUnmounted(() => {
  unsubscribe?.()
})
</script>
