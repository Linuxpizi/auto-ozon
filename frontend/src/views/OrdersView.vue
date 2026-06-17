<template>
  <div class="container">
    <div class="card">
      <div style="margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
        <h2 class="section-title" style="margin: 0;">订单管理</h2>
        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
          <select v-model="filterStoreId" class="select" style="width: 140px;">
            <option value="">全部店铺</option>
            <option v-for="s in appStore.stores" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
          <select v-model="filterStatus" class="select" style="width: 120px;">
            <option value="">全部状态</option>
            <option value="accepted">已接单</option>
            <option value="processing">处理中</option>
            <option value="shipped">已发货</option>
            <option value="delivered">已送达</option>
            <option value="cancelled">已取消</option>
          </select>
          <input
            v-model="keyword"
            class="input"
            style="width: 180px;"
            placeholder="订单号 / 货件号 / 运单号"
            @keyup.enter="searchOrders"
          />
          <button class="button-secondary" @click="searchOrders">搜索</button>
          <button class="button-secondary" @click="refreshOrders">刷新</button>
          <button class="button-primary" @click="syncOrders">一键同步</button>
        </div>
      </div>
      <div v-if="appStore.orderTotal > 0" style="margin-bottom: 12px; font-size: 14px; color: #475569;">
        共 {{ appStore.orderTotal }} 条订单记录
      </div>
      <OrderSummary :orders="appStore.orders" />
      <div v-if="appStore.orderTotal > appStore.orderPageSize" style="margin-top: 16px; display: flex; justify-content: center; align-items: center; gap: 12px;">
        <button class="button-secondary" :disabled="appStore.orderPage <= 1" @click="changePage(appStore.orderPage - 1)">上一页</button>
        <span style="font-size: 14px; color: #475569;">第 {{ appStore.orderPage }} / {{ totalPages }} 页（共 {{ appStore.orderTotal }} 条）</span>
        <button class="button-secondary" :disabled="appStore.orderPage >= totalPages" @click="changePage(appStore.orderPage + 1)">下一页</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { apiPost } from "../api";
import { useAppStore } from "../store";
import OrderSummary from "../components/OrderSummary.vue";

const appStore = useAppStore();
const filterStoreId = ref<number | "">("");
const filterStatus = ref("");
const keyword = ref("");

const totalPages = computed(() => Math.max(1, Math.ceil(appStore.orderTotal / appStore.orderPageSize)));

async function loadOrders() {
  await appStore.fetchOrders({
    store_id: filterStoreId.value || undefined,
    status: filterStatus.value || undefined,
    keyword: keyword.value || undefined,
  });
}

async function searchOrders() {
  appStore.orderPage = 1;
  await loadOrders();
}

function changePage(page: number) {
  appStore.orderPage = page;
  loadOrders();
}

async function refreshOrders() {
  await loadOrders();
}

async function syncOrders() {
  try {
    const result = await apiPost<{ count: number }>("/orders/sync");
    alert(`同步成功，共同步 ${result.count || 0} 条订单`);
    await loadOrders();
  } catch (error: any) {
    console.error(error);
    alert(`同步失败: ${error?.message || "请稍后重试"}`);
  }
}

onMounted(async () => {
  await appStore.fetchStores({ limit: 999 });
  await loadOrders();
});
</script>
