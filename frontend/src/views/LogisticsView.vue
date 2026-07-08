<template>
  <div class="container logistics-page">
    <div class="page-header">
      <n-h2 class="page-title" style="margin: 0;">物流</n-h2>
      <div class="toolbar">
        <n-input v-model:value="keyword" placeholder="搜索店铺名称/Client ID" clearable size="small" style="width: 220px;" @keyup.enter="loadStores" />
        <n-button size="small" :loading="loadingStores" @click="loadStores">刷新店铺物流</n-button>
        <n-button type="primary" size="small" :disabled="!selectedStoreId" :loading="loadingOzon" @click="loadOzonLogistics">同步 Ozon 物流</n-button>
      </div>
    </div>

    <section class="doc-hero">
      <div class="doc-hero__content">
        <div class="doc-hero__badge">跨境履约核心</div>
        <h1>跨境就是给物流公司打工</h1>
        <p class="doc-hero__lead">严格对接 Ozon WarehouseAPI：查看店铺仓库、配送方式/物流供应商，并支持批量修改店铺物流配置。</p>
        <a class="doc-hero__cta" href="https://www.kuajing84.com/index/login/register?number=MDAwMDAwMDAwMH66vWWArrmv" target="_blank" rel="noopener noreferrer">
          访问跨境巴士 <span>↗</span>
        </a>
      </div>
      <div class="doc-hero__panel">
        <div class="panel-title">选云仓之前先问 5 个问题</div>
        <ol>
          <li v-for="item in checklist" :key="item.title">
            <span>{{ item.index }}</span>
            <div>
              <strong>{{ item.title }}</strong>
              <p>{{ item.desc }}</p>
            </div>
          </li>
        </ol>
      </div>
    </section>

    <section class="layout-grid">
      <n-card title="店铺物流管理" class="panel-card">
        <template #header-extra>
          <n-tag size="small" type="info">支持批量修改</n-tag>
        </template>
        <n-data-table
          v-model:checked-row-keys="checkedStoreKeys"
          :columns="storeColumns"
          :data="stores"
          :row-key="storeRowKey"
          :loading="loadingStores"
          size="small"
          :max-height="360"
        />
        <div class="bulk-box">
          <n-input v-model:value="bulkWarehouseId" placeholder="批量设置 warehouse_id" clearable />
          <n-select v-model:value="bulkWarehouseStatus" :options="warehouseStatusOptions" placeholder="批量设置状态" clearable />
          <n-button type="primary" :disabled="checkedStoreKeys.length === 0" :loading="savingBulk" @click="bulkUpdateStores">批量修改店铺物流</n-button>
        </div>
      </n-card>

      <n-card title="Ozon 仓库列表（/v2/warehouse/list）" class="panel-card">
        <template #header-extra>
          <n-space>
            <n-tag v-if="selectedStore" size="small" type="success">{{ selectedStore.name }}</n-tag>
            <n-button size="tiny" :disabled="checkedWarehouseKeys.length === 0" :loading="actingWarehouse" @click="bulkWarehouseAction('unarchive')">批量启用</n-button>
            <n-button size="tiny" type="warning" :disabled="checkedWarehouseKeys.length === 0" :loading="actingWarehouse" @click="bulkWarehouseAction('archive')">批量归档</n-button>
          </n-space>
        </template>
        <n-empty v-if="!selectedStoreId" description="请先在左侧选择一个店铺" />
        <n-data-table
          v-else
          v-model:checked-row-keys="checkedWarehouseKeys"
          :columns="warehouseColumns"
          :data="warehouses"
          :row-key="warehouseRowKey"
          :loading="loadingOzon"
          size="small"
          :max-height="360"
        />
      </n-card>
    </section>

    <n-card title="物流供应商 / 配送方式（/v2/delivery-method/list）" class="panel-card supplier-card">
      <n-empty v-if="!selectedStoreId" description="请先选择店铺" />
      <n-data-table v-else :columns="deliveryColumns" :data="deliveryMethods" :loading="loadingOzon" size="small" :max-height="420" />
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { computed, h, onMounted, ref } from "vue";
import { NButton, NCard, NDataTable, NEmpty, NH2, NInput, NSelect, NSpace, NTag, useMessage, type DataTableColumns, type DataTableRowKey } from "naive-ui";
import { apiGet, apiPost, apiPut } from "../api";

interface LogisticsStore {
  id: number;
  name: string;
  client_id: string;
  status: string;
  warehouse_id: string;
  warehouse_status: string;
  type_id: string;
}

interface WarehouseItem {
  warehouse_id: number;
  name: string;
  is_rfbs: boolean;
  is_express: boolean;
  status: string;
  warehouse_type: string;
  address: string;
  phone: string;
  raw?: Record<string, any>;
}

type WarehouseAction = "archive" | "unarchive";

const message = useMessage();
const keyword = ref("");
const stores = ref<LogisticsStore[]>([]);
const warehouses = ref<WarehouseItem[]>([]);
const deliveryMethods = ref<any[]>([]);
const selectedStoreId = ref<number | null>(null);
const checkedStoreKeys = ref<DataTableRowKey[]>([]);
const checkedWarehouseKeys = ref<DataTableRowKey[]>([]);
const bulkWarehouseId = ref("");
const bulkWarehouseStatus = ref<string | null>(null);
const loadingStores = ref(false);
const loadingOzon = ref(false);
const savingBulk = ref(false);
const actingWarehouse = ref(false);

const checklist = [
  { index: "01", title: "物流费", desc: "核算单件毛利时必须先锁定物流费，避免爆款越卖越亏。" },
  { index: "02", title: "贴单费", desc: "确认云仓贴单、打包、耗材等操作费用，批量订单尤其关键。" },
  { index: "03", title: "物流周期", desc: "周期决定承诺时效、买家体验、店铺评分与资金周转。" },
  { index: "04", title: "质检单帮忙处理", desc: "异常件、质检单能否协助处理，决定售后压力和订单损耗。" },
  { index: "05", title: "超规格订单处理", desc: "提前确认超长、超重、超体积订单的处理方案和费用。" },
];

const warehouseStatusOptions = [
  { label: "启用 active", value: "active" },
  { label: "已归档 archived", value: "archived" },
  { label: "Ozon created", value: "created" },
  { label: "停用 disabled", value: "disabled" },
];

const selectedStore = computed(() => stores.value.find((item) => item.id === selectedStoreId.value));
const storeRowKey = (row: LogisticsStore) => row.id;
const warehouseRowKey = (row: WarehouseItem) => row.warehouse_id;

function statusTagType(status?: string) {
  if (!status) return "default";
  if (["active", "created", "enabled"].includes(status)) return "success";
  if (["archived", "disabled"].includes(status)) return "warning";
  return "info";
}

const storeColumns: DataTableColumns<LogisticsStore> = [
  { type: "selection" },
  { title: "店铺", key: "name", minWidth: 150 },
  { title: "Client ID", key: "client_id", minWidth: 130 },
  { title: "warehouse_id", key: "warehouse_id", minWidth: 130 },
  {
    title: "物流状态",
    key: "warehouse_status",
    render: (row) => h(NTag, { size: "small", type: statusTagType(row.warehouse_status) as any }, { default: () => row.warehouse_status || "未设置" }),
  },
  {
    title: "操作",
    key: "actions",
    width: 120,
    render: (row) => h(NButton, { size: "tiny", type: selectedStoreId.value === row.id ? "primary" : "default", onClick: () => selectStore(row.id) }, { default: () => "查看物流" }),
  },
];

const warehouseColumns: DataTableColumns<WarehouseItem> = [
  { type: "selection" },
  { title: "仓库 ID", key: "warehouse_id", width: 150 },
  { title: "仓库名称", key: "name", minWidth: 160 },
  { title: "类型", key: "warehouse_type", width: 110 },
  { title: "rFBS", key: "is_rfbs", width: 80, render: (row) => row.is_rfbs ? "是" : "否" },
  { title: "Express", key: "is_express", width: 90, render: (row) => row.is_express ? "是" : "否" },
  { title: "状态", key: "status", width: 110, render: (row) => h(NTag, { size: "small", type: statusTagType(row.status) as any }, { default: () => row.status || "-" }) },
  { title: "地址", key: "address", minWidth: 220, ellipsis: { tooltip: true } },
  {
    title: "操作",
    key: "actions",
    width: 150,
    render: (row) => h(NSpace, { size: 6 }, { default: () => [
      h(NButton, { size: "tiny", onClick: () => warehouseAction(row.warehouse_id, "unarchive") }, { default: () => "启用" }),
      h(NButton, { size: "tiny", type: "warning", onClick: () => warehouseAction(row.warehouse_id, "archive") }, { default: () => "归档" }),
    ] }),
  },
];

const deliveryColumns: DataTableColumns<any> = [
  { title: "配送方式 ID", key: "id", width: 150, render: (row) => row.id || row.delivery_method_id || row.delivery_method?.id || "-" },
  { title: "名称", key: "name", minWidth: 180, render: (row) => row.name || row.delivery_method?.name || row.tpl_provider_name || "-" },
  { title: "供应商", key: "provider", minWidth: 160, render: (row) => row.provider_name || row.tpl_provider_name || row.delivery_schema || "-" },
  { title: "仓库 ID", key: "warehouse_id", width: 150, render: (row) => row.warehouse_id || row.warehouse?.warehouse_id || "-" },
  { title: "状态", key: "status", width: 120, render: (row) => h(NTag, { size: "small", type: statusTagType(row.status) as any }, { default: () => row.status || "-" }) },
  { title: "截止/时效", key: "cutoff", minWidth: 160, render: (row) => row.cutoff || row.cut_in_time || row.sla_cut_in || "-" },
];

async function loadStores() {
  loadingStores.value = true;
  try {
    stores.value = await apiGet<LogisticsStore[]>("/logistics/stores", { keyword: keyword.value || undefined });
    if (!selectedStoreId.value && stores.value.length) selectedStoreId.value = stores.value[0].id;
  } catch (error: any) {
    message.error(error?.message || "加载店铺物流失败");
  } finally {
    loadingStores.value = false;
  }
}

function normalizeDeliveryMethods(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.delivery_methods)) return data.delivery_methods;
  if (Array.isArray(data?.result?.delivery_methods)) return data.result.delivery_methods;
  if (Array.isArray(data?.result)) return data.result;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

async function selectStore(id: number) {
  selectedStoreId.value = id;
  checkedWarehouseKeys.value = [];
  await loadOzonLogistics();
}

async function loadOzonLogistics() {
  if (!selectedStoreId.value) return;
  loadingOzon.value = true;
  try {
    const [warehouseList, deliveryData] = await Promise.all([
      apiGet<WarehouseItem[]>(`/logistics/stores/${selectedStoreId.value}/warehouses`),
      apiGet<any>(`/logistics/stores/${selectedStoreId.value}/delivery-methods`),
    ]);
    warehouses.value = warehouseList;
    deliveryMethods.value = normalizeDeliveryMethods(deliveryData);
  } catch (error: any) {
    message.error(error?.message || "同步 Ozon 物流失败");
  } finally {
    loadingOzon.value = false;
  }
}

async function bulkUpdateStores() {
  if (!bulkWarehouseId.value && !bulkWarehouseStatus.value) {
    message.warning("请填写 warehouse_id 或选择状态");
    return;
  }
  savingBulk.value = true;
  try {
    await apiPut("/logistics/stores/bulk", {
      store_ids: checkedStoreKeys.value.map(Number),
      warehouse_id: bulkWarehouseId.value || undefined,
      warehouse_status: bulkWarehouseStatus.value || undefined,
    });
    message.success("批量修改店铺物流成功");
    await loadStores();
  } catch (error: any) {
    message.error(error?.message || "批量修改失败");
  } finally {
    savingBulk.value = false;
  }
}

async function warehouseAction(warehouseId: number, action: WarehouseAction) {
  if (!selectedStoreId.value) return;
  actingWarehouse.value = true;
  try {
    await apiPost(`/logistics/stores/${selectedStoreId.value}/warehouse-action`, { warehouse_id: warehouseId, action });
    message.success(action === "archive" ? "仓库已归档" : "仓库已启用");
    await Promise.all([loadStores(), loadOzonLogistics()]);
  } catch (error: any) {
    message.error(error?.message || "修改仓库状态失败");
  } finally {
    actingWarehouse.value = false;
  }
}

async function bulkWarehouseAction(action: WarehouseAction) {
  if (!selectedStoreId.value) return;
  actingWarehouse.value = true;
  try {
    await apiPost(`/logistics/stores/${selectedStoreId.value}/warehouse-actions/bulk`, {
      items: checkedWarehouseKeys.value.map((warehouseId) => ({ warehouse_id: Number(warehouseId), action })),
    });
    message.success(action === "archive" ? "批量归档完成" : "批量启用完成");
    checkedWarehouseKeys.value = [];
    await loadOzonLogistics();
  } catch (error: any) {
    message.error(error?.message || "批量修改仓库状态失败");
  } finally {
    actingWarehouse.value = false;
  }
}

onMounted(async () => {
  await loadStores();
  if (selectedStoreId.value) await loadOzonLogistics();
});
</script>

<style scoped>
.logistics-page { padding-bottom: 40px; }
.toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.doc-hero { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(360px, 0.95fr); gap: 24px; padding: 30px; border-radius: 28px; border: 1px solid rgba(129, 140, 248, 0.3); background: radial-gradient(circle at 18% 10%, rgba(251, 191, 36, 0.25), transparent 26%), radial-gradient(circle at 92% 0%, rgba(56, 189, 248, 0.22), transparent 30%), linear-gradient(135deg, #0f172a 0%, #172554 46%, #312e81 100%); box-shadow: 0 24px 60px rgba(2, 6, 23, 0.3); overflow: hidden; }
.doc-hero__content, .doc-hero__panel { position: relative; z-index: 1; }
.doc-hero__badge { display: inline-flex; margin-bottom: 16px; padding: 6px 12px; border-radius: 999px; border: 1px solid rgba(250, 204, 21, 0.3); background: rgba(250, 204, 21, 0.15); color: #fde68a; font-size: 13px; font-weight: 800; }
.doc-hero h1 { max-width: 680px; margin: 0; color: #fff; font-size: 42px; line-height: 1.12; font-weight: 900; letter-spacing: -0.04em; }
.doc-hero__lead { max-width: 720px; margin: 18px 0 0; color: #cbd5e1; font-size: 17px; line-height: 1.8; }
.doc-hero__cta { display: inline-flex; align-items: center; gap: 8px; margin-top: 28px; padding: 12px 18px; border-radius: 14px; background: linear-gradient(135deg, #f59e0b, #f97316); color: #111827; text-decoration: none; font-weight: 800; box-shadow: 0 16px 36px rgba(249, 115, 22, 0.36); }
.doc-hero__panel { padding: 20px; border-radius: 22px; background: rgba(15, 23, 42, 0.76); border: 1px solid rgba(148, 163, 184, 0.28); backdrop-filter: blur(12px); }
.panel-title { color: #f8fafc; font-size: 16px; font-weight: 800; margin-bottom: 14px; }
.doc-hero__panel ol { display: grid; gap: 12px; margin: 0; padding: 0; list-style: none; }
.doc-hero__panel li { display: flex; gap: 12px; padding: 12px; border-radius: 16px; background: rgba(30, 41, 59, 0.78); border: 1px solid rgba(148, 163, 184, 0.16); }
.doc-hero__panel li > span { color: #fbbf24; font-weight: 900; font-size: 13px; }
.doc-hero__panel strong { display: block; color: #fff; font-size: 14px; }
.doc-hero__panel p { margin: 4px 0 0; color: #b6c2d9; font-size: 12px; line-height: 1.5; }
.layout-grid { display: grid; grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr); gap: 18px; margin-top: 22px; }
.panel-card { border-radius: 20px; box-shadow: var(--shadow-md); }
.supplier-card { margin-top: 18px; }
.bulk-box { display: grid; grid-template-columns: 1fr 180px auto; gap: 10px; margin-top: 14px; }
@media (max-width: 1180px) { .doc-hero, .layout-grid { grid-template-columns: 1fr; } .bulk-box { grid-template-columns: 1fr; } }
</style>
