<template>
  <div class="container">
    <div class="card">
      <h2 class="section-title">仪表盘</h2>
      <DashboardSummary :summary="summary" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive } from "vue";
import DashboardSummary from "../components/DashboardSummary.vue";
import { useAppStore } from "../store";

const appStore = useAppStore();
const summary = reactive(appStore.dashboard);

async function loadSummary() {
  try {
    const response = await fetch("http://localhost:8000/api/dashboard/summary");
    const data = await response.json();
    Object.assign(summary, data);
    Object.assign(appStore.dashboard, data);
  } catch (error) {
    console.error("Failed to load dashboard summary", error);
  }
}

onMounted(loadSummary);
</script>
