<template>
  <div class="container">
    <div class="card">
      <div class="page-header">
        <n-h2 class="page-title" style="margin: 0;">商品管理</n-h2>
        <n-space>
          <n-button type="primary" size="small" @click="loadListings" :loading="loading">刷新</n-button>
        </n-space>
      </div>

      <n-space style="margin-bottom: 12px;" align="center">
        <n-select
          v-model:value="filterStoreId"
          :options="[{ label: '全部店铺', value: '' }, ...appStore.stores.map(s => ({ label: s.name, value: s.id }))]"
          placeholder="全部店铺"
          clearable
          style="width: 180px;"
          size="small"
        />
        <n-select
          v-model:value="filterArchived"
          :options="[
            { label: '全部', value: '' },
            { label: '在售', value: false },
            { label: '已归档', value: true },
          ]"
          placeholder="归档状态"
          clearable
          style="width: 120px;"
          size="small"
        />
        <n-input
          v-model:value="keyword"
          placeholder="搜索 Product ID / Offer ID"
          clearable
          style="width: 220px;"
          size="small"
          @keyup.enter="loadListings"
        />
        <n-button size="small" @click="loadListings">搜索</n-button>
      </n-space>

      <n-space style="margin-bottom: 12px;" v-if="selectedIds.length > 0">
        <n-button type="warning" size="small" @click="batchArchiveOzon">
          批量归档 (Ozon)
        </n-button>
        <n-button type="info" size="small" @click="batchImport">
          批量迁移
        </n-button>
        <span style="color: var(--text-muted); font-size: 12px; line-height: 30px;">
          已选 {{ selectedIds.length }} 项
        </span>
      </n-space>

      <n-data-table
        :columns="columns"
        :data="listings"
        :loading="loading"
        :row-key="(row: any) => row.id"
        :checked-row-keys="selectedIds"
        @update:checked-row-keys="onCheck"
        size="small"
        :pagination="pagination"
        remote
        @update:page="onPageChange"
        @update:page-size="onPageSizeChange"
      />
    </div>

    <n-modal v-model:show="stockModalVisible" preset="card" title="修改库存" style="width: 400px;" :segmented="{ content: true }">
      <div v-if="stockTarget" style="margin-bottom: 12px;">
        <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 4px;">{{ stockTarget.name || stockTarget.offer_id }}</div>
        <div style="font-size: 12px; color: var(--text-muted);">Product ID: {{ stockTarget.product_id }} | 店铺: {{ stockTarget.store_name }}</div>
      </div>
      <n-input-number v-model:value="stockValue" :min="0" :max="999999" placeholder="输入新库存数量" style="width: 100%;" />
      <template #footer>
        <n-space justify="end">
          <n-button @click="stockModalVisible = false">取消</n-button>
          <n-button type="primary" :loading="stockModalLoading" @click="submitStock">确认</n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { h, onMounted, ref, reactive, watch } from "vue";
import { NH2, NButton, NDataTable, NSpace, NTag, NSelect, NInput, NModal, NCard, NInputNumber, useMessage } from "naive-ui";
import type { DataTableColumns } from "naive-ui";
import { useAppStore } from "../store";
import { apiGet, apiPost } from "../api";

const appStore = useAppStore();
const message = useMessage();

const listings = ref<any[]>([]);
const loading = ref(false);
const filterStoreId = ref<number | "">("");
const filterArchived = ref<boolean | "">("");
const keyword = ref("");
const selectedIds = ref<number[]>([]);
const page = ref(1);
const total = ref(0);
const pageSize = ref(20);

// Stock update modal
const stockModalVisible = ref(false);
const stockModalLoading = ref(false);
const stockTarget = ref<any>(null);
const stockValue = ref<number | null>(null);

const pageSizes = [
  { label: "20 条/页", value: 20 },
  { label: "50 条/页", value: 50 },
  { label: "100 条/页", value: 100 },
];

const pagination = reactive({
  page: 1,
  pageSize: 20,
  showSizePicker: true,
  pageSizes,
  pageSlot: 9,
  itemCount: 0,
  prefix: ({ itemCount }: { itemCount: number }) => `共 ${itemCount} 条`,
});

function boolTag(val: boolean, trueText: string, falseText: string) {
  return h(
    NTag,
    { type: val ? "success" : "default", size: "small", round: true },
    () => val ? trueText : falseText,
  );
}

const columns: DataTableColumns<any> = [
  { type: "selection" },
  {
    title: "店铺",
    key: "store_name",
    width: 100,
    ellipsis: { tooltip: true },
  },
  {
    title: "SKU Image",
    key: "primary_image",
    width: 70,
    align: "center",
    render(row) {
      if (!row.primary_image) return h("span", { style: "color: var(--text-muted);" }, "—");
      return h("img", {
        src: row.primary_image,
        style: "width: 40px; height: 40px; object-fit: cover; border-radius: 4px;",
        onError: (e: Event) => { (e.target as HTMLImageElement).style.display = "none"; },
      });
    },
  },
  {
    title: "Product ID",
    key: "product_id",
    width: 130,
    ellipsis: { tooltip: true },
  },
  {
    title: "Offer ID",
    key: "offer_id",
    width: 150,
    ellipsis: { tooltip: true },
  },
  {
    title: "SKU",
    key: "sku",
    width: 110,
    ellipsis: { tooltip: true },
    render(row) { return row.sku || "—"; },
  },
  {
    title: "商品名",
    key: "name",
    width: 180,
    ellipsis: { tooltip: true },
    render(row) { return row.name || "—"; },
  },
  {
    title: "价格",
    key: "price",
    width: 90,
    align: "right",
    render(row) {
      if (!row.price) return "—";
      return row.old_price && row.old_price !== row.price
        ? h("span", {}, [
            h("span", { style: "color:var(--text-muted); text-decoration:line-through; font-size:11px; margin-right:4px;" }, row.old_price),
            h("span", { style: "color:var(--warning); font-weight:600;" }, row.price),
          ])
        : h("span", { style: "font-weight:600;" }, row.price);
    },
  },
  {
    title: "FBO",
    key: "has_fbo_stocks",
    width: 55,
    align: "center",
    render(row) { return boolTag(row.has_fbo_stocks, "有", "无"); },
  },
  {
    title: "FBS",
    key: "has_fbs_stocks",
    width: 55,
    align: "center",
    render(row) { return boolTag(row.has_fbs_stocks, "有", "无"); },
  },
  {
    title: "归档",
    key: "archived",
    width: 65,
    align: "center",
    render(row) {
      return row.archived
        ? h(NTag, { type: "error", size: "small", round: true }, () => "是")
        : h(NTag, { type: "default", size: "small", round: true }, () => "否");
    },
  },
  {
    title: "打折",
    key: "is_discounted",
    width: 65,
    align: "center",
    render(row) {
      return row.is_discounted
        ? h(NTag, { type: "warning", size: "small", round: true }, () => "是")
        : h(NTag, { type: "default", size: "small", round: true }, () => "否");
    },
  },
  {
    title: "操作",
    key: "actions",
    width: 120,
    fixed: "right",
    render(row) {
      return h(NSpace, { size: 6 }, () => [
        !row.archived
          ? h(NButton, { size: "small", onClick: () => archiveSingle(row) }, () => "归档")
          : null,
        h(NButton, { size: "small", onClick: () => importSingle(row) }, () => "迁移"),
        h(NButton, { size: "small", type: "success", onClick: () => openStockModal(row) }, () => "改库存"),
      ]);
    },
  },
];

function onCheck(keys: any[]) {
  selectedIds.value = keys as number[];
}

function onPageChange(p: number) {
  page.value = p;
  loadListings();
}

function onPageSizeChange(size: number) {
  pageSize.value = size;
  page.value = 1;
  pagination.pageSize = size;
  loadListings();
}

async function loadListings() {
  loading.value = true;
  try {
    const params: Record<string, string | number | boolean> = {
      skip: (page.value - 1) * pageSize.value,
      limit: pageSize.value,
    };
    if (filterStoreId.value !== "") params.store_id = filterStoreId.value as number;
    if (filterArchived.value !== "") params.archived = filterArchived.value as boolean;
    if (keyword.value) params.keyword = keyword.value;

    const [data, countData] = await Promise.all([
      apiGet<any[]>("/listings/", params),
      apiGet<{ total: number }>("/listings/count", params),
    ]);
    listings.value = data;
    total.value = countData.total;
    pagination.itemCount = countData.total;
    pagination.page = page.value;
  } catch (e: any) {
    message.error("加载失败: " + (e.message || "未知错误"));
  } finally {
    loading.value = false;
  }
}

async function archiveSingle(row: any) {
  try {
    await apiPost("/listings/archive/ozon", [row.id]);
    message.success("已归档");
    loadListings();
  } catch (e: any) {
    message.error("归档失败: " + e.message);
  }
}

function openStockModal(row: any) {
  stockTarget.value = row;
  stockValue.value = null;
  stockModalVisible.value = true;
}

async function submitStock() {
  if (!stockTarget.value || stockValue.value === null) return;
  stockModalLoading.value = true;
  try {
    await apiPost(`/listings/stock?listing_id=${stockTarget.value.id}&stock=${stockValue.value}`);
    message.success("库存已更新");
    stockModalVisible.value = false;
    loadListings();
  } catch (e: any) {
    message.error("更新失败: " + e.message);
  } finally {
    stockModalLoading.value = false;
  }
}

async function importSingle(row: any) {
  try {
    const res = await apiPost<{ imported: number }>("/listings/import", [row.id]);
    message.success(`迁移完成，共 ${res.imported} 条`);
  } catch (e: any) {
    message.error("迁移失败: " + e.message);
  }
}

async function batchArchiveOzon() {
  if (selectedIds.value.length === 0) return;
  try {
    const res = await apiPost<{ archived_on_ozon: number }>("/listings/archive/ozon", selectedIds.value);
    message.success(`已归档 ${res.archived_on_ozon} 件商品`);
    selectedIds.value = [];
    loadListings();
  } catch (e: any) {
    message.error("批量归档失败: " + e.message);
  }
}

async function batchImport() {
  if (selectedIds.value.length === 0) return;
  try {
    const res = await apiPost<{ imported: number }>("/listings/import", selectedIds.value);
    message.success(`迁移完成，共 ${res.imported} 条`);
    selectedIds.value = [];
  } catch (e: any) {
    message.error("批量迁移失败: " + e.message);
  }
}

watch([filterStoreId, filterArchived], () => {
  page.value = 1;
  loadListings();
});

onMounted(async () => {
  await appStore.fetchStores({ limit: 999 });
  await loadListings();
});
</script>
