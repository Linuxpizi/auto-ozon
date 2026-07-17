<template>
  <div class="mjgd_tpl_edit_brand_search" v-click-outside>
    <input
      :value="state.customBrand"
      class="mjgd_tpl_edit_input mjgd_tpl_edit_brand_input"
      placeholder="输入品牌名"
      @input="onBrandKeywordInput(($event.target as HTMLInputElement).value)"
      @focus="onFocus"
    />
    <div v-if="state.brandSearchOpen" class="mjgd_tpl_edit_brand_dropdown">
      <div v-if="state.brandSearchLoading" class="mjgd_tpl_edit_brand_dropdown_empty">搜索中...</div>
      <div v-else-if="!state.brandSearchResults.length" class="mjgd_tpl_edit_brand_dropdown_empty">暂无匹配</div>
      <div
        v-else
        v-for="item in state.brandSearchResults"
        :key="item.id"
        class="mjgd_tpl_edit_brand_dropdown_item"
        @click="selectBrandSearchItem(item)"
      >
        {{ item.value }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import {
  closeBrandSearchDropdown,
  onBrandKeywordInput,
  selectBrandSearchItem,
  templateEditState as state,
} from '../../../../utils/ozonQuickShelve/templateEditController'

const rootRef = ref<HTMLElement | null>(null)

function onFocus() {
  if (state.brandSearchResults.length || state.customBrand.trim()) {
    state.brandSearchOpen = true
  }
}

function onDocumentClick(e: MouseEvent) {
  if (!state.brandSearchOpen) return
  const target = e.target as Node | null
  if (target && rootRef.value && rootRef.value.contains(target)) return
  closeBrandSearchDropdown()
}

const vClickOutside = {
  mounted(el: HTMLElement) {
    rootRef.value = el
  },
  unmounted() {
    rootRef.value = null
  },
}

onMounted(() => document.addEventListener('click', onDocumentClick, true))
onBeforeUnmount(() => document.removeEventListener('click', onDocumentClick, true))
</script>
