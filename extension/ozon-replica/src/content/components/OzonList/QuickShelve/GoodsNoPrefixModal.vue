<template>
  <Teleport to="body">
    <div
      v-if="state.goodsNoPrefixModalVisible"
      class="mjgd_goods_no_prefix_mask"
      @click.self="closeGoodsNoPrefixModal"
    >
      <div class="mjgd_goods_no_prefix_dialog" role="dialog" aria-modal="true" aria-labelledby="mjgd_goods_no_prefix_title">
        <div class="mjgd_goods_no_prefix_header">
          <span id="mjgd_goods_no_prefix_title" class="mjgd_goods_no_prefix_title">修改货号前缀</span>
          <button type="button" class="mjgd_goods_no_prefix_close" aria-label="关闭" @click="closeGoodsNoPrefixModal">×</button>
        </div>
        <div class="mjgd_goods_no_prefix_body">
          <input
            v-model="state.goodsNoPrefix"
            class="mjgd_quick_shelve_input mjgd_goods_no_prefix_input"
            placeholder="输入前缀"
            @keyup.enter="handleApply"
          />
          <button type="button" class="mjgd_quick_shelve_btn_apply" @click="handleApply">一键设置</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { showToast } from '../../../../utils/toast'
import {
  applyGoodsNoPrefix,
  closeGoodsNoPrefixModal,
  quickShelveState as state,
} from '../../../utils/ozonQuickShelve/quickShelveController'

function handleApply() {
  if (!state.goodsNoPrefix.trim()) {
    showToast('请输入货号前缀', 2500)
    return
  }
  applyGoodsNoPrefix()
  closeGoodsNoPrefixModal()
}
</script>
