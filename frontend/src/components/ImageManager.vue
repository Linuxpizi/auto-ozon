<template>
  <div class="image-manager">
    <div class="image-manager__header">
      <n-space align="center" justify="space-between">
        <n-text strong>商品图片</n-text>
        <n-space>
          <AiButton type="image-translate" :loading="translating" @click="handleTranslateAll" />
          <AiButton type="generate" :loading="generating" @click="handleGenerate" />
        </n-space>
      </n-space>
    </div>

    <n-spin :show="loading">
      <div class="image-manager__grid">
        <div
          v-for="(img, idx) in images"
          :key="idx"
          class="image-manager__item"
        >
          <n-image
            :src="img.url"
            :preview-src="img.result_url || img.url"
            object-fit="cover"
            width="120"
            height="120"
            class="image-manager__thumb"
          />
          <div class="image-manager__actions">
            <n-space :size="4">
              <n-tooltip trigger="hover">
                <template #trigger>
                  <n-button
                    size="tiny"
                    quaternary
                    :loading="img._translating"
                    @click="handleTranslateOne(idx)"
                  >
                    <template #icon><n-icon :component="LanguageOutline" /></template>
                  </n-button>
                </template>
                翻译文字
              </n-tooltip>
              <n-tooltip trigger="hover">
                <template #trigger>
                  <n-button
                    size="tiny"
                    quaternary
                    :loading="img._replacing"
                    @click="handleReplace(idx)"
                  >
                    <template #icon><n-icon :component="SwapHorizontalOutline" /></template>
                  </n-button>
                </template>
                替换背景
              </n-tooltip>
              <n-popconfirm @positive-click="handleRemove(idx)">
                <template #trigger>
                  <n-button size="tiny" quaternary type="error">
                    <template #icon><n-icon :component="TrashOutline" /></template>
                  </n-button>
                </template>
                确认删除此图片?
              </n-popconfirm>
            </n-space>
          </div>
          <div v-if="img.result_url" class="image-manager__badge">
            <n-tag size="tiny" type="success">已处理</n-tag>
          </div>
        </div>

        <div v-if="images.length === 0" class="image-manager__empty">
          <n-empty description="暂无图片" />
        </div>
      </div>
    </n-spin>

    <!-- Generate Dialog -->
    <n-modal v-model:show="showGenerateDialog" preset="dialog" title="AI 生成图片" style="width: 500px">
      <n-form label-placement="left" label-width="80">
        <n-form-item label="商品名">
          <n-input v-model:value="genForm.title" placeholder="商品标题(可选)" />
        </n-form-item>
        <n-form-item label="品类">
          <n-input v-model:value="genForm.category" placeholder="品类关键词" />
        </n-form-item>
        <n-form-item label="风格">
          <n-input v-model:value="genForm.style" placeholder="如: 极简, 科技感" />
        </n-form-item>
        <n-form-item label="数量">
          <n-slider v-model:value="genForm.count" :min="1" :max="4" />
        </n-form-item>
      </n-form>
      <template #action>
        <n-button @click="showGenerateDialog = false">取消</n-button>
        <n-button type="primary" :loading="generating" @click="doGenerate">生成</n-button>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from "vue";
import { useMessage } from "naive-ui";
import { NImage, NButton, NSpace, NTooltip, NPopconfirm, NTag, NEmpty, NSpin, NForm, NFormItem, NInput, NSlider, NModal, NText, NIcon } from "naive-ui";
import { LanguageOutline, SwapHorizontalOutline, TrashOutline } from "@vicons/ionicons5";
import AiButton from "./AiButton.vue";
import { translateImage, translateBatch, replaceImageSubject, generateImage } from "../api/ai";

interface ImageItem {
  url: string;
  result_url?: string;
  original_url?: string;
  _translating?: boolean;
  _replacing?: boolean;
}

const props = defineProps<{
  images: ImageItem[];
  context?: string;
}>();

const emit = defineEmits<{
  (e: "update:images", images: ImageItem[]): void;
  (e: "remove", index: number): void;
}>();

const message = useMessage();
const loading = ref(false);
const translating = ref(false);
const generating = ref(false);
const showGenerateDialog = ref(false);

const genForm = reactive({
  title: "",
  category: "",
  style: "",
  count: 2,
});

// ── Translate All ─────────────────────────────────────────────────────

async function handleTranslateAll() {
  if (props.images.length === 0) {
    message.warning("暂无图片可翻译");
    return;
  }
  translating.value = true;
  try {
    for (let i = 0; i < props.images.length; i++) {
      await handleTranslateOne(i);
    }
    message.success("所有图片文字翻译完成");
  } catch (e: any) {
    message.error(e.message || "翻译失败");
  } finally {
    translating.value = false;
  }
}

// ── Translate One ─────────────────────────────────────────────────────

async function handleTranslateOne(idx: number) {
  const img = props.images[idx];
  if (!img) return;
  img._translating = true;
  try {
    const res = await translateImage({
      image_url: img.url,
      context: props.context,
    });
    if (res.result_url) {
      img.result_url = res.result_url;
      message.success(`图片 ${idx + 1} 翻译完成`);
    } else {
      message.warning(`图片 ${idx + 1} 翻译未返回结果`);
    }
  } catch (e: any) {
    message.error(e.message || "翻译失败");
  } finally {
    img._translating = false;
  }
}

// ── Replace Subject ───────────────────────────────────────────────────

async function handleReplace(idx: number) {
  const img = props.images[idx];
  if (!img) return;
  img._replacing = true;
  try {
    const res = await replaceImageSubject({
      image_url: img.result_url || img.url,
      prompt: "Professional e-commerce product photo on white background, studio lighting",
    });
    if (res.result_url) {
      img.result_url = res.result_url;
      message.success(`图片 ${idx + 1} 替换完成`);
    }
  } catch (e: any) {
    message.error(e.message || "替换失败");
  } finally {
    img._replacing = false;
  }
}

// ── Remove ────────────────────────────────────────────────────────────

function handleRemove(idx: number) {
  emit("remove", idx);
}

// ── Generate ──────────────────────────────────────────────────────────

function handleGenerate() {
  showGenerateDialog.value = true;
}

async function doGenerate() {
  generating.value = true;
  try {
    const res = await generateImage({
      title: genForm.title,
      category: genForm.category,
      style: genForm.style,
      count: genForm.count,
    });
    if (res.images && res.images.length > 0) {
      const newImages = res.images.map((url) => ({ url }));
      emit("update:images", [...props.images, ...newImages]);
      message.success(`生成 ${res.images.length} 张图片`);
      showGenerateDialog.value = false;
    } else {
      message.warning("未生成图片");
    }
  } catch (e: any) {
    message.error(e.message || "生成失败");
  } finally {
    generating.value = false;
  }
}
</script>

<style scoped>
.image-manager__header {
  margin-bottom: 12px;
}
.image-manager__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 16px;
}
.image-manager__item {
  position: relative;
  border: 1px solid var(--n-border-color, #e0e0e6);
  border-radius: 8px;
  overflow: hidden;
  padding: 8px;
}
.image-manager__thumb {
  border-radius: 4px;
}
.image-manager__actions {
  margin-top: 8px;
  text-align: center;
}
.image-manager__badge {
  position: absolute;
  top: 4px;
  right: 4px;
}
.image-manager__empty {
  grid-column: 1 / -1;
  padding: 32px;
  text-align: center;
}
</style>
