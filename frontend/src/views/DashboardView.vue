<template>
  <div class="container">
    <div class="card">
      <h2 class="section-title">仪表盘</h2>
      <div class="grid grid-3">
        <div class="summary-item">
          <h4>总订单</h4>
          <p>{{ summary.total_orders }}</p>
        </div>
        <div class="summary-item">
          <h4>质检单数量</h4>
          <p>{{ summary.quality_check_orders }}</p>
        </div>
        <div class="summary-item">
          <h4>真实订单数量</h4>
          <p>{{ summary.real_orders }}</p>
        </div>
        <div class="summary-item">
          <h4>总 GMV</h4>
          <p>¥ {{ summary.total_gmv.toFixed(2) }}</p>
        </div>
        <div class="summary-item">
          <h4>质检单 GMV</h4>
          <p>¥ {{ summary.quality_check_gmv.toFixed(2) }}</p>
        </div>
        <div class="summary-item">
          <h4>真实 GMV</h4>
          <p>¥ {{ summary.real_gmv.toFixed(2) }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive } from "vue";
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
