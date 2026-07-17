<template>
  <div class="mjgd_quick_shelve_pagination">
    <button
      type="button"
      class="mjgd_quick_shelve_pagination_btn"
      :disabled="state.skuPage <= 1"
      @click="prev"
    >
      上一页
    </button>
    <span class="mjgd_quick_shelve_pagination_info">
      第 {{ state.skuPage }} / {{ totalPages }} 页（共 {{ totalCount }} 条）
    </span>
    <button
      type="button"
      class="mjgd_quick_shelve_pagination_btn"
      :disabled="state.skuPage >= totalPages"
      @click="next"
    >
      下一页
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  getQuickShelveTotalPages,
  getVisibleRowCount,
  quickShelveState as state,
} from '../../../../utils/ozonQuickShelve/quickShelveController'

const totalPages = computed(() => getQuickShelveTotalPages())
const totalCount = computed(() => getVisibleRowCount())

function prev() {
  if (state.skuPage > 1) state.skuPage -= 1
}
function next() {
  if (state.skuPage < totalPages.value) state.skuPage += 1
}
</script>
