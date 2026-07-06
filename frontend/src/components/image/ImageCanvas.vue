<template>
  <div class="image-canvas-wrapper" ref="wrapperRef" @wheel="onWheel">
    <div class="image-canvas-scroll" :style="{ width: scrollWidth + 'px', height: scrollHeight + 'px' }">
      <canvas
        ref="bgCanvas"
        class="bg-canvas"
        :style="{ width: displayWidth + 'px', height: displayHeight + 'px' }"
        @mousedown="onMouseDown"
        @mousemove="onMouseMove"
        @mouseup="onMouseUp"
        @mouseleave="onMouseUp"
      />
      <canvas
        ref="maskCanvas"
        class="mask-canvas"
        :style="{ width: displayWidth + 'px', height: displayHeight + 'px' }"
        @mousedown="onMouseDown"
        @mousemove="onMouseMove"
        @mouseup="onMouseUp"
        @mouseleave="onMouseUp"
      />
      <!-- Selection box overlay (rect tool) -->
      <div
        v-if="tool === 'rect' && selectionBox"
        class="selection-box"
        :style="selectionStyle"
      />
      <!-- Selection box overlay (brush tool - shows bounding box of drawn area) -->
      <div
        v-if="tool === 'brush' && brushBoundingBox"
        class="selection-box selection-box--brush"
        :style="brushBoundingBoxStyle"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, type PropType } from 'vue'

const props = defineProps({
  imageUrl: { type: String, required: true },
  tool: { type: String as PropType<'prompt' | 'brush' | 'rect'>, default: 'prompt' },
  brushSize: { type: Number, default: 20 },
  zoom: { type: Number, default: 1 },
})

const emit = defineEmits<{
  (e: 'update:zoom', v: number): void
  (e: 'mask-ready', base64: string): void
  (e: 'selection-ready', rect: { x: number; y: number; w: number; h: number }): void
  (e: 'clear-mask'): void
}>()

const wrapperRef = ref<HTMLDivElement>()
const bgCanvas = ref<HTMLCanvasElement>()
const maskCanvas = ref<HTMLCanvasElement>()

const img = ref<HTMLImageElement | null>(null)
const naturalW = ref(0)
const naturalH = ref(0)
const containerW = ref(600)
const containerH = ref(400)

const isDrawing = ref(false)
const lastX = ref(0)
const lastY = ref(0)

// Rect selection state
const rectStart = ref<{ x: number; y: number } | null>(null)
const rectEnd = ref<{ x: number; y: number } | null>(null)
const selectionBox = ref<{ x: number; y: number; w: number; h: number } | null>(null)

// Brush bounding box
const brushMinX = ref(Infinity)
const brushMinY = ref(Infinity)
const brushMaxX = ref(0)
const brushMaxY = ref(0)

// Fit-scale: shrink image to fit container
const fitScale = computed(() => {
  if (!naturalW.value || !naturalH.value) return 1
  const padding = 32 // 16px padding each side
  const availW = Math.max(containerW.value - padding, 200)
  const availH = Math.max(containerH.value - padding, 200)
  const scaleW = availW / naturalW.value
  const scaleH = availH / naturalH.value
  return Math.min(scaleW, scaleH, 1) // never scale up, only down
})

const effectiveScale = computed(() => fitScale.value * props.zoom)
const displayWidth = computed(() => naturalW.value * effectiveScale.value)
const displayHeight = computed(() => naturalH.value * effectiveScale.value)
const scrollWidth = computed(() => Math.max(displayWidth.value, 100))
const scrollHeight = computed(() => Math.max(displayHeight.value, 100))

const selectionStyle = computed(() => {
  if (!selectionBox.value) return {}
  const s = effectiveScale.value
  return {
    left: selectionBox.value.x * s + 'px',
    top: selectionBox.value.y * s + 'px',
    width: selectionBox.value.w * s + 'px',
    height: selectionBox.value.h * s + 'px',
  }
})

const brushBoundingBox = computed(() => {
  if (brushMinX.value === Infinity) return null
  return {
    x: brushMinX.value,
    y: brushMinY.value,
    w: brushMaxX.value - brushMinX.value,
    h: brushMaxY.value - brushMinY.value,
  }
})

const brushBoundingBoxStyle = computed(() => {
  const b = brushBoundingBox.value
  const s = effectiveScale.value
  return {
    left: b.x * s + 'px',
    top: b.y * s + 'px',
    width: b.w * s + 'px',
    height: b.h * s + 'px',
    border: '1px dashed rgba(255,80,80,0.6)',
    background: 'none',
  }
})

// Watch for zoom reset when image changes
watch(
  () => props.imageUrl,
  (url) => {
    if (!url) return
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => {
      img.value = image
      naturalW.value = image.naturalWidth
      naturalH.value = image.naturalHeight
      nextTick(() => drawImage())
    }
    image.src = url
  },
  { immediate: true }
)

function drawImage() {
  const canvas = bgCanvas.value
  if (!canvas || !img.value) return
  canvas.width = naturalW.value
  canvas.height = naturalH.value
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img.value, 0, 0)
}

function initMask() {
  const canvas = maskCanvas.value
  if (!canvas) return
  canvas.width = naturalW.value
  canvas.height = naturalH.value
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  brushMinX.value = Infinity
  brushMinY.value = Infinity
  brushMaxX.value = 0
  brushMaxY.value = 0
}

watch(
  () => props.imageUrl,
  () => {
    nextTick(() => initMask())
  },
  { immediate: true }
)

function getCanvasCoords(e: MouseEvent): { x: number; y: number } {
  const rect = maskCanvas.value!.getBoundingClientRect()
  return {
    x: ((e.clientX - rect.left) / rect.width) * naturalW.value,
    y: ((e.clientY - rect.top) / rect.height) * naturalH.value,
  }
}

function onMouseDown(e: MouseEvent) {
  if (props.tool === 'prompt') return
  isDrawing.value = true
  const { x, y } = getCanvasCoords(e)
  lastX.value = x
  lastY.value = y

  if (props.tool === 'rect') {
    rectStart.value = { x, y }
    rectEnd.value = null
    selectionBox.value = null
  }
}

function onMouseMove(e: MouseEvent) {
  if (!isDrawing.value) return
  const { x, y } = getCanvasCoords(e)

  if (props.tool === 'brush') {
    drawBrushStroke(lastX.value, lastY.value, x, y)
    lastX.value = x
    lastY.value = y
  } else if (props.tool === 'rect') {
    rectEnd.value = { x, y }
    if (rectStart.value) {
      selectionBox.value = {
        x: Math.min(rectStart.value.x, x),
        y: Math.min(rectStart.value.y, y),
        w: Math.abs(x - rectStart.value.x),
        h: Math.abs(y - rectStart.value.y),
      }
    }
  }
}

function onMouseUp() {
  if (!isDrawing.value) return
  isDrawing.value = false

  if (props.tool === 'brush' && brushMinX.value !== Infinity) {
    // Generate mask and emit
    generateMask()
  } else if (props.tool === 'rect' && selectionBox.value) {
    emit('selection-ready', selectionBox.value)
  }
}

function drawBrushStroke(x1: number, y1: number, x2: number, y2: number) {
  const canvas = maskCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')!
  ctx.globalCompositeOperation = 'source-over'
  ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)'
  ctx.lineWidth = props.brushSize
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()

  // Update bounding box
  const pad = props.brushSize / 2
  brushMinX.value = Math.min(brushMinX.value, Math.min(x1, x2) - pad)
  brushMinY.value = Math.min(brushMinY.value, Math.min(y1, y2) - pad)
  brushMaxX.value = Math.max(brushMaxX.value, Math.max(x1, x2) + pad)
  brushMaxY.value = Math.max(brushMaxY.value, Math.max(y1, y2) + pad)
}

function generateMask() {
  const canvas = maskCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')!

  // Create a proper mask: white=edit area, black=keep area
  const tmpCanvas = document.createElement('canvas')
  tmpCanvas.width = naturalW.value
  tmpCanvas.height = naturalH.value
  const tmpCtx = tmpCanvas.getContext('2d')!

  // Fill black (keep)
  tmpCtx.fillStyle = '#000000'
  tmpCtx.fillRect(0, 0, tmpCanvas.width, tmpCanvas.height)

  // Read the mask canvas - pixels with alpha > 0 are red (edit area)
  const maskData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const targetData = tmpCtx.getImageData(0, 0, tmpCanvas.width, tmpCanvas.height)

  for (let i = 0; i < maskData.data.length; i += 4) {
    if (maskData.data[i + 3] > 0) {
      // Has color (red) -> white in mask (edit area)
      targetData.data[i] = 255
      targetData.data[i + 1] = 255
      targetData.data[i + 2] = 255
      targetData.data[i + 3] = 255
    }
  }

  tmpCtx.putImageData(targetData, 0, 0)
  emit('mask-ready', tmpCanvas.toDataURL('image/png'))
}

function clearMask() {
  initMask()
  selectionBox.value = null
  rectStart.value = null
  rectEnd.value = null
  emit('clear-mask')
}

function onWheel(e: WheelEvent) {
  if (e.ctrlKey || e.metaKey) {
    // Ctrl+Wheel → zoom
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.1 : 0.1
    const newZoom = Math.max(0.1, Math.min(5, props.zoom + delta))
    emit('update:zoom', newZoom)
  }
  // Normal wheel → let browser handle scroll (pan)
}

// Track container size
let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  if (wrapperRef.value?.parentElement) {
    const parent = wrapperRef.value.parentElement
    containerW.value = parent.clientWidth
    containerH.value = parent.clientHeight
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        containerW.value = entry.contentRect.width
        containerH.value = entry.contentRect.height
      }
    })
    resizeObserver.observe(parent)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
})

// Public methods
defineExpose({ clearMask, initMask })
</script>

<style scoped>
.image-canvas-wrapper {
  position: relative;
  overflow: auto;
  background: #2a2a3e;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 4px;
  cursor: crosshair;
  width: 100%;
  height: 100%;
}

.image-canvas-scroll {
}

.bg-canvas,
.mask-canvas {
  position: absolute;
  top: 0;
  left: 0;
  display: block;
  image-rendering: auto;
}

.mask-canvas {
  left: 0;
  pointer-events: auto;
}

.selection-box {
  position: absolute;
  border: 2px dashed #409eff;
  background: rgba(64, 158, 255, 0.08);
  pointer-events: none;
}

.selection-box--brush {
  border-color: rgba(255, 80, 80, 0.6);
  background: none;
}
</style>
