<template>
  <Teleport to="body">
    <div
      v-if="state.batchStockModalVisible"
      class="mjgd_batch_stock_mask"
      @click.self="closeBatchStockModal"
    >
      <div class="mjgd_batch_stock_dialog" role="dialog" aria-modal="true">
        <div class="mjgd_batch_stock_header">
          <span class="mjgd_batch_stock_title">批量设置库存</span>
          <button type="button" class="mjgd_batch_stock_close" @click="closeBatchStockModal">×</button>
        </div>
        <div class="mjgd_batch_stock_body">
          <div class="mjgd_batch_stock_row">
            <label class="mjgd_batch_stock_label" for="mjgd_batch_stock_input">库存数量</label>
            <div class="mjgd_batch_stock_stepper">
              <button type="button" class="mjgd_batch_stock_stepper_btn" @click="adjustBatchStockModalValue(-1)">−</button>
              <input
                id="mjgd_batch_stock_input"
                v-model.number="state.batchStockModalValue"
                class="mjgd_batch_stock_stepper_input"
                type="number"
                min="0"
                @blur="normalizeBatchStockModalValue"
              />
              <button type="button" class="mjgd_batch_stock_stepper_btn" @click="adjustBatchStockModalValue(1)">+</button>
            </div>
          </div>
        </div>
        <div class="mjgd_batch_stock_footer">
          <button type="button" class="mjgd_batch_stock_btn" @click="closeBatchStockModal">取消</button>
          <button type="button" class="mjgd_batch_stock_btn mjgd_batch_stock_btn_primary" @click="confirmBatchStockModal">
            确定
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import {
  adjustBatchStockModalValue,
  closeBatchStockModal,
  confirmBatchStockModal,
  normalizeBatchStockModalValue,
  templateEditState as state,
} from '../../../utils/ozonQuickShelve/templateEditController'
</script>
