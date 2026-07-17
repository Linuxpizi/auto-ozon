<template>
  <div class="mjgd_quick_shelve_variant_progress">
    <div class="mjgd_quick_shelve_variant_progress_text">
      <span v-if="hasProgress">变体数据加载中 {{ state.variantLoadProgress.current }}/{{ state.variantLoadProgress.total }}{{ pendingText }}</span>
      <span v-else>正在拉取变体数据，请稍候…</span>
      <span v-if="hasProgress" class="mjgd_quick_shelve_variant_progress_percent">
        {{ percent }}%
      </span>
    </div>
    <div class="mjgd_quick_shelve_variant_progress_track">
      <div
        class="mjgd_quick_shelve_variant_progress_fill"
        :class="{ is_indeterminate: !hasProgress }"
        :style="{ width: hasProgress ? percent + '%' : undefined }"
      ></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { quickShelveState as state } from '../../../../utils/ozonQuickShelve/quickShelveController'

const hasProgress = computed(() => state.variantLoadProgress.total > 0)
const percent = computed(() => {
  const { current, total } = state.variantLoadProgress
  if (!total) return 0
  return Math.min(100, Math.round((current / total) * 100))
})
// 对齐旧版 "（进行中 N）"：仅在有在途请求时显示
const pendingText = computed(() => {
  const p = state.variantLoadProgress.pending
  return p > 0 ? `（进行中 ${p}）` : ''
})
</script>
