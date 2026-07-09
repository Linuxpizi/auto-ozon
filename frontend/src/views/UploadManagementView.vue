<template>
  <div class="upload-mgmt">
    <!-- ── 顶栏 ── -->
    <div class="page-header">
      <h2 style="margin:0">📦 上架管理</h2>
      <n-space>
        <n-button @click="loadDrafts" :loading="loading">🔄 刷新</n-button>
      </n-space>
    </div>

    <!-- ── 筛选栏 ── -->
    <n-card size="small" :bordered="false" style="margin-bottom:12px">
      <n-space :size="12" align="center">
        <n-select
          v-model:value="filterStatus"
          :options="statusOptions"
          placeholder="状态"
          clearable
          style="width:140px"
          @update:value="onFilterChange"
        />
        <n-select
          v-model:value="filterStoreId"
          :options="storeOptions"
          placeholder="店铺"
          clearable
          style="width:180px"
          @update:value="onFilterChange"
        />
        <n-input
          v-model:value="filterKeyword"
          placeholder="搜索商品名 / offer_id"
          clearable
          style="width:220px"
          @clear="onFilterChange"
          @keyup.enter="onFilterChange"
        />
        <n-button v-if="selectedKeys.length" type="error" @click="batchDelete">
          🗑️ 批量删除 ({{ selectedKeys.length }})
        </n-button>
        <n-button v-if="selectedKeys.length" type="warning" :loading="batchSubmitting" @click="batchSubmit">
          🚀 批量提交 ({{ selectedKeys.length }})
        </n-button>
      </n-space>
    </n-card>

    <!-- ── 草稿列表 ── -->
    <n-data-table
      :columns="columns"
      :data="drafts"
      :loading="loading"
      :row-key="(r: any) => r.id"
      v-model:checked-row-keys="selectedKeys"
      :pagination="pagination"
      :scroll-x="1200"
      @update:page="onPageChange"
      @update:page-size="onPageSizeChange"
    />

    <!-- ── 编辑草稿抽屉 ── -->
    <n-drawer v-model:show="editVisible" :width="700" placement="right">
      <n-drawer-content title="编辑草稿" closable>
        <template v-if="editingDraft">
          <n-form label-placement="left" label-width="100">
            <n-form-item label="店铺">
              <n-tag size="small">{{ editingDraft.store_id }}</n-tag>
            </n-form-item>
            <n-form-item label="分类">
              <n-tag size="small">{{ formatCategoryPath(editingDraft) }}</n-tag>
            </n-form-item>
            <n-form-item label="商品名">
              <n-input v-model:value="editingDraft.name" />
            </n-form-item>
            <n-form-item label="描述">
              <n-input v-model:value="editingDraft.description" type="textarea" :rows="4" />
            </n-form-item>
            <n-form-item label="售价 (₽)">
              <n-input-number v-model:value="editingDraft.price_rub" :min="0" style="width:100%" />
            </n-form-item>
            <n-form-item label="重量 (g)">
              <n-input-number v-model:value="editingDraft.weight" :min="0" style="width:100%" />
            </n-form-item>
            <n-form-item label="尺寸 (高×深×宽 mm)">
              <n-space>
                <n-input-number v-model:value="editingDraft.height" :min="0" placeholder="高" />
                <n-input-number v-model:value="editingDraft.depth" :min="0" placeholder="深" />
                <n-input-number v-model:value="editingDraft.width" :min="0" placeholder="宽" />
              </n-space>
            </n-form-item>
            <n-form-item label="offer_id">
              <n-input v-model:value="editingDraft.offer_id" placeholder="留空自动按 name 生成" />
            </n-form-item>
          </n-form>
        </template>
        <template #footer>
          <n-space>
            <n-button @click="editVisible = false">取消</n-button>
            <n-button type="primary" :loading="editSaving" @click="saveDraft">保存</n-button>
          </n-space>
        </template>
      </n-drawer-content>
    </n-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, h, onMounted, watch } from "vue";
import {
  NButton, NTag, NSpace, NInput, NInputNumber, NSelect, NDataTable,
  NPopconfirm, NPagination, NCard, NDrawer, NDrawerContent, NForm,
  NFormItem, useMessage,
} from "naive-ui";
import type { DataTableColumns } from "naive-ui";
import { apiGet, apiPost, apiPut, apiDelete } from "../api";
import { useRoute, useRouter } from "vue-router";

const message = useMessage();
const route = useRoute();
const router = useRouter();

// ── 状态选项 ──
const statusOptions = [
  { label: "全部", value: "" },
  { label: "📝 草稿", value: "draft" },
  { label: "⏳ 提交中", value: "submitted" },
  { label: "✅ 已上架", value: "active" },
  { label: "❌ 失败", value: "error" },
];

// ── 数据 ──
const loading = ref(false);
const drafts = ref<any[]>([]);
const totalCount = ref(0);
const currentPage = ref(1);
const pageSize = ref(20);
const selectedKeys = ref<number[]>([]);

// ── 筛选 ──
const filterStatus = ref<string>("");
const filterStoreId = ref<number | null>(null);
const filterKeyword = ref("");
const storeOptions = ref<{ label: string; value: number }[]>([]);

// ── 编辑 ──
const editVisible = ref(false);
const editingDraft = ref<any>(null);
const editSaving = ref(false);

// ── 批量 ──
const batchSubmitting = ref(false);

const pagination = computed(() => ({
  page: currentPage.value,
  pageSize: pageSize.value,
  itemCount: totalCount.value,
  pageSizes: [20, 50, 100],
  showSizePicker: true,
}));

// ── 表格列 ──
const columns: DataTableColumns<any> = [
  { type: "selection" },
  {
    title: "ID",
    key: "id",
    width: 70,
    sorter: (a: any, b: any) => a.id - b.id,
  },
  {
    title: "商品名",
    key: "name",
    minWidth: 200,
    ellipsis: { tooltip: true },
    render(row: any) {
      return h("div", [
        h("div", { style: "font-weight:500" }, row.name?.slice(0, 50) || "(无名)"),
        row.offer_id ? h("div", { style: "font-size:11px;color:#999" }, `offer: ${row.offer_id}`) : null,
      ]);
    },
  },
  {
    title: "店铺",
    key: "store_id",
    width: 80,
    render(row: any) {
      return h(NTag, { size: "small", bordered: false, type: "info" }, () => `#${row.store_id}`);
    },
  },
  {
    title: "分类",
    key: "category_name",
    minWidth: 220,
    ellipsis: { tooltip: true },
    render(row: any) {
      return formatCategoryPath(row);
    },
  },
  {
    title: "价格 ₽",
    key: "price_rub",
    width: 90,
    sorter: (a: any, b: any) => a.price_rub - b.price_rub,
    render(row: any) {
      return `₽${row.price_rub?.toLocaleString() || 0}`;
    },
  },
  {
    title: "来源",
    key: "source_type",
    width: 80,
    render(row: any) {
      const map: Record<string, { label: string; type: string }> = {
        scraped: { label: "采集", type: "default" },
        manual: { label: "手动", type: "warning" },
        import: { label: "导入", type: "success" },
      };
      const s = map[row.source_type] || { label: row.source_type, type: "default" };
      return h(NTag, { size: "small", bordered: false, type: s.type as any }, () => s.label);
    },
  },
  {
    title: "状态",
    key: "status",
    width: 90,
    render(row: any) {
      const map: Record<string, { label: string; color: string }> = {
        draft: { label: "📝 草稿", color: "#f0a020" },
        submitted: { label: "⏳ 提交中", color: "#2080f0" },
        active: { label: "✅ 已上架", color: "#18a058" },
        error: { label: "❌ 失败", color: "#d03050" },
      };
      const s = map[row.status] || { label: row.status, color: "#999" };
      return h(NTag, { size: "small", bordered: false, style: `color:${s.color};border-color:${s.color}30;background:${s.color}15` }, () => s.label);
    },
  },
  {
    title: "任务ID",
    key: "ozon_task_id",
    width: 80,
    render(row: any) {
      return row.ozon_task_id || "-";
    },
  },
  {
    title: "创建时间",
    key: "created_at",
    width: 150,
    sorter: (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    render(row: any) {
      return row.created_at ? new Date(row.created_at).toLocaleString("zh-CN") : "-";
    },
  },
  {
    title: "操作",
    key: "actions",
    width: 200,
    fixed: "right",
    render(row: any) {
      return h(NSpace, { size: 4 }, () => [
        h(NButton, {
          size: "small", tertiary: true, type: "info",
          onClick: () => openEdit(row),
        }, () => "✏️"),
        row.status === "draft"
          ? h(NButton, {
              size: "small", tertiary: true, type: "success",
              onClick: () => submitSingle(row),
            }, () => "🚀")
          : null,
        row.status === "submitted" && row.ozon_task_id
          ? h(NButton, {
              size: "small", tertiary: true, type: "warning",
              onClick: () => checkStatus(row),
            }, () => "🔍")
          : null,
        h(NPopconfirm, {
          onPositiveClick: () => deleteSingle(row.id),
        }, {
          trigger: () => h(NButton, { size: "small", tertiary: true, type: "error" }, () => "🗑️"),
          default: () => "确认删除该草稿？",
        }),
      ]);
    },
  },
];

function formatCategoryPath(row: any): string {
  const raw = row?.category_name ? String(row.category_name) : "";
  const normalized = raw
    .split(/\s*(?:->|>|＞|\/|»|›)\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" > ");

  if (normalized) return normalized;
  return String(row?.description_category_id || "-");
}

// ── 加载店铺列表 ──
async function loadStores() {
  try {
    const resp = await apiGet<any>("/stores/", { page: 1, page_size: 100 });
    const items = resp?.items || resp || [];
    storeOptions.value = items.map((s: any) => ({
      label: s.store_name || s.name || `店铺#${s.id}`,
      value: s.id,
    }));
  } catch { /* ignore */ }
}

// ── 加载草稿 ──
async function loadDrafts() {
  loading.value = true;
  try {
    const params: Record<string, any> = {
      skip: (currentPage.value - 1) * pageSize.value,
      limit: pageSize.value,
    };
    if (filterStatus.value) params.status = filterStatus.value;
    if (filterStoreId.value) params.store_id = filterStoreId.value;
    if (filterKeyword.value) params.keyword = filterKeyword.value;

    const resp = await apiGet<any>("/upload/drafts", params);
    drafts.value = resp?.items || [];
    totalCount.value = resp?.total || 0;
  } catch (e: any) {
    message.error("加载失败: " + e.message);
  } finally {
    loading.value = false;
  }
}

function onFilterChange() {
  currentPage.value = 1;
  loadDrafts();
}

function onPageChange(page: number) {
  currentPage.value = page;
  loadDrafts();
}

function onPageSizeChange(size: number) {
  pageSize.value = size;
  currentPage.value = 1;
  loadDrafts();
}

// ── 编辑 ──
function openEdit(draft: any) {
  editingDraft.value = JSON.parse(JSON.stringify(draft));
  editVisible.value = true;
}

async function saveDraft() {
  if (!editingDraft.value) return;
  editSaving.value = true;
  try {
    await apiPut(`/upload/drafts/${editingDraft.value.id}`, {
      name: editingDraft.value.name,
      description: editingDraft.value.description,
      price_rub: editingDraft.value.price_rub,
      weight: editingDraft.value.weight,
      height: editingDraft.value.height,
      depth: editingDraft.value.depth,
      width: editingDraft.value.width,
      offer_id: editingDraft.value.offer_id,
    });
    message.success("保存成功");
    editVisible.value = false;
    loadDrafts();
  } catch (e: any) {
    message.error("保存失败: " + e.message);
  } finally {
    editSaving.value = false;
  }
}

// ── 提交 ──
async function submitSingle(draft: any) {
  try {
    const resp = await apiPost<any>(`/upload/drafts/${draft.id}/submit`);
    if (resp.success) {
      message.success(`提交成功 task_id=${resp.task_id}`);
    } else {
      message.error("提交失败: " + (resp.error || "未知错误"));
    }
    loadDrafts();
  } catch (e: any) {
    message.error("提交失败: " + e.message);
  }
}

async function batchSubmit() {
  if (!selectedKeys.value.length) return;
  batchSubmitting.value = true;
  try {
    const resp = await apiPost<any>("/upload/batch-submit", {
      draft_ids: selectedKeys.value,
    });
    message.success(`批量提交完成: 成功 ${resp.submitted}/${resp.total}`);
    selectedKeys.value = [];
    loadDrafts();
  } catch (e: any) {
    message.error("批量提交失败: " + e.message);
  } finally {
    batchSubmitting.value = false;
  }
}

// ── 查状态 ──
async function checkStatus(draft: any) {
  try {
    const resp = await apiGet<any>(`/upload/drafts/${draft.id}/status`);
    if (resp.status === "active") {
      message.success("✅ 已上架");
    } else if (resp.status === "error") {
      message.error("❌ 上架失败: " + (resp.error_message || ""));
    } else {
      message.info(`状态: ${resp.status}`);
    }
    loadDrafts();
  } catch (e: any) {
    message.error("查状态失败: " + e.message);
  }
}

// ── 删除 ──
async function deleteSingle(id: number) {
  try {
    await apiDelete(`/upload/drafts/${id}`);
    message.success("已删除");
    loadDrafts();
  } catch (e: any) {
    message.error("删除失败: " + e.message);
  }
}

async function batchDelete() {
  if (!selectedKeys.value.length) return;
  try {
    await apiPost("/upload/drafts/batch-delete", { draft_ids: selectedKeys.value });
    message.success(`已删除 ${selectedKeys.value.length} 条`);
    selectedKeys.value = [];
    loadDrafts();
  } catch (e: any) {
    message.error("批量删除失败: " + e.message);
  }
}

// ── 初始化 ──
onMounted(() => {
  loadStores();
  loadDrafts();

  // 支持从选品中心跳转过来带上 store_id 参数
  if (route.query.store_id) {
    filterStoreId.value = Number(route.query.store_id);
    onFilterChange();
  }
});
</script>

<style scoped>
.upload-mgmt {
  padding: 16px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
</style>
