<template>
  <div class="mjgd_ai_process_block">
    <div class="process_item">
      <label class="process_item_label">
        <input class="label_checkbox" type="checkbox" checked disabled />
        <span>AI帮填：填充标题/描述/特征属性等内容</span>
      </label>
      <div class="variant_count_box" v-if="showMaxVariantSelect">
        <span class="variant_count_label">最大执行变体数量：</span>
        <select class="item_select select2" :value="String(maxVariantExecutionCount)" @change="onMaxVariantCountChange">
          <option v-for="opt in MAX_VARIANT_EXECUTION_COUNT_OPTIONS" :key="opt" :value="String(opt)">{{ opt }}</option>
        </select>
      </div>
    </div>
    <div class="process_item">
      <label class="process_item_label label2">
        <input class="label_checkbox" type="checkbox" :checked="modelValue.imageTranslateCheck" @change="updateField('imageTranslateCheck', ($event.target as HTMLInputElement).checked)" />
        <span>图片翻译</span>
      </label>
      <select class="item_select" :value="modelValue.imageTranslateType" @change="onSelectChange('imageTranslateType', $event)">
        <option value="package">本地翻译服务</option>
        <option value="points">备用翻译服务</option>
      </select>
      <div class="item_select_box">
        <div>执行内容：</div>
        <select class="item_select select2" :value="modelValue.imageTranslateSelect" @change="onSelectChange('imageTranslateSelect', $event)">
          <option value="sku">全部变体图片</option>
          <option value="sku_and_other">全部变体图片+其他图片（详情图）</option>
        </select>
      </div>
    </div>
    <div class="process_item">
      <label class="process_item_label label2">
        <input class="label_checkbox" type="checkbox" :checked="modelValue.imageRefineCheck" @change="updateField('imageRefineCheck', ($event.target as HTMLInputElement).checked)" />
        <span>AI改图</span>
      </label>
      <select class="item_select" :value="modelValue.imageRefineTemplate" @change="onSelectChange('imageRefineTemplate', $event)">
        <option v-for="t in refineTemplateList" :key="t.id" :value="String(t.id)">{{ t.templateName }}</option>
      </select>
      <div class="item_select_box">
        <div>执行内容：</div>
        <select class="item_select select2" :value="modelValue.imageRefineSelect" @change="onSelectChange('imageRefineSelect', $event)">
          <option value="sku">全部变体图片</option>
          <option value="sku_and_other">全部变体图片+其他图片（详情图）</option>
        </select>
      </div>
    </div>
    <div class="process_item">
      <label class="process_item_label label2">
        <input class="label_checkbox" type="checkbox" :checked="modelValue.imageRichContentCheck" @change="updateField('imageRichContentCheck', ($event.target as HTMLInputElement).checked)" />
        <span>富内容</span>
      </label>
      <select class="item_select" :value="modelValue.imageRichContentTemplate" @change="onSelectChange('imageRichContentTemplate', $event)">
        <option value="other">其他图片（详情图）</option>
        <option value="sku">商品图</option>
        <option value="sku_and_other">商品图+其他图片（详情图）</option>
      </select>
      <div class="item_select_box">
        <div>执行内容：</div>
        <select class="item_select select2" :value="modelValue.imageRichContentSelect" @change="onSelectChange('imageRichContentSelect', $event)">
          <option value="sku">全部变体</option>
        </select>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AiAutoSelectAiStepConfig } from '../utils/aiAutoSelect/types'
import { MAX_VARIANT_EXECUTION_COUNT_OPTIONS, normalizeMaxVariantExecutionCount } from '../utils/maxVariantExecution'

type RefineTemplateItem = {
  id: number | string
  templateName: string
}

const props = withDefaults(defineProps<{
  modelValue: AiAutoSelectAiStepConfig
  refineTemplateList: RefineTemplateItem[]
  showMaxVariantSelect?: boolean
  maxVariantExecutionCount?: number
}>(), {
  showMaxVariantSelect: false,
  maxVariantExecutionCount: 30,
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: AiAutoSelectAiStepConfig): void
  (e: 'update:maxVariantExecutionCount', value: number): void
}>()

function updateField<K extends keyof AiAutoSelectAiStepConfig>(
  key: K,
  value: AiAutoSelectAiStepConfig[K],
) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}

// select.value 在 DOM 类型上是 string，option 已限定合法枚举值，此处断言为配置字段类型
function onSelectChange<K extends keyof AiAutoSelectAiStepConfig>(key: K, event: Event) {
  const value = (event.target as HTMLSelectElement).value as AiAutoSelectAiStepConfig[K]
  updateField(key, value)
}

function onMaxVariantCountChange(event: Event) {
  emit('update:maxVariantExecutionCount', normalizeMaxVariantExecutionCount((event.target as HTMLSelectElement).value))
}
</script>

<style scoped lang="scss">
$text-gray: #606266;
$bg-white: #ffffff;
$border-color: #dcdfe6;

.mjgd_ai_process_block {
  box-sizing: border-box;
  width: 100%;
  background: rgb(255, 255, 255);
  color: rgb(96, 98, 102);
  font-size: 14px;

  .process_item {
    display: flex;
    align-items: center;
    gap: 20px;
    flex-wrap: wrap;

    & + .process_item {
      margin-top: 16px;
    }

    .process_item_label {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;

      &.label2 {
        min-width: 88px;
      }

      .label_checkbox {
        width: 16px;
        height: 16px;
        accent-color: rgb(37, 99, 235);
      }
    }

    .item_select {
      width: 252px;
      padding: 10px 12px;
      background: $bg-white;
      border: 1px solid $border-color;
      border-radius: 6px;
      color: $text-gray;
      font-size: 14px;
      text-overflow: ellipsis;
      cursor: pointer;

      &.select2 {
        width: 270px;
      }
    }

    .item_select_box {
      display: flex;
      align-items: center;
    }

    .variant_count_box {
      display: flex;
      align-items: center;
      margin-left: 25px;
    }

    .variant_count_label {
      font-size: 14px;
      color: $text-gray;
      white-space: nowrap;
    }
  }
}
</style>
