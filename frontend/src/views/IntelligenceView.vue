<template>
  <div class="container">
    <div class="page-header">
      <n-h2 class="page-title" style="margin: 0;">🧠 智囊</n-h2>
      <div class="toolbar">
        <n-select
          v-if="stores.length"
          v-model:value="selectedStoreId"
          :options="stores.map(s => ({ label: s.name, value: s.id }))"
          placeholder="选择店铺"
          style="width: 200px"
          size="small"
        />
        <n-button size="small" @click="loadCurrentTab" :loading="loading">
          {{ loading ? '刷新中...' : '刷新' }}
        </n-button>
      </div>
    </div>

    <!-- Summary cards -->
    <n-space style="margin-bottom: 16px;" :size="16">
      <n-card size="small" style="min-width: 180px;">
        <n-statistic label="活跃定价策略" :value="strategyCount" />
      </n-card>
      <n-card size="small" style="min-width: 180px;">
        <n-statistic label="平台活动" :value="platformCount" />
      </n-card>
      <n-card size="small" style="min-width: 180px;">
        <n-statistic label="卖家促销" :value="sellerCount" />
      </n-card>
    </n-space>

    <n-tabs v-model:value="activeTab" type="line" animated @update:value="onTabChange">
      <!-- ============ 定价策略 ============ -->
      <n-tab-pane name="pricing" tab="💰 定价策略">
        <template v-if="selectedStoreId">
          <n-card size="small">
            <template #header>
              <n-space align="center">
                <span>定价策略列表</span>
                <n-button size="tiny" type="primary" @click="showCreateStrategy = true">+ 创建策略</n-button>
              </n-space>
            </template>
            <n-data-table
              :columns="strategyColumns"
              :data="strategies"
              :loading="loading"
              :pagination="false"
              :row-key="r => r.strategy_id || r.id"
              size="small"
              striped
            />
          </n-card>

          <!-- Strategy detail -->
          <n-card v-if="selectedStrategy" size="small" style="margin-top: 12px;">
            <template #header>
              <n-space align="center">
                <span>策略详情: {{ selectedStrategy.strategy_name }}</span>
                <n-button size="tiny" @click="selectedStrategy = null">关闭</n-button>
              </n-space>
            </template>

            <!-- Competitors -->
            <n-h4 prefix="bar" style="margin: 0 0 8px;">竞争对手</n-h4>
            <n-data-table
              v-if="selectedStrategy.competitors?.length"
              :columns="competitorColumns"
              :data="selectedStrategy.competitors"
              :pagination="false"
              size="small"
              style="margin-bottom: 12px;"
            />
            <n-text v-else depth="3" style="font-size: 13px;">暂无竞争对手</n-text>

            <!-- Bound products -->
            <n-space align="center" style="margin: 12px 0 8px;">
              <n-h4 prefix="bar" style="margin: 0;">关联商品</n-h4>
              <n-button size="tiny" @click="loadStrategyProducts">刷新</n-button>
              <n-button size="tiny" type="primary" @click="showAddStrategyProducts = true">+ 添加商品</n-button>
            </n-space>
            <n-data-table
              :columns="strategyProductColumns"
              :data="strategyProducts"
              :loading="loadingProducts"
              :pagination="false"
              size="small"
              :max-height="300"
            />
          </n-card>
        </template>
        <n-empty v-else description="请先选择店铺" style="padding: 48px;" />
      </n-tab-pane>

      <!-- ============ 平台促销活动 ============ -->
      <n-tab-pane name="platform" tab="🎯 平台促销">
        <template v-if="selectedStoreId">
          <n-card size="small">
            <template #header>
              <span>Ozon 平台促销活动</span>
            </template>
            <n-data-table
              :columns="platformColumns"
              :data="platformActions"
              :loading="loading"
              :pagination="false"
              :row-key="r => r.id"
              size="small"
              striped
            />
          </n-card>

          <!-- Platform action products -->
          <n-card v-if="selectedPlatformAction" size="small" style="margin-top: 12px;">
            <template #header>
              <n-space align="center">
                <span>活动商品: {{ selectedPlatformAction.title }}</span>
                <n-button size="tiny" @click="selectedPlatformAction = null">关闭</n-button>
              </n-space>
            </template>
            <n-space align="center" style="margin-bottom: 8px;">
              <n-text depth="3" style="font-size: 13px;">
                活动时间: {{ formatDate(selectedPlatformAction.date_start) }} ~ {{ formatDate(selectedPlatformAction.date_end) }}
                | 折扣: {{ selectedPlatformAction.discount_value ? selectedPlatformAction.discount_value + '%' : '-' }}
              </n-text>
              <n-button size="tiny" type="error" @click="deactivatePlatformProducts" :disabled="!selectedPlatformProducts.length">
                移除选中商品
              </n-button>
            </n-space>
            <n-data-table
              :columns="platformProductColumns"
              :data="platformProducts"
              :loading="loadingPlatformProducts"
              :pagination="false"
              :row-key="r => r.id"
              size="small"
              :max-height="400"
              @update:checked-row-keys="onPlatformProductSelect"
            />
          </n-card>
        </template>
        <n-empty v-else description="请先选择店铺" style="padding: 48px;" />
      </n-tab-pane>

      <!-- ============ 卖家促销活动 ============ -->
      <n-tab-pane name="seller" tab="🏷️ 卖家促销">
        <template v-if="selectedStoreId">
          <n-card size="small">
            <template #header>
              <n-space align="center">
                <span>卖家自定义促销</span>
                <n-button size="tiny" type="primary" @click="showCreateSellerAction = true">+ 创建促销</n-button>
              </n-space>
            </template>
            <n-data-table
              :columns="sellerColumns"
              :data="sellerActions"
              :loading="loading"
              :pagination="false"
              :row-key="r => r.action_id"
              size="small"
              striped
            />
          </n-card>

          <!-- Seller action products -->
          <n-card v-if="selectedSellerAction" size="small" style="margin-top: 12px;">
            <template #header>
              <n-space align="center">
                <span>促销商品: {{ selectedSellerAction.action_parameters?.title }}</span>
                <n-button size="tiny" @click="selectedSellerAction = null">关闭</n-button>
              </n-space>
            </template>
            <n-space align="center" style="margin-bottom: 8px;">
              <n-text depth="3" style="font-size: 13px;">
                预算: {{ selectedSellerAction.action_parameters?.budget || 0 }}
                | 已花费: {{ selectedSellerAction.action_parameters?.budget_spent || 0 }}
              </n-text>
              <n-button size="tiny" type="error" @click="removeSellerProducts" :disabled="!selectedSellerProducts.length">
                移除选中商品
              </n-button>
            </n-space>
            <n-data-table
              :columns="sellerProductColumns"
              :data="sellerProducts"
              :loading="loadingSellerProducts"
              :pagination="false"
              :row-key="r => r.sku"
              size="small"
              :max-height="400"
              @update:checked-row-keys="onSellerProductSelect"
            />
          </n-card>
        </template>
        <n-empty v-else description="请先选择店铺" style="padding: 48px;" />
      </n-tab-pane>
    </n-tabs>

    <!-- ========== Modals ========== -->

    <!-- Create pricing strategy -->
    <n-modal v-model:show="showCreateStrategy" preset="dialog" title="创建定价策略" style="width: 500px;">
      <n-form label-placement="left" label-width="80">
        <n-form-item label="策略名称">
          <n-input v-model:value="newStrategy.name" placeholder="请输入策略名称" />
        </n-form-item>
      </n-form>
      <template #action>
        <n-button @click="showCreateStrategy = false">取消</n-button>
        <n-button type="primary" :loading="submitting" @click="submitCreateStrategy">创建</n-button>
      </template>
    </n-modal>

    <!-- Add products to pricing strategy -->
    <n-modal v-model:show="showAddStrategyProducts" preset="dialog" title="添加商品到策略" style="width: 500px;">
      <n-form label-placement="left" label-width="80">
        <n-form-item label="商品ID">
          <n-input
            v-model:value="addProductIds"
            type="textarea"
            :rows="4"
            placeholder="每行一个商品ID"
          />
        </n-form-item>
      </n-form>
      <template #action>
        <n-button @click="showAddStrategyProducts = false">取消</n-button>
        <n-button type="primary" :loading="submitting" @click="submitAddStrategyProducts">添加</n-button>
      </template>
    </n-modal>

    <!-- Create seller action -->
    <n-modal v-model:show="showCreateSellerAction" preset="dialog" title="创建卖家促销" style="width: 520px;">
      <n-form label-placement="left" label-width="80">
        <n-form-item label="活动标题">
          <n-input v-model:value="newSellerAction.title" placeholder="周末特惠" />
        </n-form-item>
        <n-form-item label="活动类型">
          <n-select v-model:value="newSellerAction.type" :options="actionTypeOptions" />
        </n-form-item>
        <n-form-item label="折扣类型">
          <n-select v-model:value="newSellerAction.discount_type" :options="discountTypeOptions" />
        </n-form-item>
        <n-form-item label="折扣值">
          <n-input-number v-model:value="newSellerAction.discount_value" :min="0" />
        </n-form-item>
        <n-form-item label="预算 (RUB)">
          <n-input-number v-model:value="newSellerAction.budget" :min="0" />
        </n-form-item>
        <n-form-item label="开始时间">
          <n-date-picker v-model:value="newSellerAction.date_start_ts" type="datetime" clearable style="width: 100%;" />
        </n-form-item>
        <n-form-item label="结束时间">
          <n-date-picker v-model:value="newSellerAction.date_end_ts" type="datetime" clearable style="width: 100%;" />
        </n-form-item>
      </n-form>
      <template #action>
        <n-button @click="showCreateSellerAction = false">取消</n-button>
        <n-button type="primary" :loading="submitting" @click="submitCreateSellerAction">创建</n-button>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, h, onMounted } from "vue";
import {
  NH2, NH4, NButton, NTag, NSpace, NInput, NSelect, NModal, NForm, NFormItem,
  NInputNumber, NDatePicker, NDataTable, NCard, NStatistic, NTabs, NTabPane,
  NText, NEmpty, useMessage,
} from "naive-ui";
import type { DataTableColumns, DataTableRowKey } from "naive-ui";
import { apiGet, apiPost, apiDelete } from "../api";

const message = useMessage();

// ============================================================
// State
// ============================================================
const stores = ref<any[]>([]);
const selectedStoreId = ref<number | null>(null);
const activeTab = ref("pricing");
const loading = ref(false);
const submitting = ref(false);

const strategyCount = ref(0);
const platformCount = ref(0);
const sellerCount = ref(0);

// Pricing
const strategies = ref<any[]>([]);
const selectedStrategy = ref<any>(null);
const strategyProducts = ref<any[]>([]);
const loadingProducts = ref(false);
const showCreateStrategy = ref(false);
const showAddStrategyProducts = ref(false);
const addProductIds = ref("");
const newStrategy = ref({ name: "" });

// Platform
const platformActions = ref<any[]>([]);
const selectedPlatformAction = ref<any>(null);
const platformProducts = ref<any[]>([]);
const loadingPlatformProducts = ref(false);
const selectedPlatformProducts = ref<any[]>([]);

// Seller
const sellerActions = ref<any[]>([]);
const selectedSellerAction = ref<any>(null);
const sellerProducts = ref<any[]>([]);
const loadingSellerProducts = ref(false);
const selectedSellerProducts = ref<any[]>([]);
const showCreateSellerAction = ref(false);
const newSellerAction = ref({
  title: "",
  type: "DISCOUNT",
  discount_type: "PERCENT",
  discount_value: 10,
  budget: 0,
  date_start_ts: null as number | null,
  date_end_ts: null as number | null,
});

const actionTypeOptions = [
  { label: "折扣", value: "DISCOUNT" },
  { label: "优惠券折扣", value: "VOUCHER_DISCOUNT" },
  { label: "满减折扣", value: "DISCOUNT_WITH_CONDITION" },
  { label: "分期免息", value: "INSTALLMENT" },
  { label: "多级满减", value: "MULTI_LEVEL_DISCOUNT_ON_AMOUNT" },
];
const discountTypeOptions = [
  { label: "百分比", value: "PERCENT" },
  { label: "固定金额", value: "CURRENCY" },
];

// ============================================================
// Helpers
// ============================================================
function formatDate(d: string) {
  if (!d) return "-";
  try { return new Date(d).toLocaleString("zh-CN"); } catch { return d; }
}

function formatPrice(v: any) {
  if (v === null || v === undefined || v === "") return "-";
  return "₽" + Number(v).toFixed(2);
}

// Ozon API enum → Chinese translations
const STRATEGY_TYPE_MAP: Record<string, string> = {
  COMP_PRICE: "竞品跟价",
  MIN_EXT_PRICE: "最低价跟价",
  MIN_PRICE: "最低价跟价",
  TARGET_MARGIN: "目标毛利",
  FIXED_PRICE: "固定价格",
};
const ACTION_TYPE_MAP: Record<string, string> = {
  DISCOUNT: "折扣",
  VOUCHER_DISCOUNT: "优惠券折扣",
  DISCOUNT_WITH_CONDITION: "满减折扣",
  INSTALLMENT: "分期免息",
  INDIVIDUAL_DISCOUNT_BY_PRODUCTS: "卖家折扣",
  OZON_ACCOUNT_DISCOUNT: "Ozon卡折扣",
  MULTI_LEVEL_DISCOUNT_ON_AMOUNT: "多级满减",
  MARKETPLACE_MULTI_LEVEL_DISCOUNT_ON_AMOUNT: "平台多级满减",
  STOCK_DISCOUNT: "库存折扣",
};
const SELLER_ACTION_TYPE_MAP: Record<string, string> = {
  DISCOUNT: "折扣",
  VOUCHER: "优惠券",
  DISCOUNT_WITH_CONDITION: "满减折扣",
  INSTALLMENT: "分期免息",
  MULTI_LEVEL_DISCOUNT_ON_AMOUNT: "多级满减",
};
const DISCOUNT_TYPE_MAP: Record<string, string> = {
  PERCENT: "百分比",
  CURRENCY: "固定金额",
  UNSPECIFIED: "未指定",
};
const ACTION_STATUS_MAP: Record<string, string> = {
  ACTIVE: "进行中",
  ENDED: "已结束",
  PLANNED: "待开始",
  PAUSED: "已暂停",
};
const ADD_MODE_MAP: Record<string, string> = {
  AUTO: "自动",
  MANUAL: "手动",
  NOT_SET: "未设置",
};

function translateActionType(val: string) {
  return ACTION_TYPE_MAP[val] || val || "-";
}
function translateStrategyType(val: string) {
  return STRATEGY_TYPE_MAP[val] || val || "-";
}
function translateSellerActionType(val: string) {
  return SELLER_ACTION_TYPE_MAP[val] || val || "-";
}
function translateDiscountType(val: string) {
  return DISCOUNT_TYPE_MAP[val] || val || "-";
}
function translateActionStatus(val: string) {
  return ACTION_STATUS_MAP[val] || val || "-";
}
function translateAddMode(val: string) {
  return ADD_MODE_MAP[val] || val || "-";
}

// ============================================================
// Table Columns
// ============================================================
const strategyColumns: DataTableColumns<any> = [
  { title: "策略名称", key: "strategy_name", render: row => h("span", { style: "font-weight:500" }, row.strategy_name || row.name || "-") },
  { title: "类型", key: "type", width: 120,
    render: row => h(NTag, { size: "small" }, { default: () => translateStrategyType(row.type) }) },
  {
    title: "状态", key: "enabled", width: 90,
    render: row => h(NTag, { type: row.enabled ? "success" : "default", size: "small", round: true },
      { default: () => row.enabled ? "已启用" : "已禁用" }),
  },
  { title: "竞争对手", key: "competitors", width: 80, render: row => (row.competitors || []).length },
  {
    title: "操作", key: "actions", width: 200,
    render: row => h(NSpace, { size: 4 }, {
      default: () => [
        h(NButton, { size: "tiny", onClick: () => viewStrategyDetail(row) }, { default: () => "详情" }),
        h(NButton, { size: "tiny", onClick: () => toggleStrategy(row) }, { default: () => row.enabled ? "禁用" : "启用" }),
        h(NButton, { size: "tiny", type: "error", onClick: () => deleteStrategy(row) }, { default: () => "删除" }),
      ],
    }),
  },
];

const competitorColumns: DataTableColumns<any> = [
  { title: "竞争对手 ID", key: "competitor_id" },
  { title: "系数", key: "coefficient" },
];

const strategyProductColumns: DataTableColumns<any> = [
  { title: "商品ID", key: "product_id" },
  { title: "SKU", key: "sku" },
  { title: "策略价格", key: "strategy_product_price", render: row => formatPrice(row.strategy_product_price) },
  { title: "竞品链接", key: "competitor_product_url", ellipsis: { tooltip: true }, render: row => {
    const url = row.competitor_product_url;
    return url ? h("a", { href: url, target: "_blank", style: "color: var(--n-color-target); font-size:12px;" }, "查看") : "-";
  }},
  { title: "更新时间", key: "price_downloaded_at", render: row => formatDate(row.price_downloaded_at) },
];

const platformColumns: DataTableColumns<any> = [
  { title: "活动名称", key: "title", render: row => h("span", { style: "font-weight:500" }, row.title) },
  { title: "类型", key: "action_type", width: 120,
    render: row => h(NTag, { size: "small" }, { default: () => translateActionType(row.action_type) }) },
  {
    title: "时间", key: "date_start", width: 200,
    render: row => h("div", { style: "font-size:12px;" }, [
      h("div", {}, formatDate(row.date_start)),
      h("div", {}, "~ " + formatDate(row.date_end)),
    ]),
  },
  {
    title: "参与状态", key: "is_participating", width: 90,
    render: row => h(NTag, { type: row.is_participating ? "success" : "default", size: "small", round: true },
      { default: () => row.is_participating ? "已参加" : "未参加" }),
  },
  {
    title: "商品数", key: "participating_products_count", width: 100,
    render: row => (row.participating_products_count || 0) + " / " + (row.potential_products_count || 0),
  },
  {
    title: "折扣", key: "discount_value", width: 80,
    render: row => row.discount_value ? row.discount_value + "%" : "-",
  },
  {
    title: "操作", key: "actions", width: 100,
    render: row => h(NButton, { size: "tiny", onClick: () => viewPlatformProducts(row) }, { default: () => "商品" }),
  },
];

const platformProductColumns: DataTableColumns<any> = [
  { type: "selection" },
  { title: "商品ID", key: "id" },
  { title: "名称", key: "name", ellipsis: { tooltip: true } },
  { title: "原价", key: "price", render: row => formatPrice(row.price) },
  { title: "活动价", key: "action_price", render: row => formatPrice(row.action_price) },
  { title: "最高活动价", key: "max_action_price", render: row => formatPrice(row.max_action_price) },
  { title: "库存", key: "stock" },
  { title: "最低库存", key: "min_stock" },
  {
    title: "添加方式", key: "add_mode",
    render: row => h(NTag, {
      size: "small",
      type: row.add_mode === "AUTO" ? "success" : row.add_mode === "MANUAL" ? "warning" : "default",
    }, { default: () => translateAddMode(row.add_mode) }),
  },
];

const sellerColumns: DataTableColumns<any> = [
  { title: "活动标题", key: "title", render: row => h("span", { style: "font-weight:500" }, row.action_parameters?.title || "-") },
  { title: "类型", key: "type", width: 120,
    render: row => h(NTag, { size: "small" }, { default: () => translateSellerActionType(row.action_parameters?.type) }) },
  {
    title: "状态", key: "status", width: 90,
    render: row => h(NTag, {
      type: row.action_parameters?.status === "ACTIVE" ? "success" : row.action_parameters?.status === "ENDED" ? "error" : row.action_parameters?.status === "PAUSED" ? "warning" : "default",
      size: "small", round: true,
    }, { default: () => translateActionStatus(row.action_parameters?.status) }),
  },
  {
    title: "时间", key: "date_start", width: 200,
    render: row => h("div", { style: "font-size:12px;" }, [
      h("div", {}, formatDate(row.action_parameters?.date_start)),
      h("div", {}, "~ " + formatDate(row.action_parameters?.date_end)),
    ]),
  },
  { title: "预算", key: "budget", width: 100, render: row => formatPrice(row.action_parameters?.budget) },
  { title: "已花费", key: "budget_spent", width: 100, render: row => formatPrice(row.action_parameters?.budget_spent) },
  { title: "商品数", key: "sku_count", width: 70 },
  {
    title: "操作", key: "actions", width: 140,
    render: row => h(NSpace, { size: 4 }, {
      default: () => [
        h(NButton, { size: "tiny", onClick: () => viewSellerProducts(row) }, { default: () => "商品" }),
        h(NButton, { size: "tiny", type: "error", onClick: () => deleteSellerAction(row) }, { default: () => "删除" }),
      ],
    }),
  },
];

const sellerProductColumns: DataTableColumns<any> = [
  { type: "selection" },
  { title: "SKU", key: "sku" },
  { title: "名称", key: "name", ellipsis: { tooltip: true } },
  { title: "原价", key: "price", render: row => formatPrice(row.price) },
  { title: "促销价", key: "action_price", render: row => formatPrice(row.action_price) },
  { title: "折扣%", key: "discount_percent" },
  { title: "库存", key: "stock" },
];

// ============================================================
// Data Loading
// ============================================================
async function loadStores() {
  try {
    stores.value = await apiGet("/stores/");
    if (stores.value.length && !selectedStoreId.value) {
      selectedStoreId.value = stores.value[0].id;
    }
  } catch (e: any) {
    message.error("加载店铺失败: " + e.message);
  }
}

async function loadStrategies() {
  if (!selectedStoreId.value) return;
  loading.value = true;
  try {
    const data = await apiGet("/intelligence/pricing/strategies", { store_id: selectedStoreId.value });
    strategies.value = Array.isArray(data) ? data : data.strategies || data.result || [];
    strategyCount.value = strategies.value.filter((s: any) => s.enabled).length;
  } catch (e: any) {
    message.error("加载定价策略失败: " + e.message);
    strategies.value = [];
  } finally { loading.value = false; }
}

async function loadStrategyProducts() {
  if (!selectedStoreId.value || !selectedStrategy.value) return;
  loadingProducts.value = true;
  try {
    const sid = selectedStrategy.value.strategy_id || selectedStrategy.value.id;
    const data = await apiGet("/intelligence/pricing/products", {
      store_id: selectedStoreId.value,
      strategy_id: sid,
    });
    strategyProducts.value = Array.isArray(data) ? data : data.result || [];
  } catch (e: any) {
    message.error("加载策略商品失败: " + e.message);
    strategyProducts.value = [];
  } finally { loadingProducts.value = false; }
}

async function loadPlatformActions() {
  if (!selectedStoreId.value) return;
  loading.value = true;
  try {
    const data = await apiGet("/intelligence/platform-actions", { store_id: selectedStoreId.value });
    platformActions.value = Array.isArray(data) ? data : data.result || [];
    platformCount.value = platformActions.value.length;
  } catch (e: any) {
    message.error("加载平台活动失败: " + e.message);
    platformActions.value = [];
  } finally { loading.value = false; }
}

async function loadPlatformProducts() {
  if (!selectedStoreId.value || !selectedPlatformAction.value) return;
  loadingPlatformProducts.value = true;
  try {
    const data = await apiGet("/intelligence/platform-actions/" + selectedPlatformAction.value.id + "/products", {
      store_id: selectedStoreId.value,
      limit: 1000,
    });
    const result = data?.result || data;
    platformProducts.value = result?.products || (Array.isArray(result) ? result : []);
  } catch (e: any) {
    message.error("加载活动商品失败: " + e.message);
    platformProducts.value = [];
  } finally { loadingPlatformProducts.value = false; }
}

async function loadSellerActions() {
  if (!selectedStoreId.value) return;
  loading.value = true;
  try {
    const data = await apiGet("/intelligence/seller-actions", { store_id: selectedStoreId.value });
    sellerActions.value = Array.isArray(data) ? data : data.actions || data.result || [];
    sellerCount.value = sellerActions.value.filter((a: any) => a.action_parameters?.status === "ACTIVE").length;
  } catch (e: any) {
    message.error("加载卖家促销失败: " + e.message);
    sellerActions.value = [];
  } finally { loading.value = false; }
}

async function loadSellerProducts() {
  if (!selectedStoreId.value || !selectedSellerAction.value) return;
  loadingSellerProducts.value = true;
  try {
    const data = await apiGet("/intelligence/seller-actions/" + selectedSellerAction.value.action_id + "/products", {
      store_id: selectedStoreId.value,
    });
    const result = data?.result || data;
    sellerProducts.value = result?.products || (Array.isArray(result) ? result : []);
  } catch (e: any) {
    message.error("加载促销商品失败: " + e.message);
    sellerProducts.value = [];
  } finally { loadingSellerProducts.value = false; }
}

function loadCurrentTab() {
  if (activeTab.value === "pricing") loadStrategies();
  else if (activeTab.value === "platform") loadPlatformActions();
  else if (activeTab.value === "seller") loadSellerActions();
}

function onTabChange() {
  selectedStrategy.value = null;
  selectedPlatformAction.value = null;
  selectedSellerAction.value = null;
  loadCurrentTab();
}

// ============================================================
// Pricing Actions
// ============================================================
async function viewStrategyDetail(s: any) {
  if (!selectedStoreId.value) return;
  try {
    const sid = s.strategy_id || s.id;
    const data = await apiGet("/intelligence/pricing/strategies/" + sid, { store_id: selectedStoreId.value });
    selectedStrategy.value = data;
    strategyProducts.value = [];
    await loadStrategyProducts();
  } catch (e: any) {
    message.error("获取策略详情失败: " + e.message);
  }
}

async function toggleStrategy(s: any) {
  if (!selectedStoreId.value) return;
  const sid = s.strategy_id || s.id;
  try {
    await apiPost("/intelligence/pricing/strategies/" + sid + "/status?store_id=" + selectedStoreId.value, {
      is_active: !s.enabled,
    });
    message.success(s.enabled ? "已禁用" : "已启用");
    loadStrategies();
  } catch (e: any) {
    message.error("操作失败: " + e.message);
  }
}

async function deleteStrategy(s: any) {
  if (!selectedStoreId.value) return;
  const sid = s.strategy_id || s.id;
  try {
    await apiDelete("/intelligence/pricing/strategies/" + sid + "?store_id=" + selectedStoreId.value);
    message.success("已删除");
    selectedStrategy.value = null;
    loadStrategies();
  } catch (e: any) {
    message.error("删除失败: " + e.message);
  }
}

async function submitCreateStrategy() {
  if (!selectedStoreId.value || !newStrategy.value.name) {
    message.warning("请输入策略名称");
    return;
  }
  submitting.value = true;
  try {
    await apiPost("/intelligence/pricing/strategies?store_id=" + selectedStoreId.value, {
      strategy_name: newStrategy.value.name,
    });
    message.success("创建成功");
    showCreateStrategy.value = false;
    newStrategy.value.name = "";
    loadStrategies();
  } catch (e: any) {
    message.error("创建失败: " + e.message);
  } finally { submitting.value = false; }
}

async function submitAddStrategyProducts() {
  if (!selectedStoreId.value || !selectedStrategy.value || !addProductIds.value.trim()) {
    message.warning("请输入商品ID");
    return;
  }
  const ids = addProductIds.value.split("\n").map(s => s.trim()).filter(Boolean);
  if (!ids.length) {
    message.warning("请输入至少一个商品ID");
    return;
  }
  const sid = selectedStrategy.value.strategy_id || selectedStrategy.value.id;
  submitting.value = true;
  try {
    await apiPost("/intelligence/pricing/products/add?store_id=" + selectedStoreId.value, {
      strategy_id: sid,
      product_id: ids,
    });
    message.success("已添加 " + ids.length + " 个商品");
    showAddStrategyProducts.value = false;
    addProductIds.value = "";
    loadStrategyProducts();
  } catch (e: any) {
    message.error("添加失败: " + e.message);
  } finally { submitting.value = false; }
}

// ============================================================
// Platform Actions
// ============================================================
async function viewPlatformProducts(a: any) {
  selectedPlatformAction.value = a;
  selectedPlatformProducts.value = [];
  await loadPlatformProducts();
}

function onPlatformProductSelect(rowKeys: DataTableRowKey[]) {
  selectedPlatformProducts.value = platformProducts.value.filter(p => rowKeys.includes(p.id));
}

async function deactivatePlatformProducts() {
  if (!selectedStoreId.value || !selectedPlatformAction.value || !selectedPlatformProducts.value.length) return;
  try {
    await apiPost("/intelligence/platform-actions/" + selectedPlatformAction.value.id + "/deactivate?store_id=" + selectedStoreId.value, {
      product_ids: selectedPlatformProducts.value.map(p => p.id),
    });
    message.success("已移除选中商品");
    selectedPlatformProducts.value = [];
    loadPlatformProducts();
  } catch (e: any) {
    message.error("移除失败: " + e.message);
  }
}

// ============================================================
// Seller Actions
// ============================================================
async function viewSellerProducts(a: any) {
  selectedSellerAction.value = a;
  sellerProducts.value = [];
  selectedSellerProducts.value = [];
  await loadSellerProducts();
}

function onSellerProductSelect(rowKeys: DataTableRowKey[]) {
  selectedSellerProducts.value = sellerProducts.value.filter(p => rowKeys.includes(p.sku));
}

async function removeSellerProducts() {
  if (!selectedStoreId.value || !selectedSellerAction.value || !selectedSellerProducts.value.length) return;
  try {
    const url = "http://" + window.location.hostname + ":9000/api/intelligence/seller-actions/" +
      selectedSellerAction.value.action_id + "/products?store_id=" + selectedStoreId.value;
    await fetch(url, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_ids: selectedSellerProducts.value.map(p => p.sku) }),
    });
    message.success("已移除选中商品");
    selectedSellerProducts.value = [];
    loadSellerProducts();
  } catch (e: any) {
    message.error("移除失败: " + e.message);
  }
}

async function submitCreateSellerAction() {
  if (!selectedStoreId.value || !newSellerAction.value.title) {
    message.warning("请输入活动标题");
    return;
  }
  submitting.value = true;
  try {
    const params: any = {
      title: newSellerAction.value.title,
      type: newSellerAction.value.type,
      discount_type: newSellerAction.value.discount_type,
      discount_value: newSellerAction.value.discount_value,
      budget: newSellerAction.value.budget,
    };
    if (newSellerAction.value.date_start_ts) {
      params.date_start = new Date(newSellerAction.value.date_start_ts).toISOString();
    }
    if (newSellerAction.value.date_end_ts) {
      params.date_end = new Date(newSellerAction.value.date_end_ts).toISOString();
    }
    await apiPost("/intelligence/seller-actions?store_id=" + selectedStoreId.value, params);
    message.success("创建成功");
    showCreateSellerAction.value = false;
    newSellerAction.value = { title: "", type: "DISCOUNT", discount_type: "PERCENT", discount_value: 10, budget: 0, date_start_ts: null, date_end_ts: null };
    loadSellerActions();
  } catch (e: any) {
    message.error("创建失败: " + e.message);
  } finally { submitting.value = false; }
}

async function deleteSellerAction(a: any) {
  if (!selectedStoreId.value) return;
  try {
    await apiDelete("/intelligence/seller-actions/" + a.action_id + "?store_id=" + selectedStoreId.value);
    message.success("已删除");
    if (selectedSellerAction.value?.action_id === a.action_id) {
      selectedSellerAction.value = null;
    }
    loadSellerActions();
  } catch (e: any) {
    message.error("删除失败: " + e.message);
  }
}

// ============================================================
// Init
// ============================================================
onMounted(async () => {
  await loadStores();
  loadCurrentTab();
});
</script>

<style scoped>
.container {
  padding: 24px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
