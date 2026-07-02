<template>
  <n-button
    size="small"
    :loading="loading"
    :disabled="disabled"
    :type="btnType"
    @click="handleClick"
  >
    <template #icon>
      <n-icon :component="icon" />
    </template>
    {{ label }}
  </n-button>
</template>

<script setup lang="ts">
import { computed, h } from "vue";
import { NButton, NIcon } from "naive-ui";
import {
  LanguageOutline,
  SparklesOutline,
  ImageOutline,
  SwapHorizontalOutline,
  TextOutline,
} from "@vicons/ionicons5";

type AiButtonType = "translate" | "translate-batch" | "optimize" | "image-translate" | "image-replace" | "generate";

const props = defineProps<{
  type: AiButtonType;
  loading?: boolean;
  disabled?: boolean;
  label?: string;
}>();

const emit = defineEmits<{
  (e: "click"): void;
}>();

const labelMap: Record<AiButtonType, string> = {
  translate: "AI翻译",
  "translate-batch": "批量翻译",
  optimize: "AI优化",
  "image-translate": "图片翻译",
  "image-replace": "图片替换",
  generate: "AI生成",
};

const iconMap: Record<AiButtonType, any> = {
  translate: LanguageOutline,
  "translate-batch": TextOutline,
  optimize: SparklesOutline,
  "image-translate": LanguageOutline,
  "image-replace": SwapHorizontalOutline,
  generate: ImageOutline,
};

const btnTypeMap: Record<AiButtonType, "primary" | "info" | "success" | "warning"> = {
  translate: "primary",
  "translate-batch": "primary",
  optimize: "success",
  "image-translate": "info",
  "image-replace": "warning",
  generate: "info",
};

const label = computed(() => props.label || labelMap[props.type]);
const icon = computed(() => iconMap[props.type]);
const btnType = computed(() => btnTypeMap[props.type]);

function handleClick() {
  emit("click");
}
</script>
