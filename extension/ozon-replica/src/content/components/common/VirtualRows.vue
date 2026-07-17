<template>
  <slot
    :visible-items="visibleItems"
    :top-spacer-height="topSpacerHeight"
    :bottom-spacer-height="bottomSpacerHeight"
    :is-virtualizing="shouldVirtualize"
    :set-row-ref="setRowRef"
  />
</template>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onUnmounted,
  ref,
  watch,
} from "vue";

type ScrollAlign = "auto" | "start" | "center" | "end";

interface VisibleItem<T = any> {
  item: T;
  index: number;
}

const props = withDefaults(
  defineProps<{
    items: any[];
    rowHeight?: number;
    overscan?: number;
    scrollTarget?: HTMLElement | null;
    enabled?: boolean;
    minItemsToEnable?: number;
  }>(),
  {
    rowHeight: 104,
    overscan: 6,
    scrollTarget: null,
    enabled: true,
    minItemsToEnable: 30,
  }
);

const scrollTop = ref(0);
const containerHeight = ref(0);
const measuredHeights = ref<Record<number, number>>({});
let boundScrollTarget: HTMLElement | null = null;
let scrollTargetResizeObserver: ResizeObserver | null = null;
let rowResizeObserver: ResizeObserver | null = null;
const rowElementMap = new Map<number, HTMLElement>();

const totalCount = computed(() => props.items.length);
const offsets = computed(() => {
  const values = new Array(totalCount.value + 1).fill(0);
  for (let i = 0; i < totalCount.value; i++) {
    const height = measuredHeights.value[i] ?? props.rowHeight;
    values[i + 1] = values[i] + height;
  }
  return values;
});
const totalHeight = computed(() => offsets.value[totalCount.value] ?? 0);
const shouldVirtualize = computed(
  () =>
    props.enabled &&
    totalCount.value >= props.minItemsToEnable &&
    props.rowHeight > 0 &&
    containerHeight.value > 0
);
const visibleWindowCount = computed(() => {
  if (!shouldVirtualize.value) return totalCount.value;
  return Math.max(1, Math.ceil(containerHeight.value / props.rowHeight));
});

function getOffsetForIndex(index: number): number {
  const safeIndex = Math.min(Math.max(0, index), totalCount.value);
  return offsets.value[safeIndex] ?? 0;
}

function findIndexByOffset(offset: number): number {
  let low = 0;
  let high = totalCount.value;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (getOffsetForIndex(mid + 1) <= offset) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

const startIndex = computed(() => {
  if (!shouldVirtualize.value) return 0;
  return Math.max(0, findIndexByOffset(scrollTop.value) - props.overscan);
});
const endIndex = computed(() => {
  if (!shouldVirtualize.value) return totalCount.value;
  const viewportBottom = scrollTop.value + containerHeight.value;
  let visibleEnd = findIndexByOffset(viewportBottom);
  if (getOffsetForIndex(visibleEnd) < viewportBottom) {
    visibleEnd += 1;
  }
  return Math.min(
    totalCount.value,
    Math.max(
      startIndex.value + visibleWindowCount.value,
      visibleEnd + props.overscan
    )
  );
});
const visibleItems = computed<VisibleItem[]>(() =>
  props.items
    .slice(startIndex.value, endIndex.value)
    .map((item, offset) => ({
      item,
      index: startIndex.value + offset,
    }))
);
const topSpacerHeight = computed(() =>
  shouldVirtualize.value ? getOffsetForIndex(startIndex.value) : 0
);
const bottomSpacerHeight = computed(() => {
  if (!shouldVirtualize.value) return 0;
  return Math.max(0, totalHeight.value - getOffsetForIndex(endIndex.value));
});

function syncMetrics() {
  const target = boundScrollTarget;
  if (!target) {
    scrollTop.value = 0;
    containerHeight.value = 0;
    return;
  }
  scrollTop.value = target.scrollTop;
  containerHeight.value = target.clientHeight;
}

function clampScrollTop() {
  const target = boundScrollTarget;
  if (!target) return;
  const maxScrollTop = Math.max(0, totalHeight.value - target.clientHeight);
  if (target.scrollTop > maxScrollTop) {
    target.scrollTop = maxScrollTop;
  }
  syncMetrics();
}

function handleScroll() {
  syncMetrics();
}

function updateMeasuredHeight(index: number, element: HTMLElement | null) {
  if (!element) return;
  const rect = element.getBoundingClientRect();
  const nextHeight = Math.round(rect.height);
  if (!Number.isFinite(nextHeight) || nextHeight <= 0) return;
  if (measuredHeights.value[index] === nextHeight) return;
  measuredHeights.value = {
    ...measuredHeights.value,
    [index]: nextHeight,
  };
}

function removeObservedRow(index: number) {
  const prev = rowElementMap.get(index);
  if (!prev) return;
  rowResizeObserver?.unobserve(prev);
  rowElementMap.delete(index);
}

function setRowRef(index: number, element: unknown) {
  // 父组件每次 update 都会重调函数 ref；同一 tr 实例时跳过重绑，避免 ResizeObserver 抖动导致行重建失焦
  if (!(element instanceof HTMLElement)) {
    removeObservedRow(index);
    return;
  }
  if (rowElementMap.get(index) === element) return;
  removeObservedRow(index);
  rowElementMap.set(index, element);
  updateMeasuredHeight(index, element);
  rowResizeObserver?.observe(element);
}

function teardownScrollTarget() {
  if (boundScrollTarget) {
    boundScrollTarget.removeEventListener("scroll", handleScroll);
  }
  if (scrollTargetResizeObserver) {
    scrollTargetResizeObserver.disconnect();
    scrollTargetResizeObserver = null;
  }
  boundScrollTarget = null;
}

function setupScrollTarget(target: HTMLElement | null) {
  teardownScrollTarget();
  boundScrollTarget = target;
  if (!boundScrollTarget) {
    syncMetrics();
    return;
  }

  boundScrollTarget.addEventListener("scroll", handleScroll, {
    passive: true,
  });

  if (typeof ResizeObserver !== "undefined") {
    scrollTargetResizeObserver = new ResizeObserver(() => {
      syncMetrics();
    });
    scrollTargetResizeObserver.observe(boundScrollTarget);
  }

  syncMetrics();
}

async function refresh() {
  await nextTick();
  rowElementMap.forEach((element, index) => {
    updateMeasuredHeight(index, element);
  });
  clampScrollTop();
}

function scrollToIndex(index: number, align: ScrollAlign = "auto") {
  const target = boundScrollTarget;
  if (!target || props.rowHeight <= 0) return;

  const safeIndex = Math.min(Math.max(0, index), Math.max(0, totalCount.value - 1));
  const itemTop = getOffsetForIndex(safeIndex);
  const itemHeight = measuredHeights.value[safeIndex] ?? props.rowHeight;
  const itemBottom = itemTop + itemHeight;
  const viewportTop = target.scrollTop;
  const viewportBottom = viewportTop + target.clientHeight;

  let nextScrollTop = viewportTop;
  if (align === "start") {
    nextScrollTop = itemTop;
  } else if (align === "center") {
    nextScrollTop = itemTop - (target.clientHeight - itemHeight) / 2;
  } else if (align === "end") {
    nextScrollTop = itemBottom - target.clientHeight;
  } else {
    if (itemTop < viewportTop) {
      nextScrollTop = itemTop;
    } else if (itemBottom > viewportBottom) {
      nextScrollTop = itemBottom - target.clientHeight;
    }
  }

  const maxScrollTop = Math.max(0, totalHeight.value - target.clientHeight);
  target.scrollTop = Math.min(Math.max(0, nextScrollTop), maxScrollTop);
  syncMetrics();
}

watch(
  () => props.scrollTarget,
  (target) => {
    setupScrollTarget(target ?? null);
  },
  { immediate: true }
);

watch(
  () => [props.items.length, props.rowHeight, props.enabled, props.minItemsToEnable],
  () => {
    measuredHeights.value = {};
    void refresh();
  }
);

if (typeof ResizeObserver !== "undefined") {
  rowResizeObserver = new ResizeObserver((entries) => {
    entries.forEach((entry) => {
      if (!(entry.target instanceof HTMLElement)) return;
      for (const [index, element] of rowElementMap.entries()) {
        if (element !== entry.target) continue;
        updateMeasuredHeight(index, element);
        break;
      }
    });
  });
}

onUnmounted(() => {
  teardownScrollTarget();
  rowResizeObserver?.disconnect();
  rowResizeObserver = null;
  rowElementMap.clear();
});

defineExpose({
  refresh,
  scrollToIndex,
  isVirtualizing: () => shouldVirtualize.value,
});
</script>
