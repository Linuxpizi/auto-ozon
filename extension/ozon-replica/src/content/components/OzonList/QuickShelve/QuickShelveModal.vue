<template>
  <Teleport to="body">
    <div v-if="state.visible" class="mjgd_quick_shelve_mask" @click.self="closeQuickShelve">
      <div class="mjgd_quick_shelve_dialog" role="dialog" aria-modal="true">
        <!-- Header -->
        <div class="mjgd_quick_shelve_header">
          <div class="mjgd_quick_shelve_header_left">
            <img :src="bcsLogoUrl" alt="" class="mjgd_quick_shelve_logo" width="29" height="29" />
            <h3 class="mjgd_quick_shelve_title">Auto Ozon 快速上架</h3>
            <div class="mjgd_quick_shelve_hint">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              温馨提示：只会采集您设置了价格的商品!
            </div>
          </div>
          <div class="mjgd_quick_shelve_header_actions">
            <button
              type="button"
              class="mjgd_quick_shelve_btn_primary"
              :class="{ is_loading: state.submitting }"
              :disabled="state.submitting"
              @click="submitQuickShelveForm"
            >
              <span v-if="state.submitting" class="mjgd_quick_shelve_spinner"></span>
              {{ state.submitting ? '上架中' : '确定' }}
            </button>
            <button type="button" class="mjgd_quick_shelve_btn_cancel" @click="closeQuickShelve">取消</button>
          </div>
        </div>

        <!-- Body：旧版立即可见，各区域独立加载（店铺/模板异步、变体由 SkuTable 内 VariantLoadProgress 显示） -->
        <div class="mjgd_quick_shelve_body">
          <ShopList />
          <section class="mjgd_quick_shelve_right">
            <OperateCards />
            <FilterBar />
            <SkuTable />
          </section>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import {
  closeQuickShelve,
  quickShelveState as state,
  submitQuickShelveForm,
} from '../../../utils/ozonQuickShelve/quickShelveController'
import { resolveAssetUrl } from '../../../../utils/runtime'
import fallbackNewLogo from '../../../../assets/img/newlogo.png'
import ShopList from './parts/ShopList.vue'
import OperateCards from './parts/OperateCards.vue'
import FilterBar from './parts/FilterBar.vue'
import SkuTable from './parts/SkuTable.vue'

const bcsLogoUrl = resolveAssetUrl('src/assets/img/newlogo.png', fallbackNewLogo)
</script>
