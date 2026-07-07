<template>
  <div class="image-canvas-wrapper" ref="wrapperRef" @wheel="onWheel">
    <div class="image-canvas-scroll" :style="{ width: scrollWidth + 'px', height: scrollHeight + 'px' }">
      <canvas
        ref="bgCanvas"
        class="bg-canvas"
        :style="{ width: displayWidth + 'px', height: displayHeight + 'px' }"
        @mousedown="onCanvasMouseDown"
      />
      <canvas
        ref="maskCanvas"
        class="mask-canvas"
        :style="{ width: displayWidth + 'px', height: displayHeight + 'px' }"
        @mousedown="onCanvasMouseDown"
      />
      <!-- Editable selection box (rect tool, and brush bounding box after drawing) -->
      <div
        v-if="activeBox"
        class="selection-box"
        :class="{ 'selection-box--brush': tool === 'brush' }"
        :style="selectionStyle"
        @mousedown.stop="onBoxMouseDown($event, 'move')"
      >
        <div
          v-for="h in handles"
          :key="h"
          class="resize-handle"
          :class="'resize-handle--' + h"
          @mousedown.stop="onBoxMouseDown($event, h)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, type PropType } from 'vue'
import { assetUrl } from '../../api'

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

// Brush drawing state
const isDrawing = ref(false)
const lastX = ref(0)
const lastY = ref(0)

// Brush bounding box (in image pixel coords)
const brushMinX = ref(Infinity)
const brushMinY = ref(Infinity)
const brushMaxX = ref(0)
const brushMaxY = ref(0)

// The active editable selection box (image pixel coords). Shared by rect & brush.
const selectionBox = ref<{ x: number; y: number; w: number; h: number } | null>(null)

const MIN_SIZE = 8 // min box size in image px

type HandleDir = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
type DragMode = 'none' | 'creating' | 'move' | HandleDir
const handles: HandleDir[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

const dragMode = ref<DragMode>('none')
// Snapshot at drag start
const dragStartMouse = ref({ x: 0, y: 0 })
const dragStartBox = ref<{ x: number; y: number; w: number; h: number } | null>(null)

// Fit-scale: shrink image to fit container
const fitScale = computed(() => {
  if (!naturalW.value || !naturalH.value) return 1
  const padding = 32
  const availW = Math.max(containerW.value - padding, 200)
  const availH = Math.max(containerH.value - padding, 200)
  const scaleW = availW / naturalW.value
  const scaleH = availH / naturalH.value
  return Math.min(scaleW, scaleH, 1)
})

const effectiveScale = computed(() => fitScale.value * props.zoom)
const displayWidth = computed(() => naturalW.value * effectiveScale.value)
const displayHeight = computed(() => naturalH.value * effectiveScale.value)
// The interaction stage must be EXACTLY the rendered image size. If this is
// larger than the image, clicks/boxes can be measured against a different DOM
// rectangle than the actual image, which breaks frontend → backend coordinate
// mapping.
const scrollWidth = computed(() => Math.max(displayWidth.value, 1))
const scrollHeight = computed(() => Math.max(displayHeight.value, 1))

// activeBox: show for rect (always when box exists) or brush (after drawing)
const activeBox = computed(() => selectionBox.value)

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

// Watch for image change
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
      selectionBox.value = null
      nextTick(() => {
        drawImage()
        initMask()
      })
    }
    image.src = assetUrl(url)
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

function getCanvasCoords(e: MouseEvent): { x: number; y: number } {
  const rect = maskCanvas.value!.getBoundingClientRect()
  if (!rect.width || !rect.height || !naturalW.value || !naturalH.value) {
    return { x: 0, y: 0 }
  }
  return {
    x: clamp(((e.clientX - rect.left) / rect.width) * naturalW.value, 0, naturalW.value),
    y: clamp(((e.clientY - rect.top) / rect.height) * naturalH.value, 0, naturalH.value),
  }
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function clampBoxToImage(box: { x: number; y: number; w: number; h: number }) {
  const x1 = clamp(box.x, 0, naturalW.value)
  const y1 = clamp(box.y, 0, naturalH.value)
  const x2 = clamp(box.x + box.w, 0, naturalW.value)
  const y2 = clamp(box.y + box.h, 0, naturalH.value)
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    w: Math.abs(x2 - x1),
    h: Math.abs(y2 - y1),
  }
}

// ── Canvas mousedown: start creating (rect) or drawing (brush) ─────────

function onCanvasMouseDown(e: MouseEvent) {
  if (props.tool === 'prompt') return
  const { x, y } = getCanvasCoords(e)

  if (props.tool === 'brush') {
    isDrawing.value = true
    lastX.value = x
    lastY.value = y
    attachWindowListeners()
    return
  }

  if (props.tool === 'rect') {
    // Start creating a new selection box
    dragMode.value = 'creating'
    dragStartMouse.value = { x, y }
    selectionBox.value = { x, y, w: 0, h: 0 }
    attachWindowListeners()
  }
}

// ── Selection box interaction (move / resize) ──────────────────────────

function onBoxMouseDown(e: MouseEvent, mode: DragMode) {
  if (props.tool === 'prompt') return
  const { x, y } = getCanvasCoords(e)
  dragMode.value = mode
  dragStartMouse.value = { x, y }
  dragStartBox.value = selectionBox.value ? { ...selectionBox.value } : null
  attachWindowListeners()
}

function onWindowMouseMove(e: MouseEvent) {
  const { x, y } = getCanvasCoords(e)

  // Brush drawing
  if (isDrawing.value && props.tool === 'brush') {
    drawBrushStroke(lastX.value, lastY.value, x, y)
    lastX.value = x
    lastY.value = y
    return
  }

  if (dragMode.value === 'none') return

  if (dragMode.value === 'creating') {
    const sx = dragStartMouse.value.x
    const sy = dragStartMouse.value.y
    const cx = clamp(x, 0, naturalW.value)
    const cy = clamp(y, 0, naturalH.value)
    selectionBox.value = {
      x: Math.min(sx, cx),
      y: Math.min(sy, cy),
      w: Math.abs(cx - sx),
      h: Math.abs(cy - sy),
    }
    return
  }

  const start = dragStartBox.value
  if (!start) return
  const dx = x - dragStartMouse.value.x
  const dy = y - dragStartMouse.value.y

  if (dragMode.value === 'move') {
    let nx = start.x + dx
    let ny = start.y + dy
    nx = clamp(nx, 0, naturalW.value - start.w)
    ny = clamp(ny, 0, naturalH.value - start.h)
    selectionBox.value = { x: nx, y: ny, w: start.w, h: start.h }
    return
  }

  // Resize: compute new edges based on handle direction
  let left = start.x
  let top = start.y
  let right = start.x + start.w
  let bottom = start.y + start.h

  const dir = dragMode.value
  if (dir.includes('w')) left = clamp(start.x + dx, 0, right - MIN_SIZE)
  if (dir.includes('e')) right = clamp(start.x + start.w + dx, left + MIN_SIZE, naturalW.value)
  if (dir.includes('n')) top = clamp(start.y + dy, 0, bottom - MIN_SIZE)
  if (dir.includes('s')) bottom = clamp(start.y + start.h + dy, top + MIN_SIZE, naturalH.value)

  selectionBox.value = { x: left, y: top, w: right - left, h: bottom - top }
}

function onWindowMouseUp() {
  detachWindowListeners()

  // Finish brush stroke
  if (isDrawing.value && props.tool === 'brush') {
    isDrawing.value = false
    if (brushMinX.value !== Infinity) {
      // Set the editable bounding box from the drawn strokes
      selectionBox.value = clampBoxToImage({
        x: brushMinX.value,
        y: brushMinY.value,
        w: brushMaxX.value - brushMinX.value,
        h: brushMaxY.value - brushMinY.value,
      })
      generateMask()
    }
    return
  }

  if (dragMode.value === 'none') return
  dragMode.value = 'none'

  if (!selectionBox.value) return

  // Discard tiny accidental boxes when creating
  if (selectionBox.value.w < MIN_SIZE || selectionBox.value.h < MIN_SIZE) {
    return
  }

  if (props.tool === 'rect') {
    emit('selection-ready', { ...selectionBox.value })
  } else if (props.tool === 'brush') {
    // Regenerate a rectangular mask from the adjusted bounding box (plan A)
    generateRectMaskFromBox()
  }
}

// ── Brush drawing ──────────────────────────────────────────────────────

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

  const tmpCanvas = document.createElement('canvas')
  tmpCanvas.width = naturalW.value
  tmpCanvas.height = naturalH.value
  const tmpCtx = tmpCanvas.getContext('2d')!

  tmpCtx.fillStyle = '#000000'
  tmpCtx.fillRect(0, 0, tmpCanvas.width, tmpCanvas.height)

  const maskData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const targetData = tmpCtx.getImageData(0, 0, tmpCanvas.width, tmpCanvas.height)

  for (let i = 0; i < maskData.data.length; i += 4) {
    if (maskData.data[i + 3] > 0) {
      targetData.data[i] = 255
      targetData.data[i + 1] = 255
      targetData.data[i + 2] = 255
      targetData.data[i + 3] = 255
    }
  }

  tmpCtx.putImageData(targetData, 0, 0)
  emit('mask-ready', tmpCanvas.toDataURL('image/png'))
}

/** Plan A: after adjusting the brush bounding box, produce a rectangular mask. */
function generateRectMaskFromBox() {
  if (!selectionBox.value) return
  const box = selectionBox.value

  const tmpCanvas = document.createElement('canvas')
  tmpCanvas.width = naturalW.value
  tmpCanvas.height = naturalH.value
  const tmpCtx = tmpCanvas.getContext('2d')!

  tmpCtx.fillStyle = '#000000'
  tmpCtx.fillRect(0, 0, tmpCanvas.width, tmpCanvas.height)
  tmpCtx.fillStyle = '#FFFFFF'
  tmpCtx.fillRect(
    Math.round(box.x),
    Math.round(box.y),
    Math.round(box.w),
    Math.round(box.h)
  )

  emit('mask-ready', tmpCanvas.toDataURL('image/png'))
}

// ── Window listener management (so drag continues outside canvas) ──────

function attachWindowListeners() {
  detachWindowListeners()
  window.addEventListener('mousemove', onWindowMouseMove)
  window.addEventListener('mouseup', onWindowMouseUp)
}

function detachWindowListeners() {
  window.removeEventListener('mousemove', onWindowMouseMove)
  window.removeEventListener('mouseup', onWindowMouseUp)
}

function clearMask() {
  initMask()
  selectionBox.value = null
  dragMode.value = 'none'
  emit('clear-mask')
}

function onWheel(e: WheelEvent) {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.1 : 0.1
    const newZoom = Math.max(0.1, Math.min(5, props.zoom + delta))
    emit('update:zoom', newZoom)
  }
}

// Reset selection when switching tools
watch(
  () => props.tool,
  () => {
    selectionBox.value = null
    dragMode.value = 'none'
    initMask()
  }
)

// Track container size
let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  if (wrapperRef.value) {
    const wrapper = wrapperRef.value
    containerW.value = wrapper.clientWidth
    containerH.value = wrapper.clientHeight
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // Observe the fixed wrapper viewport, not the inner image/selection
        // content. This prevents selection boxes or handles from causing a
        // feedback loop where the image is re-fitted and visually grows/shrinks
        // after every click.
        containerW.value = entry.contentRect.width
        containerH.value = entry.contentRect.height
      }
    })
    resizeObserver.observe(wrapper)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  detachWindowListeners()
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
  flex: 1 1 auto;
  align-self: stretch;
  min-width: 0;
  min-height: 0;
  box-sizing: border-box;
}

.image-canvas-scroll {
  position: relative;
  flex: 0 0 auto;
  overflow: hidden;
  box-sizing: content-box;
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
  pointer-events: auto;
  cursor: move;
  box-sizing: border-box;
  max-width: 100%;
  max-height: 100%;
}

.selection-box--brush {
  border-color: rgba(255, 80, 80, 0.8);
  background: rgba(255, 80, 80, 0.06);
}

.resize-handle {
  position: absolute;
  width: 10px;
  height: 10px;
  background: #fff;
  border: 1px solid #409eff;
  border-radius: 2px;
  box-sizing: border-box;
}

.selection-box--brush .resize-handle {
  border-color: rgba(255, 80, 80, 0.9);
}

.resize-handle--nw { left: -6px; top: -6px; cursor: nwse-resize; }
.resize-handle--n  { left: calc(50% - 5px); top: -6px; cursor: ns-resize; }
.resize-handle--ne { right: -6px; top: -6px; cursor: nesw-resize; }
.resize-handle--e  { right: -6px; top: calc(50% - 5px); cursor: ew-resize; }
.resize-handle--se { right: -6px; bottom: -6px; cursor: nwse-resize; }
.resize-handle--s  { left: calc(50% - 5px); bottom: -6px; cursor: ns-resize; }
.resize-handle--sw { left: -6px; bottom: -6px; cursor: nesw-resize; }
.resize-handle--w  { left: -6px; top: calc(50% - 5px); cursor: ew-resize; }
</style>
