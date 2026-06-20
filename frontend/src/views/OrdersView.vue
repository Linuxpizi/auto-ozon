<template>
  <div class="container">
    <div class="page-header">
      <n-h2 class="page-title" style="margin: 0;">订单管理</n-h2>
      <div class="toolbar">
        <n-select v-model:value="filterStoreId"
          :options="[{ label: '全部店铺', value: '' }, ...appStore.stores.map(s => ({ label: s.name, value: s.id }))]"
          placeholder="全部店铺" clearable style="width: 160px;" size="small" />
        <n-select v-model:value="filterStatus" :options="statusOptions" placeholder="全部状态" clearable
          style="width: 160px;" size="small" />
        <n-input v-model:value="keyword" placeholder="订单号 / 货件号 / 运单号" clearable style="width: 200px;"
          size="small" @keyup.enter="searchOrders" />
        <n-button size="small" @click="searchOrders">搜索</n-button>
        <n-button size="small" @click="refreshOrders">刷新</n-button>
        <n-button type="primary" size="small" :loading="syncing" @click="syncOrders">一键同步</n-button>
      </div>
    </div>
    <div class="card">
      <div v-if="appStore.orderTotal > 0" style="margin-bottom: 12px; font-size: 14px; color: var(--text-secondary);">
        共 {{ appStore.orderTotal }} 条订单记录
      </div>
      <OrderSummary :orders="appStore.orders" @ship-order="onShipOrder" @cancel-order="onCancelOrder" />
      <div v-if="appStore.orderTotal > 0"
        class="pagination-footer">
        <n-select :value="appStore.orderPageSize" :options="pageSizes" size="small" style="width: 120px;"
          @update:value="onOrderPageSizeChange" />
        <n-pagination :value="appStore.orderPage" :page-count="totalPages"
          :page-slot="7" @update:page="changePage" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { NH2, NSelect, NInput, NButton, NPagination } from "naive-ui";
import { apiPost } from "../api";
import { useAppStore } from "../store";
import OrderSummary from "../components/OrderSummary.vue";

const appStore = useAppStore();
const filterStoreId = ref<number | null>(null);
const filterStatus = ref<string | null>(null);
const keyword = ref("");
const syncing = ref(false);
const pageSizes = [
  { label: "20 条/页", value: 20 },
  { label: "50 条/页", value: 50 },
  { label: "100 条/页", value: 100 },
];

const statusOptions = [
  { label: "等待登记", value: "awaiting_registration" },
  { label: "接收中", value: "acceptance_in_progress" },
  { label: "等待确认", value: "awaiting_approve" },
  { label: "待包装", value: "awaiting_packaging" },
  { label: "待发货", value: "awaiting_deliver" },
  { label: "仲裁", value: "arbitration" },
  { label: "客户配送仲裁", value: "client_arbitration" },
  { label: "配送中", value: "delivering" },
  { label: "司机正在送货", value: "driver_pickup" },
  { label: "已取消", value: "cancelled" },
  { label: "未接收", value: "not_accepted" },
];

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

function onOrderPageSizeChange(size: number) {
  appStore.orderPageSize = size;
  appStore.orderPage = 1;
  loadOrders();
}

async function refreshOrders() {
  await loadOrders();
}

async function onShipOrder(order: { id: number; order_number: string; shipment_number: string; products_json: string }) {
  if (!confirm(`确认对订单 ${order.order_number} 执行备货？\n\n提示：订单需在5天内完成备货，超时可能被Ozon自动取消`)) return;
  try {
    let product_ids: { product_id: number; quantity: number }[] = [];
    try {
      const all = JSON.parse(order.products_json || "[]");
      if (Array.isArray(all) && all.length > 0) {
        product_ids = all.map((p: any) => ({ product_id: p.product_id, quantity: p.quantity }));
      }
    } catch { /* ignore parse error */ }
    if (product_ids.length === 0) {
      alert("无法获取商品信息，备货取消");
      return;
    }
    await apiPost('/orders/ship', { posting_number: order.shipment_number, product_ids });
    alert('备货请求已发送，请检查订单状态');
    await loadOrders();
  } catch (e: any) {
    alert(`备货失败: ${e?.message || '请稍后重试'}`);
  }
}

async function onCancelOrder(order: { id: number; order_number: string; shipment_number: string }) {
  if (!confirm(`确认取消订单 ${order.order_number} 吗？\n\n取消后无法恢复。`)) return;
  try {
    await apiPost('/orders/cancel', { posting_number: order.shipment_number });
    alert('取消请求已发送');
    await loadOrders();
  } catch (e: any) {
    alert(`取消失败: ${e?.message || '请稍后重试'}`);
  }
}

async function syncOrders() {
  syncing.value = true;
  try {
    const result = await apiPost<{ count: number }>('/orders/sync');
    alert(`同步成功，共同步 ${result.count || 0} 条订单`);
    await loadOrders();
  } catch (error: any) {
    console.error(error);
    alert(`同步失败: ${error?.message || "请稍后重试"}`);
  } finally {
    syncing.value = false;
  }
}

onMounted(async () => {
  await appStore.fetchStores({ limit: 999 });
  await loadOrders();
});
</script>
