<template>
  <div class="container">
    <div class="page-header">
      <n-h2 class="page-title" style="margin: 0;">仪表盘</n-h2>
    </div>
    <n-grid :cols="3" :x-gap="20" :y-gap="20">
      <n-gi v-for="item in stats" :key="item.label">
        <div class="summary-item">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div :style="{ width: '44px', height: '44px', borderRadius: '12px', background: item.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }">
              {{ item.icon }}
            </div>
            <div>
              <div style="font-size: 13px; color: var(--text-secondary); font-weight: 500; margin-bottom: 2px;">{{ item.label }}</div>
              <div style="font-size: 26px; font-weight: 700; color: var(--text-primary);">
                {{ item.prefix }}{{ typeof item.value === 'number' ? item.value.toLocaleString() : item.value }}
              </div>
            </div>
          </div>
        </div>
      </n-gi>
    </n-grid>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive } from "vue";
import { NGrid, NGi, NH2 } from "naive-ui";
import { apiGet } from "../api";
import { useAppStore } from "../store";

const appStore = useAppStore();
const summary = reactive(appStore.dashboard);

const stats = reactive([
  { label: "总订单", value: 0, icon: "📦", bg: "var(--accent-light)" },
  { label: "质检单", value: 0, icon: "🔍", bg: "var(--accent-light)" },
  { label: "真实订单", value: 0, icon: "✅", bg: "var(--accent-light)" },
  { label: "总 GMV", value: 0, icon: "💰", bg: "var(--accent-light)", prefix: "₽" },
  { label: "质检单 GMV", value: 0, icon: "📊", bg: "var(--accent-light)", prefix: "₽" },
  { label: "真实 GMV", value: 0, icon: "📈", bg: "var(--accent-light)", prefix: "₽" },
]);

async function loadSummary() {
  try {
    const data = await apiGet<any>("/dashboard/summary");
    Object.assign(summary, data);
    Object.assign(appStore.dashboard, data);
    stats[0].value = data.total_orders;
    stats[1].value = data.quality_check_orders;
    stats[2].value = data.real_orders;
    stats[3].value = data.total_gmv;
    stats[4].value = data.quality_check_gmv;
    stats[5].value = data.real_gmv;
  } catch (error) {
    console.error("Failed to load dashboard summary", error);
  }
}

onMounted(loadSummary);
</script>
