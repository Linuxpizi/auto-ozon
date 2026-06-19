<template>
  <div class="container">
    <div class="card">
      <n-h2 prefix="bar" style="margin: 0 0 20px;">仪表盘</n-h2>
      <n-grid :cols="3" :x-gap="20" :y-gap="20">
        <n-gi>
          <div class="summary-item">
            <n-statistic label="总订单" :value="summary.total_orders" />
          </div>
        </n-gi>
        <n-gi>
          <div class="summary-item">
            <n-statistic label="质检单数量" :value="summary.quality_check_orders" />
          </div>
        </n-gi>
        <n-gi>
          <div class="summary-item">
            <n-statistic label="真实订单数量" :value="summary.real_orders" />
          </div>
        </n-gi>
        <n-gi>
          <div class="summary-item">
            <n-statistic label="总 GMV" :value="summary.total_gmv" :precision="2" :prefix="() => '¥'" />
          </div>
        </n-gi>
        <n-gi>
          <div class="summary-item">
            <n-statistic label="质检单 GMV" :value="summary.quality_check_gmv" :precision="2" :prefix="() => '¥'" />
          </div>
        </n-gi>
        <n-gi>
          <div class="summary-item">
            <n-statistic label="真实 GMV" :value="summary.real_gmv" :precision="2" :prefix="() => '¥'" />
          </div>
        </n-gi>
      </n-grid>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive } from "vue";
import { NH2, NGrid, NGi, NStatistic } from "naive-ui";
import { apiGet } from "../api";
import { useAppStore } from "../store";

const appStore = useAppStore();
const summary = reactive(appStore.dashboard);

async function loadSummary() {
  try {
    const data = await apiGet<any>("/dashboard/summary");
    Object.assign(summary, data);
    Object.assign(appStore.dashboard, data);
  } catch (error) {
    console.error("Failed to load dashboard summary", error);
  }
}

onMounted(loadSummary);
</script>
