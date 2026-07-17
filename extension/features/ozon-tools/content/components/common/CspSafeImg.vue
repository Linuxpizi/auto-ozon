<!-- 图片 CSP 安全展示组件 -->
<template>
  <span class="mjgd_csp_safe_img_root" :class="{ is_fill: fill }">
    <img v-if="displaySrc" ref="imgRef" :src="displaySrc" :alt="alt" :loading="lazyLoad ? 'lazy' : undefined" :class="[{ is_pending: loading }, $attrs.class]" @load="onImgLoad" @error="onImgError" />
    <span v-if="loading" class="mjgd_csp_safe_img_loading" :class="[{ is_fill: fill, is_compact: !showLoadingText }, fill ? undefined : $attrs.class]">
      <span class="mjgd_csp_safe_img_spinner"></span>
      <span v-if="showLoadingText" class="mjgd_csp_safe_img_loading_text">图片加载中</span>
    </span>
  </span>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { needsCspSafeDisplayUrl, useCspSafeImageDisplayMap } from '../../utils/cspSafeImageDisplay'
import { convertOzonImagePath } from '../../../utils/imageProcessor'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  src: string
  alt?: string
  fill?: boolean
  lazyLoad?: boolean
  /** 左栏等小尺寸缩略图关闭文案，避免 loading 被文字撑扁 */
  showLoadingText?: boolean
}>(), { alt: '', fill: false, lazyLoad: true, showLoadingText: true })

const { cspDisplayUrl, isCspDisplayUrlLoading } = useCspSafeImageDisplayMap()
// 仅展示加速：Ozon 国外图投影到国内 CDN 再交给 CSP 安全展示；不回写模型，非 Ozon 域名原样返回
const displaySource = computed(() => convertOzonImagePath(props.src))
const cspLoading = computed(() => isCspDisplayUrlLoading(displaySource.value))
const nativeLoading = ref(false)
const loading = computed(() => cspLoading.value || nativeLoading.value)
const displaySrc = computed(() => {
  void cspLoading.value
  return cspDisplayUrl(displaySource.value)
})

const imgRef = ref<HTMLImageElement | null>(null)
// 换 src 时递增，避免旧图 load/error 误关新图 loading
let loadToken = 0

function finishNativeLoad(token: number): void {
  if (token !== loadToken) return
  nativeLoading.value = false
}

function onImgLoad(): void {
  finishNativeLoad(loadToken)
}

function onImgError(): void {
  finishNativeLoad(loadToken)
}

watch(displaySrc, async (url) => {
  if (!url) {
    nativeLoading.value = false
    return
  }
  // 代理路径：blob 就绪后本地几乎瞬时，不启 nativeLoading，避免多余闪烁
  if (needsCspSafeDisplayUrl(displaySource.value)) {
    nativeLoading.value = false
    return
  }
  const token = ++loadToken
  nativeLoading.value = true
  await nextTick()
  // 缓存命中：已解码则立刻结束，避免转圈卡住
  const el = imgRef.value
  if (token === loadToken && el?.complete && el.naturalWidth > 0) {
    nativeLoading.value = false
  }
}, { immediate: true })
</script>

<style scoped>
.mjgd_csp_safe_img_root {
  position: relative;
  display: inline-block;
  line-height: 0;
  box-sizing: border-box;
}

.mjgd_csp_safe_img_root.is_fill {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
}

.mjgd_csp_safe_img_root.is_fill img {
  width: 100%;
  height: 100%;
  display: block;
}

/* 加载中隐藏半截图，但保留 img 在 DOM 中以触发浏览器加载（避免 v-show + lazy 死锁） */
.mjgd_csp_safe_img_root img.is_pending {
  opacity: 0;
}

/* 非 fill：pending 的 img 不占位，由带尺寸 class 的 loading 占位 */
.mjgd_csp_safe_img_root:not(.is_fill) img.is_pending {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  pointer-events: none;
}

.mjgd_csp_safe_img_loading {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: #f3f4f6;
  box-sizing: border-box;
  overflow: hidden;
  /* 覆盖 root 的 line-height:0，避免加载文案被压成不可见 */
  line-height: normal;
}

.mjgd_csp_safe_img_loading.is_fill {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

/* 紧凑模式：仅转圈，去掉 gap，避免小缩略图里被纵向压扁 */
.mjgd_csp_safe_img_loading.is_compact {
  gap: 0;
}

.mjgd_csp_safe_img_spinner {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border: 2px solid #e5e7eb;
  border-top-color: #409eff;
  border-radius: 50%;
  animation: mjgd_csp_safe_img_spin 0.8s linear infinite;
}

.mjgd_csp_safe_img_loading_text {
  font-size: 12px;
  color: #9ca3af;
  line-height: 1;
}

@keyframes mjgd_csp_safe_img_spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
