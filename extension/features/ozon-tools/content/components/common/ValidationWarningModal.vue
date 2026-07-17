<!-- 校验警告弹窗，用于展示图片超限、变体特征未完善、字段含中文等警告信息 -->
<template>
  <div v-if="visible" class="mjgd_ai_chinese_warning_overlay mjgd_plugin_overlay" :class="overlayClass" @click="handleOverlayClose">
    <div class="mjgd_ai_chinese_warning_modal" @click.stop>
      <div class="mjgd_ai_chinese_warning_header">
        <div class="mjgd_ai_chinese_warning_icon" aria-hidden="true">!</div>
        <div class="mjgd_ai_chinese_warning_header_text">
          <div class="mjgd_ai_chinese_warning_title">{{ headerTitle }}</div>
          <div class="mjgd_ai_chinese_warning_subtitle">{{ headerSubtitle }}</div>
        </div>
      </div>
      <div class="mjgd_ai_chinese_warning_body">
        <p class="mjgd_ai_chinese_warning_desc" v-html="bodyDesc"></p>
        <p v-if="productTitle" class="mjgd_ai_chinese_warning_product_title">{{ productTitle }}</p>
        <div class="mjgd_ai_chinese_warning_list_title">{{ listTitle }}</div>
        <div class="mjgd_ai_chinese_warning_list">
          <div v-for="(item, index) in fields" :key="`${item.label}-${index}`" class="mjgd_ai_chinese_warning_list_item">
            <span class="mjgd_ai_chinese_warning_field_label">{{ item.label }}</span>
            <span class="mjgd_ai_chinese_warning_field_value" :title="item.value">{{ isPlainValueMode ? item.value : `"${item.value}"` }}</span>
          </div>
        </div>
      </div>
      <div class="mjgd_ai_chinese_warning_footer">
        <button type="button" class="mjgd_ai_chinese_warning_btn_back" @click="handleFooterClick">{{ footerButtonText }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { MAX_VARIANT_IMAGE_COUNT } from '../../utils/ozonAiFillAndSubmit'

export type ValidationWarningFieldItem = {
  label: string
  value: string
}

export type ValidationWarningModalMode = 'chinese' | 'image_count' | 'variant_aspect'

const props = defineProps<{
  visible: boolean
  fields: ValidationWarningFieldItem[]
  mode?: ValidationWarningModalMode
  productTitle?: string
  overlayClass?: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'go-edit'): void
}>()

const resolvedMode = computed(() => props.mode ?? 'chinese')
const isImageCountMode = computed(() => resolvedMode.value === 'image_count')
const isVariantAspectMode = computed(() => resolvedMode.value === 'variant_aspect')
// 图片超限与变体特征列表 value 为说明文字，不加引号
const isPlainValueMode = computed(() => isImageCountMode.value || isVariantAspectMode.value)

const headerTitle = computed(() => {
  if (isImageCountMode.value) return '变体图片数量超限'
  if (isVariantAspectMode.value) return '变体特征未完善'
  return '检测到字段含中文'
})

const headerSubtitle = computed(() => {
  if (isImageCountMode.value) {
    return `Ozon 单变体最多支持 ${MAX_VARIANT_IMAGE_COUNT} 张图片，超出将导致上品失败`
  }
  if (isVariantAspectMode.value) {
    return '每个变体需填写变体特征（如颜色、尺码），否则 Ozon 无法区分 SKU、会导致上架失败'
  }
  return '建议使用专业俄语填写以提升曝光与转化'
})

const bodyDesc = computed(() => {
  if (isImageCountMode.value) {
    return `以下变体的图片数量超过 Ozon 上限（${MAX_VARIANT_IMAGE_COUNT}张），请删减后再上架`
  }
  if (isVariantAspectMode.value) {
    return '变体特征用于区分同一商品下的不同 SKU。请为下列变体补充信息后重新上架。'
  }
  return 'Ozon平台不支持中文，含有中文会导致 <span class="mjgd_ai_chinese_warning_highlight">上品失败</span> 我们<span class="mjgd_ai_chinese_warning_highlight">强烈建议使用专业俄语填写</span>'
})

const listTitle = computed(() => {
  if (isImageCountMode.value) {
    return `以下 ${props.fields.length} 个变体图片数量超限：`
  }
  if (isVariantAspectMode.value) {
    return `以下 ${props.fields.length} 个变体需要补充：`
  }
  return `以下 ${props.fields.length} 个字段含有中文：`
})

const footerButtonText = computed(() => {
  if (isImageCountMode.value || isVariantAspectMode.value) return '去修改'
  return '返回修改'
})

function handleOverlayClose() {
  emit('close')
}

function handleFooterClick() {
  // 图片超限 / 变体特征：去修改 → 由父组件跳转对应变体
  if (isImageCountMode.value || isVariantAspectMode.value) {
    emit('go-edit')
    return
  }
  emit('close')
}
</script>

<style scoped lang="scss">
.mjgd_ai_chinese_warning_overlay {
  display: flex;
  justify-content: center;
  align-items: center;
  animation: mjgd_ai_chinese_warning_fade_in 0.3s ease-in-out;
}

@keyframes mjgd_ai_chinese_warning_fade_in {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

@keyframes mjgd_ai_chinese_warning_slide_up {
  from {
    transform: translateY(20px);
    opacity: 0;
  }

  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.mjgd_ai_chinese_warning_modal {
  width: 560px;
  max-width: calc(100vw - 48px);
  background: #ffffff;
  border-radius: 14px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
  overflow: hidden;
  animation: mjgd_ai_chinese_warning_slide_up 0.3s ease-out;
}

.mjgd_ai_chinese_warning_header {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 22px 24px 18px;
  background: #fff7ed;
}

.mjgd_ai_chinese_warning_icon {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #f59e0b;
  color: #ffffff;
  font-size: 22px;
  font-weight: 700;
  line-height: 40px;
  text-align: center;
}

.mjgd_ai_chinese_warning_header_text {
  flex: 1;
  min-width: 0;
}

.mjgd_ai_chinese_warning_title {
  font-size: 20px;
  font-weight: 700;
  color: #303133;
  line-height: 1.35;
}

.mjgd_ai_chinese_warning_subtitle {
  margin-top: 6px;
  font-size: 14px;
  color: #e6a23c;
  line-height: 1.4;
}

.mjgd_ai_chinese_warning_body {
  padding: 0 24px 20px;
}

.mjgd_ai_chinese_warning_product_title {
  margin-bottom: 4px;
  font-size: 13px;
  color: #909399;
  line-height: 1.5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mjgd_ai_chinese_warning_desc {
  margin: 8px 0 10px 0;
  font-size: 14px;
  color: #606266;
  line-height: 1.7;
}

.mjgd_ai_chinese_warning_highlight {
  color: #e6a23c;
  font-weight: 600;
}

.mjgd_ai_chinese_warning_list_title {
  position: relative;
  padding-left: 12px;
  margin-bottom: 10px;
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
    background: #f59e0b;
  }
}

.mjgd_ai_chinese_warning_list {
  height: 168px;
  overflow-y: auto;
  padding: 12px 14px;
  background: #f5f7fa;
  border-radius: 8px;
}

.mjgd_ai_chinese_warning_list_item {
  display: flex;
  flex-wrap: nowrap;
  font-size: 13px;
  line-height: 1.65;
  color: #606266;

  &+& {
    margin-top: 8px;
  }
}

.mjgd_ai_chinese_warning_field_label {
  flex-shrink: 0;
  color: #303133;
  font-weight: 500;
}

.mjgd_ai_chinese_warning_field_value {
  margin-left: 4px;
  color: #909399;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mjgd_ai_chinese_warning_footer {
  display: flex;
  justify-content: center;
  gap: 12px;
  padding: 16px 24px 22px;
  border-top: 1px solid #ebeef5;
}

.mjgd_ai_chinese_warning_btn_back {
  min-width: 120px;
  height: 40px;
  padding: 0 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s, transform 0.2s;
  background: #ffffff;
  border: 1px solid #dcdfe6;
  color: #606266;

  &:hover {
    border-color: #c0c4cc;
    color: #303133;
  }
}
</style>
