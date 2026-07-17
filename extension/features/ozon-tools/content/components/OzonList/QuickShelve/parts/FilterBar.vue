<template>
  <div class="mjgd_quick_shelve_filter_bar">
    <div class="mjgd_quick_shelve_filter_group mjgd_quick_shelve_filter_group--price">
      <span class="mjgd_quick_shelve_filter_label">现价</span>
      <input v-model="state.filterPriceMin" class="mjgd_quick_shelve_input mjgd_quick_shelve_filter_input" placeholder="最低" />
      <span class="mjgd_quick_shelve_filter_sep">~</span>
      <input v-model="state.filterPriceMax" class="mjgd_quick_shelve_input mjgd_quick_shelve_filter_input" placeholder="最高" />
      <span class="mjgd_quick_shelve_filter_unit">₽</span>
    </div>
    <div v-if="!hideSales" class="mjgd_quick_shelve_filter_group mjgd_quick_shelve_filter_group--sales">
      <span class="mjgd_quick_shelve_filter_label">销量</span>
      <input v-model="state.filterSalesMin" class="mjgd_quick_shelve_input mjgd_quick_shelve_filter_input" placeholder="最低" />
      <span class="mjgd_quick_shelve_filter_sep">~</span>
      <input v-model="state.filterSalesMax" class="mjgd_quick_shelve_input mjgd_quick_shelve_filter_input" placeholder="最高" />
      <span class="mjgd_quick_shelve_filter_unit">件</span>
    </div>
    <div class="mjgd_quick_shelve_filter_group mjgd_quick_shelve_filter_group--date">
      <span class="mjgd_quick_shelve_filter_label">时间</span>
      <input v-model="state.filterDateMin" type="date" class="mjgd_quick_shelve_input mjgd_quick_shelve_filter_date" />
      <span class="mjgd_quick_shelve_filter_sep">~</span>
      <input v-model="state.filterDateMax" type="date" class="mjgd_quick_shelve_input mjgd_quick_shelve_filter_date" />
    </div>
    <div class="mjgd_quick_shelve_filter_actions">
      <button type="button" class="mjgd_quick_shelve_btn_apply" @click="applyFilters">筛选</button>
      <button type="button" class="mjgd_quick_shelve_btn_ghost" @click="clearFilters">重置</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  applyFilters,
  clearFilters,
  quickShelveState as state,
} from '../../../../utils/ozonQuickShelve/quickShelveController'
import { resolveOzonPageType } from '../../../../utils/ozonList/ozonPageContext'

// 旧版详情页隐藏销量筛选行（crawler.js:5187）
const hideSales = computed(() => resolveOzonPageType() === 'detail')
</script>
