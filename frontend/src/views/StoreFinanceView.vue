<template>
  <div class="container">
    <div class="page-header">
      <n-h2 class="page-title" style="margin: 0;">店铺流水</n-h2>
      <div class="toolbar">
        <n-select v-model:value="filterStoreId"
          :options="[{ label: '全部店铺', value: '' }, ...storeOptions]"
          placeholder="全部店铺" clearable size="small" style="width: 160px;" @update:value="loadData" />
        <n-button type="primary" size="small" @click="syncFinance" :loading="syncing">
          {{ syncing ? '同步中...' : '一键同步' }}
        </n-button>
        <n-button size="small" @click="loadData" :loading="loading">
          {{ loading ? '刷新中...' : '刷新' }}
        </n-button>
        <span v-if="syncResult" style="font-size: 12px; margin-left: 8px;"
          :style="{ color: syncResult.includes('失败') ? 'var(--danger)' : 'var(--success)' }">
          {{ syncResult }}
        </span>
      </div>
    </div>

    <n-tabs v-model:value="activeTab" type="line" style="margin-bottom: 20px;">
      <n-tab-pane name="balance" tab="余额报告" />
      <n-tab-pane name="cashflow" tab="财务报告" />
    </n-tabs>

    <!-- 余额报告 tab -->
    <template v-if="activeTab === 'balance'">
      <div v-if="loading && !finances.length" style="text-align: center; padding: 48px; color: var(--text-secondary);">
        加载中...
      </div>

      <div v-else-if="!finances.length" style="text-align: center; padding: 48px; color: var(--text-secondary);">
        暂无资金数据，请先同步店铺流水信息。
      </div>

      <template v-else>
        <!-- 汇总卡片 -->
        <div class="card" style="margin-bottom: 20px;">
          <n-h3 prefix="bar" style="margin: 0 0 16px;">余额概览</n-h3>
          <n-grid :cols="6" :x-gap="16" responsive="screen" :item-responsive="true">
            <n-gi span="6 m:2">
              <n-statistic label="总可用余额" :value="totalBalance" :precision="2" />
            </n-gi>
            <n-gi span="6 m:2">
              <n-statistic label="总收入" :value="totalIncome" :precision="2" />
            </n-gi>
            <n-gi span="6 m:2">
              <n-statistic label="总佣金" :value="totalSalesFee" :precision="2" />
            </n-gi>
            <n-gi span="6 m:2">
              <n-statistic label="总支出" :value="totalExpense" :precision="2" />
            </n-gi>
            <n-gi span="6 m:2">
              <n-statistic label="总已打款" :value="totalPaid" :precision="2" />
            </n-gi>
            <n-gi span="6 m:2">
              <n-statistic label="总待结算" :value="totalPending" :precision="2" />
            </n-gi>
          </n-grid>
        </div>

        <!-- 简要列表 -->
        <div class="card">
          <div class="finance-list-header">
            <span style="flex: 1.2;">店铺</span>
            <span style="flex: 0.8; text-align: right; cursor: pointer; user-select: none;" @click.stop="toggleSort('balance')">
              可用余额 <span style="font-size: 10px; opacity: 0.5;">{{ sortIcon('balance') }}</span>
            </span>
            <span style="flex: 0.8; text-align: right; cursor: pointer; user-select: none;" @click.stop="toggleSort('total_income')">
              总收入 <span style="font-size: 10px; opacity: 0.5;">{{ sortIcon('total_income') }}</span>
            </span>
            <span style="flex: 0.8; text-align: right; cursor: pointer; user-select: none;" @click.stop="toggleSort('sales_fee')">
              总佣金 <span style="font-size: 10px; opacity: 0.5;">{{ sortIcon('sales_fee') }}</span>
            </span>
            <span style="flex: 0.8; text-align: right; cursor: pointer; user-select: none;" @click.stop="toggleSort('total_expense')">
              总支出 <span style="font-size: 10px; opacity: 0.5;">{{ sortIcon('total_expense') }}</span>
            </span>
            <span style="flex: 0.8; text-align: right; cursor: pointer; user-select: none;" @click.stop="toggleSort('paid')">
              已打款 <span style="font-size: 10px; opacity: 0.5;">{{ sortIcon('paid') }}</span>
            </span>
            <span style="flex: 0.8; text-align: right;">待结算</span>
            <span style="width: 36px;"></span>
          </div>
          <div v-for="item in filteredFinances" :key="item.id">
            <div class="finance-list-row" @click="toggleFinanceDetail(item.id)">
              <span class="finance-store-cell" style="flex: 1.2;">
                <span style="font-weight: 600;">{{ item.store_name }}</span>
                <n-tag size="tiny" :bordered="false" type="info" style="margin-left: 6px;">{{ item.currency_code }}</n-tag>
                <span style="font-size: 11px; color: var(--text-secondary); margin-left: 6px;">{{ formatTime(item.last_sync_at) }}</span>
              </span>
              <span class="finance-num" style="flex: 0.8;" :style="{ color: item.balance >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }">
                {{ currencySymbol(item.currency_code) }} {{ item.balance.toFixed(2) }}
              </span>
              <span class="finance-num" style="flex: 0.8; color: var(--success);">
                {{ currencySymbol(item.currency_code) }} {{ item.total_income.toFixed(2) }}
              </span>
              <span class="finance-num" style="flex: 0.8; color: var(--danger);">
                {{ currencySymbol(item.currency_code) }} {{ item.sales_fee.toFixed(2) }}
              </span>
              <span class="finance-num" style="flex: 0.8; color: var(--danger); font-weight: 600;">
                {{ currencySymbol(item.currency_code) }} {{ item.total_expense.toFixed(2) }}
              </span>
              <span class="finance-num" style="flex: 0.8;">
                {{ currencySymbol(item.currency_code) }} {{ item.paid.toFixed(2) }}
              </span>
              <span class="finance-num" style="flex: 0.8; color: var(--primary-color);">
                {{ currencySymbol(item.currency_code) }} {{ item.pending_amount.toFixed(2) }}
              </span>
              <span style="width: 36px; text-align: center; color: var(--text-secondary); transition: transform 0.2s;"
                :style="{ transform: expandedFinanceId === item.id ? 'rotate(90deg)' : 'rotate(0deg)' }">
                ▶
              </span>
            </div>

            <!-- 展开的详细信息 -->
            <div v-if="expandedFinanceId === item.id" class="finance-detail-panel">
              <n-grid :cols="4" :x-gap="16" :y-gap="12" responsive="screen" :item-responsive="true">
                <n-gi span="4 m:2">
                  <div class="detail-label">期初余额</div>
                  <div class="detail-value">{{ currencySymbol(item.currency_code) }} {{ item.opening_balance.toFixed(2) }}</div>
                </n-gi>
                <n-gi span="4 m:2">
                  <div class="detail-label">可用余额 (期末)</div>
                  <div class="detail-value" :style="{ color: item.balance >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 700, fontSize: '18px' }">
                    {{ currencySymbol(item.currency_code) }} {{ item.balance.toFixed(2) }}
                  </div>
                </n-gi>
                <n-gi span="4 m:2">
                  <div class="detail-label">销售收入</div>
                  <div class="detail-value" style="color: var(--success);">{{ currencySymbol(item.currency_code) }} {{ item.total_income.toFixed(2) }}</div>
                </n-gi>
                <n-gi span="4 m:2">
                  <div class="detail-label">销售佣金</div>
                  <div class="detail-value" style="color: var(--danger);">{{ currencySymbol(item.currency_code) }} {{ item.sales_fee.toFixed(2) }}</div>
                </n-gi>
                <n-gi span="4 m:2">
                  <div class="detail-label">实际销售收入</div>
                  <div class="detail-value" style="color: var(--success);">{{ currencySymbol(item.currency_code) }} {{ item.sales_revenue.toFixed(2) }}</div>
                </n-gi>
                <n-gi v-if="item.sales_partner" span="4 m:2">
                  <div class="detail-label">合作伙伴计划</div>
                  <div class="detail-value">{{ currencySymbol(item.currency_code) }} {{ item.sales_partner.toFixed(2) }}</div>
                </n-gi>
                <n-gi span="4 m:2">
                  <div class="detail-label">退货金额</div>
                  <div class="detail-value" :style="{ color: item.returns_amount < 0 ? 'var(--danger)' : 'var(--text-secondary)' }">
                    {{ currencySymbol(item.currency_code) }} {{ item.returns_amount.toFixed(2) }}
                  </div>
                </n-gi>
                <n-gi span="4 m:2">
                  <div class="detail-label">退货手续费</div>
                  <div class="detail-value" style="color: var(--danger);">{{ currencySymbol(item.currency_code) }} {{ item.returns_fee.toFixed(2) }}</div>
                </n-gi>
                <n-gi span="4 m:2">
                  <div class="detail-label">实际退货金额</div>
                  <div class="detail-value">{{ currencySymbol(item.currency_code) }} {{ item.returns_revenue.toFixed(2) }}</div>
                </n-gi>
                <n-gi span="4 m:2">
                  <div class="detail-label">服务费合计</div>
                  <div class="detail-value" style="color: var(--danger);">{{ currencySymbol(item.currency_code) }} {{ item.services_cost.toFixed(2) }}</div>
                </n-gi>
                <n-gi span="4 m:2">
                  <div class="detail-label">已打款</div>
                  <div class="detail-value">{{ currencySymbol(item.currency_code) }} {{ item.paid.toFixed(2) }}</div>
                </n-gi>
                <n-gi span="4 m:2">
                  <div class="detail-label">待结算</div>
                  <div class="detail-value" style="color: var(--primary-color);">{{ currencySymbol(item.currency_code) }} {{ item.pending_amount.toFixed(2) }}</div>
                </n-gi>
                <n-gi span="4 m:2">
                  <div class="detail-label">总支出</div>
                  <div class="detail-value" style="color: var(--danger); font-weight: 600;">{{ currencySymbol(item.currency_code) }} {{ item.total_expense.toFixed(2) }}</div>
                </n-gi>
              </n-grid>

              <!-- 服务费明细 -->
              <template v-if="parseServicesDetail(item.services_detail).length">
                <n-divider style="margin: 16px 0 8px;" />
                <div style="font-size: 13px; font-weight: 500; color: var(--text-secondary); margin-bottom: 8px;">服务费明细</div>
                <n-grid :cols="3" :x-gap="12" :y-gap="4">
                  <n-gi v-for="(svc, idx) in parseServicesDetail(item.services_detail)" :key="idx">
                    <div style="display: flex; justify-content: space-between; font-size: 13px; padding: 4px 8px; background: var(--n-color, rgba(128,128,128,0.05)); border-radius: 4px;">
                      <span style="color: var(--text-secondary);">{{ svc.name }}</span>
                      <span style="color: var(--danger);">{{ currencySymbol(item.currency_code) }} {{ svc.amount.toFixed(2) }}</span>
                    </div>
                  </n-gi>
                </n-grid>
              </template>
            </div>
          </div>
        </div>
      </template>
    </template>

    <!-- 财务报告 tab -->
    <template v-if="activeTab === 'cashflow'">
      <div v-if="loading" style="text-align: center; padding: 48px; color: var(--text-secondary);">
        加载中...
      </div>
      <div v-else-if="!cashFlows.length" style="text-align: center; padding: 48px; color: var(--text-secondary);">
        暂无财务报告数据，请先同步店铺流水。
      </div>
      <div v-else>
        <div class="card" style="margin-bottom: 16px;">
          <n-grid :cols="5" :x-gap="16" responsive="screen" :item-responsive="true">
            <n-gi span="5 m:1">
              <n-statistic label="总订单金额" :value="cfTotalOrders" :precision="2" />
            </n-gi>
            <n-gi span="5 m:1">
              <n-statistic label="总退货金额" :value="cfTotalReturns" :precision="2" />
            </n-gi>
            <n-gi span="5 m:1">
              <n-statistic label="总佣金" :value="cfTotalCommission" :precision="2" />
            </n-gi>
            <n-gi span="5 m:1">
              <n-statistic label="总服务费" :value="cfTotalServices" :precision="2" />
            </n-gi>
            <n-gi span="5 m:1">
              <n-statistic label="总配送费" :value="cfTotalDelivery" :precision="2" />
            </n-gi>
          </n-grid>
        </div>
        <div class="card">
          <table class="table">
            <thead>
              <tr>
                <th>店铺</th>
                <th>周期</th>
                <th>订单金额</th>
                <th>退货金额</th>
                <th>佣金</th>
                <th>服务费</th>
                <th>配送费</th>
                <th>币种</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in filteredCashFlows" :key="item.id">
                <td>{{ item.store_name }}</td>
                <td style="font-size: 12px; color: var(--text-secondary);">{{ item.period_begin.slice(0, 10) }} ~ {{ item.period_end.slice(0, 10) }}</td>
                <td style="color: var(--success); font-weight: 600;">₽ {{ item.orders_amount.toFixed(2) }}</td>
                <td :style="{ color: item.returns_amount < 0 ? 'var(--danger)' : 'var(--text-secondary)', fontWeight: 600 }">
                  ₽ {{ item.returns_amount.toFixed(2) }}
                </td>
                <td style="color: var(--danger);">₽ {{ item.commission_amount.toFixed(2) }}</td>
                <td style="color: var(--danger);">₽ {{ item.services_amount.toFixed(2) }}</td>
                <td style="color: var(--danger);">₽ {{ item.delivery_amount.toFixed(2) }}</td>
                <td>{{ item.currency_code }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { NH2, NH3, NTabs, NTabPane, NButton, NGrid, NGi, NStatistic, NTag, NDivider, NSelect } from "naive-ui";
import { apiGet, apiPost } from "../api";

const CURRENCY_SYMBOLS: Record<string, string> = { RUB: '₽', CNY: '¥', USD: '$', EUR: '€' };
function currencySymbol(code: string) { return CURRENCY_SYMBOLS[code] || code + ' '; }

interface ServiceDetailItem {
  name: string;
  amount: number;
}

interface StoreFinance {
  id: number;
  store_id: number;
  store_name: string;
  currency_code: string;
  opening_balance: number;
  balance: number;
  total_income: number;
  sales_fee: number;
  sales_revenue: number;
  sales_partner: number;
  returns_amount: number;
  returns_fee: number;
  returns_revenue: number;
  returns_partner: number;
  services_cost: number;
  services_detail: string;
  total_expense: number;
  pending_amount: number;
  paid: number;
  last_sync_at: string | null;
}

interface CashFlowRecord {
  id: number;
  store_id: number;
  store_name: string;
  period_id: number;
  period_begin: string;
  period_end: string;
  orders_amount: number;
  returns_amount: number;
  commission_amount: number;
  services_amount: number;
  delivery_amount: number;
  currency_code: string;
}

interface StoreOption {
  label: string;
  value: number;
}

const activeTab = ref<string | number>("balance");
const finances = ref<StoreFinance[]>([]);
const cashFlows = ref<CashFlowRecord[]>([]);
const storeOptions = ref<StoreOption[]>([]);
const filterStoreId = ref<string | number>("");
const loading = ref(false);
const syncing = ref(false);
const syncResult = ref<string | null>(null);
const expandedFinanceId = ref<number | null>(null);
const sortKey = ref<string>("");
const sortAsc = ref(true);

function toggleSort(key: string) {
  if (sortKey.value === key) {
    sortAsc.value = !sortAsc.value;
  } else {
    sortKey.value = key;
    sortAsc.value = true;
  }
}

function sortIcon(key: string) {
  if (sortKey.value !== key) return "⇅";
  return sortAsc.value ? "↑" : "↓";
}

function toggleFinanceDetail(id: number) {
  expandedFinanceId.value = expandedFinanceId.value === id ? null : id;
}

const filteredFinances = computed(() => {
  let list = !filterStoreId.value ? finances.value : finances.value.filter(f => f.store_id === filterStoreId.value);
  if (sortKey.value) {
    const key = sortKey.value;
    const dir = sortAsc.value ? 1 : -1;
    list = [...list].sort((a: any, b: any) => (a[key] - b[key]) * dir);
  }
  return list;
});

const filteredCashFlows = computed(() => {
  if (!filterStoreId.value) return cashFlows.value;
  return cashFlows.value.filter(c => c.store_id === filterStoreId.value);
});

const totalBalance = computed(() => filteredFinances.value.reduce((s, f) => s + f.balance, 0));
const totalIncome = computed(() => filteredFinances.value.reduce((s, f) => s + f.total_income, 0));
const totalSalesFee = computed(() => filteredFinances.value.reduce((s, f) => s + f.sales_fee, 0));
const totalExpense = computed(() => filteredFinances.value.reduce((s, f) => s + f.total_expense, 0));
const totalPaid = computed(() => filteredFinances.value.reduce((s, f) => s + f.paid, 0));
const totalPending = computed(() => filteredFinances.value.reduce((s, f) => s + f.pending_amount, 0));
const totalOpening = computed(() => filteredFinances.value.reduce((s, f) => s + f.opening_balance, 0));

const cfTotalOrders = computed(() => filteredCashFlows.value.reduce((s, c) => s + c.orders_amount, 0));
const cfTotalReturns = computed(() => filteredCashFlows.value.reduce((s, c) => s + c.returns_amount, 0));
const cfTotalCommission = computed(() => filteredCashFlows.value.reduce((s, c) => s + c.commission_amount, 0));
const cfTotalServices = computed(() => filteredCashFlows.value.reduce((s, c) => s + c.services_amount, 0));
const cfTotalDelivery = computed(() => filteredCashFlows.value.reduce((s, c) => s + c.delivery_amount, 0));

function parseServicesDetail(raw: string): ServiceDetailItem[] {
  try { return JSON.parse(raw || "[]"); } catch { return []; }
}

function formatTime(t: string | null) {
  if (!t) return "-";
  return new Date(t).toLocaleString("zh-CN");
}

async function loadStores() {
  try {
    const list = await apiGet<any[]>("/stores/", { limit: 999 });
    storeOptions.value = list.map((s: any) => ({ label: s.name, value: s.id }));
  } catch (e) {
    console.error(e);
  }
}

async function loadData() {
  loading.value = true;
  try {
    const params = filterStoreId.value ? { store_id: filterStoreId.value } : {};
    finances.value = await apiGet<StoreFinance[]>("/finances/", params);
    cashFlows.value = await apiGet<CashFlowRecord[]>("/finances/cashflows", { limit: 200, ...params });
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
}

async function syncFinance() {
  syncing.value = true;
  syncResult.value = null;
  try {
    const res = await apiPost<{ status: string }>("/finances/sync");
    await loadData();
    syncResult.value = res.status === "done" ? "同步成功" : "同步完成（部分数据可能未更新）";
    setTimeout(() => syncResult.value = null, 3000);
  } catch (e: any) {
    console.error(e);
    syncResult.value = `同步失败: ${e?.message || "请稍后重试"}`;
  } finally {
    syncing.value = false;
  }
}

onMounted(async () => {
  await loadStores();
  await loadData();
});
</script>

<style scoped>
.finance-list-header {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-color, rgba(128, 128, 128, 0.15));
}

.finance-list-row {
  display: flex;
  align-items: center;
  padding: 10px 16px;
  cursor: pointer;
  transition: background 0.15s;
  border-bottom: 1px solid var(--border-color, rgba(128, 128, 128, 0.08));
}

.finance-list-row:hover {
  background: var(--hover-color, rgba(128, 128, 128, 0.06));
}

.finance-store-cell {
  display: flex;
  align-items: center;
  font-size: 14px;
}

.finance-num {
  text-align: right;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.finance-detail-panel {
  padding: 16px 20px 20px;
  background: var(--detail-bg, rgba(128, 128, 128, 0.03));
  border-bottom: 1px solid var(--border-color, rgba(128, 128, 128, 0.15));
}

.detail-label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.detail-value {
  font-size: 15px;
  font-weight: 500;
}
</style>
