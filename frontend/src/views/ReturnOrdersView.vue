<template>
  <div class="container">
    <div class="page-header">
      <n-h2 class="page-title" style="margin: 0;">退货订单</n-h2>
      <div class="toolbar">
        <n-select v-model:value="filterStoreId"
          :options="[{ label: '全部店铺', value: null }, ...storeOptions]"
          placeholder="全部店铺" clearable style="width: 160px;" size="small" />
        <n-select v-model:value="filterNotified" :options="notifiedOptions" placeholder="通知状态" clearable
          style="width: 130px;" size="small" />
        <n-button size="small" @click="loadReturns">刷新</n-button>
        <n-tag type="info" size="small">共 {{ totalCount }} 条</n-tag>
      </div>
    </div>

    <n-data-table
      :columns="columns"
      :data="returns"
      :loading="loading"
      :bordered="false"
      :single-line="false"
      striped
      size="small"
      :row-key="(r) => r.return_id"
      :scroll-x="1200"
      style="margin-top: 12px;"
    />

    <div style="display: flex; justify-content: flex-end; margin-top: 12px;">
      <n-pagination
        v-model:page="page"
        v-model:page-size="pageSize"
        :page-count="totalPages"
        :page-sizes="[20, 50, 100]"
        show-size-picker
        @update:page="loadReturns"
        @update:page-size="onPageSizeChange"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, h, onMounted, computed } from "vue";
import {
  NDataTable, NH2, NButton, NTag, NSelect, NPagination,
  type DataTableColumns,
} from "naive-ui";
import { apiGet } from "../api";

interface ReturnOrder {
  return_id: string;
  order_id: number;
  posting_number: string;
  store_id: number;
  store_name: string;
  sku: string;
  offer_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  return_price: number;
  return_date: string | null;
  reason: string;
  reason_message: string;
  status: string;
  action: string;
  notified: number;
  created_at: string;
}

const loading = ref(false);
const returns = ref<ReturnOrder[]>([]);
const totalCount = ref(0);
const page = ref(1);
const pageSize = ref(50);
const filterStoreId = ref<number | null>(null);
const filterNotified = ref<number | null>(null);
const storeOptions = ref<{ label: string; value: number }[]>([]);

const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / pageSize.value)));

const notifiedOptions = [
  { label: "已通知", value: 1 },
  { label: "未通知", value: 0 },
];

const columns: DataTableColumns<ReturnOrder> = [
  { title: "退货ID", key: "return_id", width: 140, ellipsis: { tooltip: true } },
  { title: "店铺", key: "store_name", width: 120 },
  { title: "商品", key: "product_name", width: 200, ellipsis: { tooltip: true } },
  { title: "SKU", key: "offer_id", width: 120, ellipsis: { tooltip: true } },
  { title: "数量", key: "quantity", width: 70, align: "center" },
  {
    title: "退货金额",
    key: "return_price",
    width: 100,
    align: "right",
    render(row) {
      return h("span", `¥${(row.return_price || 0).toFixed(2)}`);
    },
  },
  {
    title: "状态",
    key: "status",
    width: 100,
    render(row) {
      const typeMap: Record<string, "warning" | "info" | "success" | "error" | "default"> = {
        pending: "warning",
        approved: "success",
        rejected: "error",
        completed: "info",
      };
      return h(NTag, { size: "small", type: typeMap[row.status] || "default", bordered: false }, () => row.status || "—");
    },
  },
  { title: "退货原因", key: "reason", width: 140, ellipsis: { tooltip: true } },
  {
    title: "通知",
    key: "notified",
    width: 80,
    align: "center",
    render(row) {
      return h(
        NTag,
        { size: "tiny", type: row.notified ? "success" : "warning", bordered: false },
        () => (row.notified ? "已推送" : "待推送"),
      );
    },
  },
  {
    title: "退货日期",
    key: "return_date",
    width: 140,
    render(row) {
      if (!row.return_date) return h("span", "—");
      return h("span", new Date(row.return_date).toLocaleString());
    },
  },
  {
    title: "订单号",
    key: "order_id",
    width: 120,
    render(row) {
      return h("span", String(row.order_id || "—"));
    },
  },
];

async function loadStores() {
  try {
    const data = await apiGet("/stores/");
    storeOptions.value = (Array.isArray(data) ? data : []).map((s: any) => ({
      label: s.name,
      value: s.id,
    }));
  } catch { /* ignore */ }
}

async function loadReturns() {
  loading.value = true;
  try {
    const params: Record<string, any> = {
      skip: (page.value - 1) * pageSize.value,
      limit: pageSize.value,
    };
    if (filterStoreId.value) params.store_id = filterStoreId.value;
    if (filterNotified.value !== null) params.notified = filterNotified.value;

    const data = await apiGet("/return-orders/", params);
    returns.value = Array.isArray(data) ? data : [];

    // Get total count
    const countParams: Record<string, any> = {};
    if (filterStoreId.value) countParams.store_id = filterStoreId.value;
    const countData = await apiGet("/return-orders/count", countParams);
    totalCount.value = countData?.count || 0;
  } catch (err: any) {
    console.error("Failed to load return orders:", err);
    returns.value = [];
  } finally {
    loading.value = false;
  }
}

function onPageSizeChange(size: number) {
  pageSize.value = size;
  page.value = 1;
  loadReturns();
}

onMounted(() => {
  loadStores();
  loadReturns();
});
</script>

<style scoped>
.container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 24px 32px;
}
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
