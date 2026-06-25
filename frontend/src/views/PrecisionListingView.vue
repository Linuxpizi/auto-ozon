<template>
  <div class="container">
    <div class="card">
      <!-- Header -->
      <div class="page-header">
        <n-h2 class="page-title" style="margin: 0;">精铺管理</n-h2>
        <n-space>
          <n-button type="primary" size="small" @click="showCreateDialog">+ 新建精铺任务</n-button>
          <n-button size="small" @click="loadTasks" :loading="loading">刷新</n-button>
        </n-space>
      </div>

      <!-- Filters -->
      <n-space style="margin-bottom: 12px;" align="center">
        <n-select
          v-model:value="filterStoreId"
          :options="[{ label: '全部店铺', value: '' }, ...appStore.stores.map(s => ({ label: s.name, value: s.id }))]"
          placeholder="全部店铺"
          clearable
          style="width: 160px;"
          size="small"
        />
        <n-select
          v-model:value="filterStatus"
          :options="statusOptions"
          placeholder="全部状态"
          clearable
          style="width: 130px;"
          size="small"
        />
        <n-select
          v-model:value="filterMode"
          :options="[{ label: '全部模式', value: '' }, { label: 'SKU复制', value: 'copy_ozon' }, { label: '外部爬取', value: 'scrape' }, { label: '手动填写', value: 'external' }]"
          placeholder="全部模式"
          clearable
          style="width: 130px;"
          size="small"
        />
        <n-input
          v-model:value="keyword"
          placeholder="搜索 SKU / 名称 / Offer ID"
          clearable
          style="width: 220px;"
          size="small"
          @keyup.enter="loadTasks"
        />
        <n-button size="small" @click="loadTasks">搜索</n-button>
      </n-space>

      <!-- Stats -->
      <n-space style="margin-bottom: 12px;" :size="16">
        <n-statistic label="总任务" :value="total" />
        <n-statistic label="草稿" :value="statusCounts.draft || 0" />
        <n-statistic label="已提交" :value="statusCounts.submitted || 0" />
        <n-statistic label="已上架" :value="statusCounts.active || 0" />
      </n-space>

      <!-- Table -->
      <n-data-table
        :columns="columns"
        :data="tasks"
        :loading="loading"
        :pagination="pagination"
        :row-key="r => r.id"
        size="small"
        striped
        :scroll-x="1200"
      />
    </div>

    <!-- Create / Edit Dialog -->
    <n-modal
      v-model:show="dialogVisible"
      :title="editingTask ? '编辑精铺任务' : '新建精铺任务'"
      style="width: 900px; max-width: 95vw;"
      :mask-closable="false"
      preset="card"
    >
      <!-- Step indicator -->
      <n-steps :current="currentStep" size="small" style="margin-bottom: 20px;">
        <n-step title="获取商品" description="输入SKU获取源商品" />
        <n-step title="编辑内容" description="翻译标题、描述、属性" />
        <n-step title="定价配置" description="设置价格和店铺" />
        <n-step title="确认提交" description="预览并提交" />
      </n-steps>

      <!-- Step 1: Fetch Source -->
      <div v-if="currentStep === 1">
        <n-space vertical :size="16">
          <n-card size="small" title="选择精铺模式">
            <n-radio-group v-model:value="form.mode" size="small">
              <n-space>
                <n-radio value="copy_ozon">SKU 复制</n-radio>
                <n-radio value="scrape">外部平台爬取</n-radio>
                <n-radio value="external">手动填写</n-radio>
              </n-space>
            </n-radio-group>
          </n-card>

          <!-- Mode: copy_ozon -->
          <n-card v-if="form.mode === 'copy_ozon'" size="small" title="输入源商品 SKU">
            <n-space align="center">
              <n-input
                v-model:value="form.source_sku"
                placeholder="输入 Ozon 商品 SKU"
                style="width: 240px;"
                size="small"
                :disabled="fetchingSource"
              />
              <n-select
                v-model:value="form.store_id"
                :options="appStore.stores.map(s => ({ label: s.name, value: s.id }))"
                placeholder="选择查询店铺"
                style="width: 200px;"
                size="small"
              />
              <n-button
                type="primary"
                size="small"
                :loading="fetchingSource"
                :disabled="!form.source_sku || !form.store_id"
                @click="fetchSourceProduct"
              >
                获取商品
              </n-button>
            </n-space>
          </n-card>

          <!-- Mode: scrape from external platform -->
          <n-card v-if="form.mode === 'scrape'" size="small" title="输入商品链接">
            <n-space vertical :size="12">
              <n-alert type="info" :bordered="false" style="font-size: 12px;">
                支持平台：Ozon (ozon.ru)、1688 (1688.com)、AliExpress (aliexpress.com)
              </n-alert>
              <n-space align="center">
                <n-input
                  v-model:value="scrapeUrl"
                  placeholder="粘贴商品链接，例如 https://www.ozon.ru/product/..."
                  style="width: 480px;"
                  size="small"
                  :disabled="scraping"
                  @keyup.enter="scrapeProduct"
                />
                <n-button
                  type="primary"
                  size="small"
                  :loading="scraping"
                  :disabled="!scrapeUrl"
                  @click="scrapeProduct"
                >
                  爬取
                </n-button>
              </n-space>
              <n-alert v-if="scrapeError" type="warning" :bordered="false" style="font-size: 12px;">
                {{ scrapeError }}
              </n-alert>
            </n-space>
          </n-card>

          <!-- Mode: external (manual) -->
          <n-card v-if="form.mode === 'external'" size="small" title="手动填写商品信息">
            <n-space vertical :size="12">
              <n-input
                v-model:value="form.source_name"
                placeholder="商品名称（中文）"
                size="small"
              />
              <n-input
                v-model:value="form.source_description"
                type="textarea"
                placeholder="商品描述（HTML）"
                :rows="4"
                size="small"
              />
              <n-input
                v-model:value="form.source_images"
                type="textarea"
                placeholder="图片 URL，每行一个"
                :rows="3"
                size="small"
              />
            </n-space>
          </n-card>
        </n-space>
      </div>

      <!-- Step 2: Edit Content -->
      <div v-if="currentStep === 2">
        <n-space vertical :size="16">
          <!-- Source images preview -->
          <n-card size="small" title="商品图片">
            <n-space :size="8" wrap>
              <div
                v-for="(img, idx) in sourceImageList"
                :key="idx"
                class="img-preview"
              >
                <img :src="img" :alt="`图片 ${idx + 1}`" @error="onImgError" />
                <div class="img-idx">{{ idx + 1 }}</div>
              </div>
              <div v-if="sourceImageList.length === 0" style="color: var(--text-secondary); font-size: 13px;">
                暂无图片
              </div>
            </n-space>
          </n-card>

          <!-- Title translation -->
          <n-card size="small" title="标题翻译">
            <n-space vertical :size="8">
              <div style="font-size: 12px; color: var(--text-secondary);">
                原文：{{ form.source_name }}
              </div>
              <n-input
                v-model:value="form.translated_name"
                placeholder="翻译后的俄文标题"
                size="small"
              />
              <div style="font-size: 11px; color: var(--text-secondary);">
                {{ form.translated_name.length }} / 150 字符
              </div>
            </n-space>
          </n-card>

          <!-- Description translation -->
          <n-card size="small" title="描述翻译">
            <n-space vertical :size="8">
              <div style="font-size: 12px; color: var(--text-secondary); max-height: 120px; overflow-y: auto;">
                原文：{{ form.source_description?.substring(0, 500) }}...
              </div>
              <n-input
                v-model:value="form.translated_description"
                type="textarea"
                placeholder="翻译后的俄文描述（支持 HTML）"
                :rows="6"
                size="small"
              />
            </n-space>
          </n-card>

          <!-- Attributes table -->
          <n-card size="small" title="属性翻译">
            <n-data-table
              :columns="attrColumns"
              :data="parsedAttributes"
              :pagination="false"
              size="small"
              :max-height="300"
              :scroll-x="600"
            />
          </n-card>
        </n-space>
      </div>

      <!-- Step 3: Pricing -->
      <div v-if="currentStep === 3">
        <n-card size="small" title="定价配置">
          <n-form label-placement="left" label-width="100" size="small">
            <n-form-item label="目标店铺">
              <n-select
                v-model:value="form.store_id"
                :options="appStore.stores.map(s => ({ label: s.name, value: s.id }))"
                placeholder="选择目标店铺"
                style="width: 260px;"
              />
            </n-form-item>
            <n-form-item label="售价 (₽)">
              <n-input-number
                v-model:value="form.priceNum"
                :min="0"
                :precision="2"
                placeholder="0.00"
                style="width: 200px;"
              />
            </n-form-item>
            <n-form-item label="划线价 (₽)">
              <n-input-number
                v-model:value="form.oldPriceNum"
                :min="0"
                :precision="2"
                placeholder="0.00"
                style="width: 200px;"
              />
            </n-form-item>
            <n-form-item label="VAT 税率">
              <n-select
                v-model:value="form.vat"
                :options="[
                  { label: '0% (跨境默认)', value: '0' },
                  { label: '10%', value: '0.1' },
                  { label: '20%', value: '0.2' },
                ]"
                style="width: 200px;"
              />
            </n-form-item>
            <n-form-item label="重量 (g)">
              <n-input-number v-model:value="form.weight" :min="0" style="width: 200px;" />
            </n-form-item>
            <n-form-item label="尺寸 (mm)">
              <n-space :size="8">
                <n-input-number v-model:value="form.width" :min="0" placeholder="宽" style="width: 100px;" />
                <n-input-number v-model:value="form.height" :min="0" placeholder="高" style="width: 100px;" />
                <n-input-number v-model:value="form.depth" :min="0" placeholder="深" style="width: 100px;" />
              </n-space>
            </n-form-item>
          </n-form>
        </n-card>
      </div>

      <!-- Step 4: Confirm -->
      <div v-if="currentStep === 4">
        <n-space vertical :size="16">
          <n-card size="small" title="提交确认">
            <n-descriptions :column="2" size="small" bordered>
              <n-descriptions-item label="精铺模式">{{ modeLabel(form.mode) }}</n-descriptions-item>
              <n-descriptions-item label="源SKU">{{ form.source_sku || '-' }}</n-descriptions-item>
              <n-descriptions-item label="目标店铺">{{ storeName }}</n-descriptions-item>
              <n-descriptions-item label="状态">{{ statusLabel(form.status) }}</n-descriptions-item>
              <n-descriptions-item label="翻译标题" :span="2">{{ form.translated_name || '(未翻译)' }}</n-descriptions-item>
              <n-descriptions-item label="售价">{{ form.priceNum ? `₽${form.priceNum.toFixed(2)}` : '-' }}</n-descriptions-item>
              <n-descriptions-item label="划线价">{{ form.oldPriceNum ? `₽${form.oldPriceNum.toFixed(2)}` : '-' }}</n-descriptions-item>
            </n-descriptions>
          </n-card>

          <n-alert v-if="submitResult" :type="submitResult.ok ? 'success' : 'error'" style="margin-top: 8px;">
            {{ submitResult.message }}
          </n-alert>
        </n-space>
      </div>

      <!-- Dialog actions -->
      <template #action>
        <n-space justify="end">
          <n-button size="small" @click="dialogVisible = false">取消</n-button>
          <n-button v-if="currentStep > 1" size="small" @click="currentStep--">上一步</n-button>
          <n-button
            v-if="currentStep < 4"
            type="primary"
            size="small"
            :disabled="!canGoNext"
            @click="currentStep++"
          >
            下一步
          </n-button>
          <n-button
            v-if="currentStep === 4"
            type="primary"
            size="small"
            :loading="saving"
            @click="saveTask"
          >
            {{ editingTask ? '保存修改' : '创建任务' }}
          </n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, h } from "vue";
import {
  NButton, NTag, NSpace, NInput, NSelect, NDataTable, NH2, NCard, NModal,
  NSteps, NStep, NForm, NFormItem, NInputNumber, NDescriptions, NDescriptionsItem,
  NAlert, NStatistic, NRadioGroup, NRadio, useMessage,
} from "naive-ui";
import type { DataTableColumns } from "naive-ui";
import { useAppStore } from "../store";
import { apiGet, apiPost, apiPut, apiDelete } from "../api";

const appStore = useAppStore();
const message = useMessage();

// --- State ---
const loading = ref(false);
const tasks = ref<any[]>([]);
const total = ref(0);
const keyword = ref("");
const filterStoreId = ref<any>("");
const filterStatus = ref<any>("");
const filterMode = ref<any>("");
const dialogVisible = ref(false);
const currentStep = ref(1);
const saving = ref(false);
const fetchingSource = ref(false);
const editingTask = ref<any>(null);
const submitResult = ref<{ ok: boolean; message: string } | null>(null);
const scrapeUrl = ref("");
const scraping = ref(false);
const scrapeError = ref("");

const form = reactive({
  mode: "copy_ozon",
  source_sku: "",
  store_id: null as number | null,
  source_name: "",
  source_description: "",
  source_images: "[]",
  source_attributes: "[]",
  category_id: 0,
  type_id: 0,
  category_name: "",
  translated_name: "",
  translated_description: "",
  translated_attributes: "[]",
  priceNum: null as number | null,
  oldPriceNum: null as number | null,
  vat: "0",
  weight: 0,
  depth: 0,
  height: 0,
  width: 0,
  status: "draft",
});

const statusOptions = [
  { label: "草稿", value: "draft" },
  { label: "翻译中", value: "translating" },
  { label: "就绪", value: "ready" },
  { label: "已提交", value: "submitted" },
  { label: "已上架", value: "active" },
  { label: "已拒绝", value: "rejected" },
  { label: "错误", value: "error" },
];

// --- Computed ---
const pagination = computed(() => ({
  page: 1,
  pageSize: 20,
  pageCount: Math.ceil(total.value / 20) || 1,
  showSizePicker: false,
  onChange: (page: number) => loadTasks((page - 1) * 20),
}));

const storeName = computed(() => {
  const store = appStore.stores.find((s: any) => s.id === form.store_id);
  return store?.name || "-";
});

const sourceImageList = computed(() => {
  try {
    return JSON.parse(form.source_images || "[]");
  } catch {
    return [];
  }
});

const parsedAttributes = computed(() => {
  try {
    return JSON.parse(form.source_attributes || "[]");
  } catch {
    return [];
  }
});

const canGoNext = computed(() => {
  if (currentStep.value === 1) {
    if (form.mode === "copy_ozon") {
      return form.source_sku && form.store_id;
    }
    return form.source_name;
  }
  if (currentStep.value === 2) {
    return form.translated_name;
  }
  if (currentStep.value === 3) {
    return form.store_id && form.priceNum;
  }
  return true;
});

const statusCounts = computed(() => {
  const counts: Record<string, number> = {};
  tasks.value.forEach((t) => {
    counts[t.status] = (counts[t.status] || 0) + 1;
  });
  return counts;
});

// --- Methods ---
function statusLabel(s: string) {
  const map: Record<string, string> = {
    draft: "草稿", translating: "翻译中", ready: "就绪",
    submitted: "已提交", active: "已上架", rejected: "已拒绝", error: "错误",
  };
  return map[s] || s;
}

function statusType(s: string) {
  const map: Record<string, string> = {
    draft: "default", translating: "info", ready: "warning",
    submitted: "info", active: "success", rejected: "error", error: "error",
  };
  return (map[s] || "default") as any;
}

function modeLabel(m: string) {
  const map: Record<string, string> = {
    copy_ozon: "SKU复制",
    scrape: "外部爬取",
    external: "手动填写",
  };
  return map[m] || m;
}

function resetForm() {
  form.mode = "copy_ozon";
  scrapeUrl.value = "";
  scrapeError.value = "";
  form.source_sku = "";
  form.store_id = null;
  form.source_name = "";
  form.source_description = "";
  form.source_images = "[]";
  form.source_attributes = "[]";
  form.category_id = 0;
  form.type_id = 0;
  form.category_name = "";
  form.translated_name = "";
  form.translated_description = "";
  form.translated_attributes = "[]";
  form.priceNum = null;
  form.oldPriceNum = null;
  form.vat = "0";
  form.weight = 0;
  form.depth = 0;
  form.height = 0;
  form.width = 0;
  form.status = "draft";
  currentStep.value = 1;
  submitResult.value = null;
}

function showCreateDialog() {
  editingTask.value = null;
  resetForm();
  dialogVisible.value = true;
}

function showEditDialog(task: any) {
  editingTask.value = task;
  form.mode = task.mode;
  form.source_sku = task.source_sku;
  form.store_id = task.store_id;
  form.source_name = task.source_name;
  form.source_description = task.source_description;
  form.source_images = task.source_images || "[]";
  form.source_attributes = task.source_attributes || "[]";
  form.category_id = task.category_id;
  form.type_id = task.type_id;
  form.category_name = task.category_name;
  form.translated_name = task.translated_name;
  form.translated_description = task.translated_description;
  form.translated_attributes = task.translated_attributes || "[]";
  form.priceNum = task.price ? parseFloat(task.price) : null;
  form.oldPriceNum = task.old_price ? parseFloat(task.old_price) : null;
  form.vat = task.vat || "0";
  form.weight = task.weight || 0;
  form.depth = task.depth || 0;
  form.height = task.height || 0;
  form.width = task.width || 0;
  form.status = task.status;
  currentStep.value = 1;
  submitResult.value = null;
  dialogVisible.value = true;
}

async function scrapeProduct() {
  if (!scrapeUrl.value) return;
  scraping.value = true;
  scrapeError.value = "";
  try {
    const data = await apiPost("/precision-listing/scrape", {
      url: scrapeUrl.value,
    });
    // Populate form from scraped data
    form.source_name = data.title || "";
    form.source_description = data.description || "";
    form.source_images = JSON.stringify(data.images || []);
    form.source_attributes = JSON.stringify(
      (data.attributes || []).map((a: any, idx: number) => ({
        id: idx + 1,
        complex_id: 0,
        name: a.name || "",
        value: a.value || "",
        dictionary_value_id: 0,
      }))
    );
    form.translated_name = data.title || "";
    form.translated_description = data.description || "";
    form.source_sku = data.source_id || "";
    if (data.weight) form.weight = parseInt(data.weight) || 0;
    message.success(`商品已从 ${data.platform} 爬取成功`);
    currentStep.value = 2;
  } catch (e: any) {
    scrapeError.value = e.message || "爬取失败";
    message.error(e.message || "爬取失败");
  } finally {
    scraping.value = false;
  }
}

async function fetchSourceProduct() {
  if (!form.source_sku || !form.store_id) return;
  fetchingSource.value = true;
  try {
    const data = await apiPost("/precision-listing/import-by-sku", {
      store_id: form.store_id,
      source_sku: form.source_sku,
      source_name: form.source_name || `SKU-${form.source_sku}`,
      offer_id: form.source_sku,
      price: "0",
    });
    form.source_name = data.source_name || "";
    form.source_description = data.source_description || "";
    form.source_images = JSON.stringify(data.source_images || []);
    form.source_attributes = JSON.stringify(data.source_attributes || []);
    form.translated_name = data.source_name || "";
    form.translated_description = data.source_description || "";
    if (data.weight) form.weight = data.weight;
    if (data.depth) form.depth = data.depth;
    if (data.height) form.height = data.height;
    if (data.width) form.width = data.width;
    message.success("商品信息获取成功");
    currentStep.value = 2;
  } catch (e: any) {
    message.error(e.message || "获取失败");
  } finally {
    fetchingSource.value = false;
  }
}

async function saveTask() {
  saving.value = true;
  try {
    const store = appStore.stores.find((s: any) => s.id === form.store_id);
    const payload: any = {
      store_id: form.store_id,
      store_name: store?.name || "",
      mode: form.mode,
      source_sku: form.source_sku,
      source_name: form.source_name,
      source_description: form.source_description,
      source_images: form.source_images,
      source_attributes: form.source_attributes,
      category_id: form.category_id,
      type_id: form.type_id,
      category_name: form.category_name,
      translated_name: form.translated_name,
      translated_description: form.translated_description,
      translated_attributes: form.translated_attributes,
      price: form.priceNum ? String(form.priceNum) : "",
      old_price: form.oldPriceNum ? String(form.oldPriceNum) : "",
      vat: form.vat,
      weight: form.weight,
      depth: form.depth,
      height: form.height,
      width: form.width,
      status: "draft",
    };

    if (editingTask.value) {
      await apiPut(`/precision-listing/${editingTask.value.id}`, payload);
      submitResult.value = { ok: true, message: "任务更新成功" };
      message.success("任务已更新");
    } else {
      const result = await apiPost("/precision-listing/", payload);
      submitResult.value = { ok: true, message: `任务创建成功 (ID: ${result.id})` };
      message.success("任务已创建");
    }
    await loadTasks();
  } catch (e: any) {
    submitResult.value = { ok: false, message: e.message || "保存失败" };
    message.error(e.message || "保存失败");
  } finally {
    saving.value = false;
  }
}

async function deleteTask(id: number) {
  if (!confirm("确认删除该精铺任务？")) return;
  try {
    await apiDelete(`/precision-listing/${id}`);
    message.success("已删除");
    await loadTasks();
  } catch (e: any) {
    message.error(e.message || "删除失败");
  }
}

async function loadTasks(skip = 0) {
  loading.value = true;
  try {
    const params: Record<string, any> = { skip, limit: 20 };
    if (filterStoreId.value) params.store_id = filterStoreId.value;
    if (filterStatus.value) params.status = filterStatus.value;
    if (filterMode.value) params.mode = filterMode.value;
    if (keyword.value) params.keyword = keyword.value;

    const [list, countResp] = await Promise.all([
      apiGet("/precision-listing/", params),
      apiGet("/precision-listing/count", params),
    ]);
    tasks.value = list;
    total.value = countResp.total || 0;
  } catch (e: any) {
    message.error("加载失败: " + (e.message || ""));
  } finally {
    loading.value = false;
  }
}

function onImgError(e: Event) {
  (e.target as HTMLImageElement).style.display = "none";
}

// --- Table Columns ---
const columns: DataTableColumns<any> = [
  {
    title: "ID",
    key: "id",
    width: 50,
  },
  {
    title: "模式",
    key: "mode",
    width: 80,
    render: (row) => h(NTag, { size: "small", bordered: false, type: row.mode === "scrape" ? "warning" : row.mode === "external" ? "default" : "info" },
      { default: () => modeLabel(row.mode) }),
  },
  {
    title: "源SKU",
    key: "source_sku",
    width: 100,
    render: (row) => row.source_sku || "-",
  },
  {
    title: "商品名称",
    key: "translated_name",
    minWidth: 200,
    ellipsis: { tooltip: true },
    render: (row) => row.translated_name || row.source_name || "-",
  },
  {
    title: "目标店铺",
    key: "store_name",
    width: 120,
  },
  {
    title: "价格",
    key: "price",
    width: 100,
    render: (row) => row.price ? `₽${row.price}` : "-",
  },
  {
    title: "状态",
    key: "status",
    width: 80,
    render: (row) => h(NTag, { size: "small", round: true, type: statusType(row.status) },
      { default: () => statusLabel(row.status) }),
  },
  {
    title: "Offer ID",
    key: "offer_id",
    width: 100,
    render: (row) => row.offer_id || "-",
  },
  {
    title: "创建时间",
    key: "created_at",
    width: 100,
    render: (row) => {
      if (!row.created_at) return "-";
      return new Date(row.created_at).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
    },
  },
  {
    title: "操作",
    key: "actions",
    width: 120,
    fixed: "right",
    render: (row) =>
      h(NSpace, { size: 4 }, {
        default: () => [
          h(NButton, { size: "tiny", onClick: () => showEditDialog(row) }, { default: () => "编辑" }),
          h(NButton, { size: "tiny", type: "error", onClick: () => deleteTask(row.id) }, { default: () => "删除" }),
        ],
      }),
  },
];

const attrColumns: DataTableColumns<any> = [
  { title: "ID", key: "id", width: 60 },
  { title: "属性名", key: "name", minWidth: 120 },
  { title: "值", key: "value", minWidth: 150, ellipsis: { tooltip: true } },
  {
    title: "字典ID",
    key: "dictionary_value_id",
    width: 80,
    render: (row) => row.dictionary_value_id || "-",
  },
];

// --- Init ---
onMounted(() => {
  if (appStore.stores.length === 0) {
    appStore.fetchStores();
  }
  loadTasks();
});
</script>

<style scoped>
.container {
  padding: 16px;
}
.card {
  background: var(--bg-card);
  border-radius: 12px;
  padding: 20px;
  border: 1px solid rgba(255, 255, 255, 0.06);
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.img-preview {
  width: 80px;
  height: 100px;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.1);
  position: relative;
}
.img-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.img-idx {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 10px;
  text-align: center;
  padding: 1px 0;
}
</style>
