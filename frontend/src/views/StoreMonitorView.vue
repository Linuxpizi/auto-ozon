<template>
  <div class="container">
    <div style="margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
      <h2 class="section-title" style="margin: 0;">店铺监控</h2>
      <div style="display: flex; gap: 8px; align-items: center;">
        <span style="font-size: 14px; color: #64748b;">{{ lastUpdated }}</span>
        <button class="button-secondary" @click="loadData" :disabled="loading">
          {{ loading ? '刷新中...' : '刷新' }}
        </button>
      </div>
    </div>

    <div v-if="loading && !monitorData.length" style="text-align: center; padding: 48px; color: #64748b;">
      加载中...
    </div>

    <div v-else-if="!monitorData.length" style="text-align: center; padding: 48px; color: #64748b;">
      暂无监控数据，请先同步店铺 SKU 信息。
    </div>

    <div v-else style="display: flex; flex-direction: column; gap: 20px;">
      <div v-for="item in monitorData" :key="item.store_id" class="card">
        <div style="margin-bottom: 16px;">
          <h3 style="margin: 0; font-size: 16px; font-weight: 700;">{{ item.store_name }}</h3>
          <span style="font-size: 13px; color: #64748b;">{{ item.account_name }} · {{ item.date }}</span>
        </div>

        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px;">
          <div>
            <div class="monitor-label">当日余量</div>
            <div class="monitor-value">{{ item.daily_remaining }}</div>
            <div class="bar-track">
              <div class="bar-fill bar-fill-blue" :style="{ width: barPercent(item.daily_remaining, item, 'daily') }"></div>
            </div>
          </div>
          <div>
            <div class="monitor-label">总剩余</div>
            <div class="monitor-value">{{ item.total_remaining }}</div>
            <div class="bar-track">
              <div class="bar-fill bar-fill-green" :style="{ width: barPercent(item.total_remaining, item, 'total') }"></div>
            </div>
          </div>
          <div>
            <div class="monitor-label">有效刊登</div>
            <div class="monitor-value">{{ item.active_listings }}</div>
            <div class="bar-track">
              <div class="bar-fill bar-fill-purple" :style="{ width: barPercent(item.active_listings, item, 'active') }"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, computed } from "vue";

interface MonitorItem {
  store_id: number;
  store_name: string;
  account_name: string;
  daily_remaining: number;
  total_remaining: number;
  active_listings: number;
  date: string;
}

const monitorData = ref<MonitorItem[]>([]);
const loading = ref(false);
const lastUpdated = ref("");

function barPercent(value: number, item: MonitorItem, key: "daily" | "total" | "active") {
  const max = key === "daily"
    ? Math.max(...monitorData.value.map(m => m.daily_remaining), 1)
    : key === "total"
    ? Math.max(...monitorData.value.map(m => m.total_remaining), 1)
    : Math.max(...monitorData.value.map(m => m.active_listings), 1);
  return Math.max(1, (value / max) * 100) + "%";
}

async function loadData() {
  loading.value = true;
  try {
    const res = await fetch("http://localhost:8000/api/monitors/summary");
    if (!res.ok) throw new Error("获取监控数据失败");
    monitorData.value = await res.json();
    lastUpdated.value = "更新于 " + new Date().toLocaleTimeString("zh-CN");
  } catch (e) {
    console.error(e);
    alert("获取监控数据失败，请稍后重试");
  } finally {
    loading.value = false;
  }
}

onMounted(loadData);
</script>

<style scoped>
.monitor-label {
  font-size: 13px;
  color: #64748b;
  margin-bottom: 4px;
}
.monitor-value {
  font-size: 28px;
  font-weight: 700;
  color: #1e293b;
  margin-bottom: 8px;
}
.bar-track {
  width: 100%;
  height: 12px;
  background: #f1f5f9;
  border-radius: 6px;
  overflow: hidden;
}
.bar-fill {
  height: 100%;
  border-radius: 6px;
  transition: width 0.4s ease;
}
.bar-fill-blue {
  background: linear-gradient(90deg, #3b82f6, #60a5fa);
}
.bar-fill-green {
  background: linear-gradient(90deg, #10b981, #34d399);
}
.bar-fill-purple {
  background: linear-gradient(90deg, #8b5cf6, #a78bfa);
}
</style>
