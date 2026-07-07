<template>
  <div class="image-editor">
    <!-- Header -->
    <div class="editor-header">
      <span class="editor-title">🖼️ 图片编辑器</span>
      <n-space align="center" :size="12">
        <n-space align="center" :size="6">
          <n-text depth="3" style="font-size:12px">分辨率:</n-text>
          <n-select
            v-model:value="state.resolution"
            :options="resolutionOptions"
            size="small"
            style="width: 130px"
            :disabled="state.processing"
          />
        </n-space>
        <n-space align="center" :size="6">
          <n-text depth="3" style="font-size:12px">比例:</n-text>
          <n-select
            v-model:value="state.sizeRatio"
            :options="sizeRatioOptions"
            size="small"
            style="width: 130px"
            :disabled="state.processing"
          />
        </n-space>
        <n-button size="small" quaternary @click="emit('close')">✕ 关闭</n-button>
      </n-space>
    </div>

    <div class="editor-body">
      <!-- Canvas Area -->
      <div class="canvas-area">
        <ImageCanvas
          ref="canvasRef"
          :image-url="state.currentImageUrl"
          :tool="state.tool"
          :brush-size="state.brushSize"
          :zoom="state.zoom"
          @update:zoom="state.zoom = $event"
          @mask-ready="onMaskReady"
          @selection-ready="onSelectionReady"
          @clear-mask="onCanvasClear"
        />
        <!-- Compare slider -->
        <div v-if="state.showCompare && originalUrl" class="compare-overlay">
          <img :src="originalUrl" class="compare-img" />
          <img :src="state.currentImageUrl" class="compare-img compare-img--after" />
        </div>
      </div>

      <!-- Right Tool Panel -->
      <div class="tool-panel">
        <!-- Prompt Input -->
        <div class="panel-section">
          <div class="section-title">📝 自然语言编辑 <span class="required">*</span></div>
          <n-input
            v-model:value="state.editPrompt"
            type="textarea"
            placeholder="必填：直接描述要怎么修改图片，例如：把背景改成白色、去掉文字、替换为木纹、整体更高级..."
            :rows="5"
            :disabled="state.processing"
          />
          <n-text depth="3" class="hint-text">
            提示词必填；可不选择区域，后端会按这段描述直接编辑整张图。
          </n-text>
        </div>

        <!-- Reference Product Image -->
        <div class="panel-section">
          <div class="section-title">🧩 添加产品图片 <span class="optional">可选</span></div>
          <input
            ref="referenceInputRef"
            type="file"
            accept="image/*"
            class="hidden-file-input"
            :disabled="state.processing"
            @change="onReferenceImageChange"
          />
          <div v-if="state.referenceImagePreview" class="reference-preview">
            <img :src="state.referenceImagePreview" alt="参考产品图" />
          </div>
          <n-space vertical :size="6">
            <n-button
              size="small"
              block
              :disabled="state.processing"
              @click="selectReferenceImage"
            >
              {{ state.referenceImagePreview ? '更换产品图片' : '添加产品图片' }}
            </n-button>
            <n-button
              v-if="state.referenceImagePreview"
              size="small"
              block
              quaternary
              :disabled="state.processing"
              @click="clearReferenceImage"
            >
              移除添加的图片
            </n-button>
          </n-space>
          <n-text depth="3" class="hint-text">
            用途：把添加图片里的产品主体，替换到当前宣传图中的主要产品；前端只原样提交图片，识别和替换逻辑由后端 AI 处理。
          </n-text>
        </div>

        <!-- Selection Tools -->
        <div class="panel-section">
          <div class="section-title">⚡ 快捷操作 <span class="optional">可选</span></div>
          <n-space :wrap="true" :size="[6, 6]">
            <n-button
              size="small"
              :type="state.tool === 'rect' ? 'primary' : 'default'"
              :disabled="state.processing"
              @click="setTool('rect')"
            >
              ⬜ 框选
            </n-button>
            <n-button
              size="small"
              :type="state.tool === 'brush' ? 'primary' : 'default'"
              :disabled="state.processing"
              @click="setTool('brush')"
            >
              🖌️ 画笔
            </n-button>
          </n-space>

          <div class="tool-status">
            <n-text depth="3" style="font-size:12px">
              {{ toolHint }}
            </n-text>
          </div>

          <div v-if="state.tool === 'brush'" class="setting-row" style="margin-top: 8px">
            <span>画笔:</span>
            <n-slider
              v-model:value="state.brushSize"
              :min="5"
              :max="60"
              :step="1"
              style="flex: 1"
            />
            <span style="font-size: 12px; color: #666">{{ state.brushSize }}</span>
          </div>

          <n-space vertical :size="6" style="margin-top: 10px">
            <n-button
              type="primary"
              block
              :loading="state.processing"
              :disabled="!canSubmitEdit"
              @click="executeEdit"
            >
              执行编辑
            </n-button>
            <n-button
              size="small"
              block
              quaternary
              :disabled="state.processing || !state.maskData"
              @click="clearSelections"
            >
              清空选择区域
            </n-button>
          </n-space>

          <n-text depth="3" class="hint-text">
            快捷操作不是必填；不选择区域时会直接按自然语言编辑整张图。已选择 {{ state.selectionCount }} 个区域。
          </n-text>
        </div>

        <!-- Version Timeline -->
        <div class="panel-section">
          <div class="section-title">📜 版本历史</div>
          <div class="version-list">
            <div
              v-for="(v, i) in state.versions"
              :key="v.version_id"
              class="version-item"
              :class="{ 'version-item--active': i === state.currentVersionIndex }"
              @click="restoreVersion(i)"
            >
              <span class="version-dot" />
              <span class="version-label">{{ v.description }}</span>
            </div>
          </div>
          <n-space style="margin-top: 8px">
            <n-button
              size="tiny"
              :disabled="state.currentVersionIndex <= 0"
              @click="undo"
            >
              ↩️ 撤销
            </n-button>
            <n-button
              size="tiny"
              :disabled="state.currentVersionIndex >= state.versions.length - 1"
              @click="redo"
            >
              ↪️ 重做
            </n-button>
          </n-space>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="editor-footer">
      <n-button size="small" @click="state.showCompare = !state.showCompare">
        {{ state.showCompare ? '← 编辑后' : '← 原图对比' }}
      </n-button>
      <n-space :size="8">
        <n-button size="small" @click="downloadImage">📥 下载</n-button>
        <n-button type="primary" size="small" @click="applyToProduct">💾 应用到商品</n-button>
      </n-space>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, computed, watch } from 'vue'
import { NInput, NButton, NSlider, NSpace, NSelect, NText, useMessage } from 'naive-ui'
import ImageCanvas from './ImageCanvas.vue'
import {
  assetUrl,
  editImage,
  RESOLUTION_PRESETS,
  SIZE_RATIOS,
  type VersionNode,
} from '../../api/image'

const props = defineProps({
  imageUrl: { type: String, required: true },
  productId: { type: [String, Number], default: null },
})

const emit = defineEmits<{
  (e: 'apply', url: string): void
  (e: 'close'): void
}>()

const message = useMessage()
const canvasRef = ref<InstanceType<typeof ImageCanvas>>()
const referenceInputRef = ref<HTMLInputElement>()

type SelectionTool = 'brush' | 'rect'

function normalizeImageUrl(url: string): string {
  return assetUrl(url)
}

const originalUrl = ref(normalizeImageUrl(props.imageUrl))

const state = reactive({
  currentImageUrl: normalizeImageUrl(props.imageUrl),
  versions: [] as VersionNode[],
  currentVersionIndex: -1,
  tool: 'rect' as SelectionTool,
  editPrompt: '',
  maskData: null as string | null,
  referenceImageData: null as string | null,
  referenceImagePreview: '',
  selectionCount: 0,
  brushSize: 20,
  resolution: '1k',
  sizeRatio: '3:4',
  processing: false,
  zoom: 1,
  showCompare: false,
})

const resolutionOptions = Object.entries(RESOLUTION_PRESETS).map(([key, v]) => ({
  label: v.label,
  value: key,
}))

const sizeRatioOptions = Object.entries(SIZE_RATIOS).map(([key, v]) => ({
  label: v.label,
  value: key,
}))

const canSubmitEdit = computed(() => {
  return Boolean(state.editPrompt.trim() && !state.processing)
})

const toolHint = computed(() => {
  if (state.tool === 'brush') return '画笔模式：按住鼠标涂抹，可连续绘制多个任意形状区域。'
  return '框选模式：拖拽创建矩形选区，可连续框选多个区域。'
})

// Initialize first version
watch(
  () => props.imageUrl,
  (url) => {
    if (url) {
      const normalizedUrl = normalizeImageUrl(url)
      originalUrl.value = normalizedUrl
      state.currentImageUrl = normalizedUrl
      state.versions = [
        {
          version_id: 'v0',
          description: '原图',
          file: '',
          url: normalizedUrl,
          prompt: null,
          timestamp: new Date().toISOString(),
          parent_version: null,
          output_size: '',
        },
      ]
      state.currentVersionIndex = 0
      state.maskData = null
      clearReferenceImage()
      state.selectionCount = 0
      canvasRef.value?.clearMask()
    }
  },
  { immediate: true }
)

function setTool(tool: SelectionTool) {
  state.tool = tool
}

function clearSelections() {
  canvasRef.value?.clearMask()
}

function selectReferenceImage() {
  referenceInputRef.value?.click()
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('读取图片失败'))
    reader.readAsDataURL(file)
  })
}

async function onReferenceImageChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) {
    message.warning('请选择图片文件')
    return
  }
  try {
    const dataUrl = await fileToDataUrl(file)
    state.referenceImageData = dataUrl
    state.referenceImagePreview = dataUrl
  } catch (e) {
    message.error('读取添加的产品图片失败: ' + normalizeErrorMessage(e))
  }
}

function clearReferenceImage() {
  state.referenceImageData = null
  state.referenceImagePreview = ''
}

function normalizeErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  if (e && typeof e === 'object') {
    const detail = (e as any).detail || (e as any).message
    if (typeof detail === 'string') return detail
    try { return JSON.stringify(detail || e) } catch { /* ignore */ }
  }
  return '未知错误'
}

async function executeEdit() {
  const prompt = state.editPrompt.trim()
  if (!prompt) {
    message.warning('请输入自然语言编辑提示词')
    return
  }

  state.processing = true
  try {
    const res = await editImage({
      image_url: state.currentImageUrl,
      prompt,
      mask: state.maskData || undefined,
      reference_image: state.referenceImageData || undefined,
      resolution: state.resolution,
      size_ratio: state.sizeRatio,
    })
    const resultUrl = normalizeImageUrl(res.result_url)
    state.currentImageUrl = resultUrl
    const description = state.referenceImageData
      ? '产品图替换编辑'
      : state.maskData ? `区域编辑 (${state.selectionCount}区)` : '自然语言编辑'
    pushVersion(resultUrl, description, res.version_id, prompt, res.output_size)
    state.editPrompt = ''
    clearReferenceImage()
    clearSelections()
    message.success('图片编辑完成')
  } catch (e: any) {
    message.error('图片编辑失败: ' + normalizeErrorMessage(e))
  } finally {
    state.processing = false
  }
}

function onMaskReady(base64: string) {
  state.maskData = base64
}

function onSelectionReady() {
  state.selectionCount += 1
}

function onCanvasClear() {
  state.maskData = null
  state.selectionCount = 0
}

function pushVersion(url: string, description: string, versionId?: string, prompt?: string | null, outputSize?: string) {
  const versionNum = state.versions.length
  const normalizedUrl = normalizeImageUrl(url)
  const node: VersionNode = {
    version_id: versionId || `local_v${versionNum}`,
    description,
    file: '',
    url: normalizedUrl,
    prompt: prompt || null,
    timestamp: new Date().toISOString(),
    parent_version: state.versions[state.currentVersionIndex]?.version_id || null,
    output_size: outputSize || `${state.resolution}/${state.sizeRatio}`,
  }
  // Truncate forward history
  state.versions = state.versions.slice(0, state.currentVersionIndex + 1)
  state.versions.push(node)
  state.currentVersionIndex = state.versions.length - 1
}

function undo() {
  if (state.currentVersionIndex > 0) {
    state.currentVersionIndex--
    state.currentImageUrl = state.versions[state.currentVersionIndex].url
    clearSelections()
  }
}

function redo() {
  if (state.currentVersionIndex < state.versions.length - 1) {
    state.currentVersionIndex++
    state.currentImageUrl = state.versions[state.currentVersionIndex].url
    clearSelections()
  }
}

function restoreVersion(index: number) {
  state.currentVersionIndex = index
  state.currentImageUrl = state.versions[index].url
  clearSelections()
}

function downloadImage() {
  const a = document.createElement('a')
  a.href = state.currentImageUrl
  a.download = `edited_image.png`
  a.click()
}

function applyToProduct() {
  emit('apply', state.currentImageUrl)
  message.success('已应用到商品')
}
</script>

<style scoped>
.image-editor {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  background: var(--bg-main, #1a1a2e);
  color: var(--text-primary, #e0e0e0);
  border-radius: 8px;
  overflow: hidden;
  box-sizing: border-box;
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border-color, rgba(255,255,255,0.08));
  background: var(--bg-elevated, #16213e);
  flex-shrink: 0;
}

.editor-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary, #e0e0e0);
}

.editor-body {
  display: flex;
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

.canvas-area {
  flex: 1;
  display: flex;
  align-items: stretch;
  justify-content: stretch;
  overflow: hidden;
  padding: 12px;
  position: relative;
  background: var(--bg-elevated, #16213e);
  min-width: 0;
  min-height: 0;
}

.tool-panel {
  width: 280px;
  flex-shrink: 0;
  height: 100%;
  min-height: 0;
  border-left: 1px solid var(--border-color, rgba(255,255,255,0.08));
  overflow-y: auto;
  padding: 12px;
  background: var(--bg-elevated, #16213e);
}

.panel-section {
  margin-bottom: 14px;
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary, #aaa);
  margin-bottom: 6px;
}

.required {
  color: #ff6b6b;
}

.optional {
  font-size: 11px;
  font-weight: 400;
  color: var(--text-tertiary, #777);
}

.hidden-file-input {
  display: none;
}

.reference-preview {
  width: 100%;
  height: 120px;
  margin-bottom: 8px;
  border: 1px solid var(--border-color, rgba(255,255,255,0.08));
  border-radius: 6px;
  overflow: hidden;
  background: rgba(255,255,255,0.04);
}

.reference-preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.hint-text {
  display: block;
  font-size: 12px;
  line-height: 1.45;
  margin-top: 6px;
}

.tool-status {
  margin-top: 8px;
  padding: 8px;
  border-radius: 4px;
  background: rgba(255,255,255,0.04);
}

.setting-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-primary, #e0e0e0);
}

.version-list {
  max-height: 200px;
  overflow-y: auto;
}

.version-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.version-item:hover {
  background: rgba(255,255,255,0.06);
}

.version-item--active {
  background: rgba(64,158,255,0.15);
  color: #409eff;
  font-weight: 600;
}

.version-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #555;
  flex-shrink: 0;
}

.version-item--active .version-dot {
  background: #409eff;
}

.editor-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-top: 1px solid var(--border-color, rgba(255,255,255,0.08));
  background: var(--bg-elevated, #16213e);
  flex-shrink: 0;
}

.compare-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  background: #000;
  z-index: 10;
}

.compare-img {
  max-width: 50%;
  max-height: 100%;
  object-fit: contain;
}

.compare-img--after {
  border-left: 2px solid #409eff;
}
</style>
