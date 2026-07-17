<template>
  <div v-if="visible" class="mjgd_ozon_submit_result_overlay mjgd_plugin_overlay" :class="overlayClass" @click="handleClose">
    <div class="mjgd_ozon_submit_result_modal" @click.stop>
      <div class="mjgd_ozon_submit_result_header" :class="{ is_failure: mode === 'failure' }">
        <div class="mjgd_ozon_submit_result_icon" aria-hidden="true">{{ mode === 'failure' ? '!' : '✓' }}</div>
        <div class="mjgd_ozon_submit_result_header_text">
          <div class="mjgd_ozon_submit_result_title">{{ mode === 'failure' ? '上架失败' : '上架成功' }}</div>
          <div v-if="mode === 'success'" class="mjgd_ozon_submit_result_subtitle">商品已成功提交至 Ozon 平台</div>
          <div v-else class="mjgd_ozon_submit_result_subtitle">以下店铺上架未成功，请根据错误信息修改后重试</div>
        </div>
      </div>
      <div v-if="mode === 'failure'" class="mjgd_ozon_submit_result_body">
        <!-- <div class="mjgd_ozon_submit_result_list_title">共 {{ failures.length }} 条失败记录</div> -->
        <div class="mjgd_ozon_submit_result_list">
          <div v-for="(item, index) in failures" :key="`${item.shopId}-${index}`" class="mjgd_ozon_submit_result_list_item">
            <div class="mjgd_ozon_submit_result_shop_id">店铺 ID: {{ item.shopId }}</div>
            <div class="mjgd_ozon_submit_result_message">{{ item.message }}</div>
          </div>
        </div>
      </div>
      <div class="mjgd_ozon_submit_result_footer">
        <button type="button" class="mjgd_ozon_submit_result_btn_confirm" @click="handleClose">确定</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
export type OzonSubmitFailureItem = {
  shopId: number
  message: string
}

defineProps<{
  visible: boolean
  mode: 'success' | 'failure'
  failures?: OzonSubmitFailureItem[]
  overlayClass?: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

function handleClose() {
  emit('close')
}
</script>

<style scoped lang="scss">
.mjgd_ozon_submit_result_overlay {
  display: flex;
  justify-content: center;
  align-items: center;
  animation: mjgd_ozon_submit_result_fade_in 0.3s ease-in-out;
}

@keyframes mjgd_ozon_submit_result_fade_in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes mjgd_ozon_submit_result_slide_up {
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.mjgd_ozon_submit_result_modal {
  width: 560px;
  max-width: calc(100vw - 48px);
  background: #ffffff;
  border-radius: 14px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
  overflow: hidden;
  animation: mjgd_ozon_submit_result_slide_up 0.3s ease-out;
}

.mjgd_ozon_submit_result_header {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 22px 24px 18px;
  background: #f0f9eb;

  &.is_failure {
    background: #fef0f0;
  }
}

.mjgd_ozon_submit_result_icon {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #67c23a;
  color: #ffffff;
  font-size: 22px;
  font-weight: 700;
  line-height: 40px;
  text-align: center;

  .is_failure & {
    background: #f56c6c;
  }
}

.mjgd_ozon_submit_result_header_text {
  flex: 1;
  min-width: 0;
}

.mjgd_ozon_submit_result_title {
  font-size: 20px;
  font-weight: 700;
  color: #303133;
  line-height: 1.35;
}

.mjgd_ozon_submit_result_subtitle {
  margin-top: 6px;
  font-size: 14px;
  color: #606266;
  line-height: 1.4;

  .is_failure & {
    color: #f56c6c;
  }
}

.mjgd_ozon_submit_result_body {
  padding: 0 24px 20px;
}

.mjgd_ozon_submit_result_list_title {
  position: relative;
  padding-left: 12px;
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  line-height: 1.5;

  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 2px;
    bottom: 2px;
    width: 3px;
    border-radius: 2px;
    background: #f56c6c;
  }
}

.mjgd_ozon_submit_result_list {
  max-height: 240px;
  overflow-y: auto;
  padding: 12px 14px;
  margin-top: 10px;
  background: #f5f7fa;
  border-radius: 8px;
}

.mjgd_ozon_submit_result_list_item {
  & + & {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid #ebeef5;
  }
}

.mjgd_ozon_submit_result_shop_id {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  line-height: 1.5;
}

.mjgd_ozon_submit_result_message {
  margin-top: 4px;
  font-size: 13px;
  color: #606266;
  line-height: 1.65;
  word-break: break-word;
}

.mjgd_ozon_submit_result_footer {
  display: flex;
  justify-content: center;
  gap: 12px;
  padding: 16px 24px 22px;
  border-top: 1px solid #ebeef5;
}

.mjgd_ozon_submit_result_btn_confirm {
  min-width: 120px;
  height: 40px;
  padding: 0 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s, transform 0.2s;
  background: #409eff;
  border: none;
  color: #ffffff;

  &:hover {
    opacity: 0.9;
  }
}
</style>
