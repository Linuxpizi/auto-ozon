<template>
  <div class="container">
    <div class="page-header">
      <n-h2 class="page-title" style="margin: 0;">店铺流水</n-h2>
      <div class="toolbar">
        <n-button type="primary" size="small" @click="syncFinance" :loading="syncing">
          {{ syncing ? '同步中...' : '一键同步' }}
        </n-button>
        <n-button size="small" @click="loadData" :loading="loading">
          {{ loading ? '刷新中...' : '刷新' }}
        </n-button>
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
        <div class="card" style="margin-bottom: 20px;">
          <table class="table">
            <thead>
              <tr>
                <th>店铺名称</th>
                <th>可用余额</th>
                <th>总收入</th>
                <th>总支出/扣款</th>
                <th>已打款</th>
                <th>待结算</th>
                <th>最后同步</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in finances" :key="item.id">
                <td>{{ item.store_name }}</td>
                <td>
                  <span :style="{ color: item.balance >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }">
                    ¥ {{ item.balance.toFixed(2) }}
                  </span>
                </td>
                <td style="color: var(--success);">¥ {{ item.total_income.toFixed(2) }}</td>
                <td style="color: var(--danger);">¥ {{ item.total_expense.toFixed(2) }}</td>
                <td>¥ {{ item.paid.toFixed(2) }}</td>
                <td>¥ {{ item.pending_amount.toFixed(2) }}</td>
                <td style="font-size: 12px; color: var(--text-secondary);">{{ formatTime(item.last_sync_at) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="card">
          <n-h3 prefix="bar" style="margin: 0 0 16px;">汇总</n-h3>
          <n-grid :cols="4" :x-gap="20">
            <n-gi>
              <div class="summary-item">
                <n-statistic label="总可用余额" :value="totalBalance" :precision="2" :prefix="() => '¥'" />
              </div>
            </n-gi>
            <n-gi>
              <div class="summary-item">
                <n-statistic label="总收入" :value="totalIncome" :precision="2" :prefix="() => '¥'" />
              </div>
            </n-gi>
            <n-gi>
              <div class="summary-item">
                <n-statistic label="总支出" :value="totalExpense" :precision="2" :prefix="() => '¥'" />
              </div>
            </n-gi>
            <n-gi>
              <div class="summary-item">
                <n-statistic label="总已打款" :value="totalPaid" :precision="2" :prefix="() => '¥'" />
              </div>
            </n-gi>
          </n-grid>
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
      <div v-else class="card">
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
            <tr v-for="item in cashFlows" :key="item.id">
              <td>{{ item.store_name }}</td>
              <td style="font-size: 12px; color: var(--text-secondary);">{{ item.period_begin.slice(0, 10) }} ~ {{ item.period_end.slice(0, 10) }}</td>
              <td style="color: var(--success); font-weight: 600;">¥ {{ item.orders_amount.toFixed(2) }}</td>
              <td :style="{ color: item.returns_amount < 0 ? 'var(--danger)' : 'var(--text-secondary)', fontWeight: 600 }">
                ¥ {{ item.returns_amount.toFixed(2) }}
              </td>
              <td style="color: var(--danger);">¥ {{ item.commission_amount.toFixed(2) }}</td>
              <td style="color: var(--danger);">¥ {{ item.services_amount.toFixed(2) }}</td>
              <td style="color: var(--danger);">¥ {{ item.delivery_amount.toFixed(2) }}</td>
              <td>{{ item.currency_code }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { NH2, NH3, NTabs, NTabPane, NButton, NGrid, NGi, NStatistic } from "naive-ui";
import { apiGet, apiPost } from "../api";

interface StoreFinance {
  id: number;
  store_id: number;
  store_name: string;
  balance: number;
  total_income: number;
  total_expense: number;
  pending_amount: number;
  paid: number;
  last_sync_at: string | null;
}

interface CashFlowRecord {
  store_name: string;
  period_begin: string;
  period_end: string;
  orders_amount: number;
  returns_amount: number;
  commission_amount: number;
  services_amount: number;
  delivery_amount: number;
  currency_code: string;
}

const activeTab = ref<string | number>("balance");
const finances = ref<StoreFinance[]>([]);
const cashFlows = ref<CashFlowRecord[]>([]);
const loading = ref(false);
const syncing = ref(false);

const totalBalance = computed(() => finances.value.reduce((s, f) => s + f.balance, 0));
const totalIncome = computed(() => finances.value.reduce((s, f) => s + f.total_income, 0));
const totalExpense = computed(() => finances.value.reduce((s, f) => s + f.total_expense, 0));
const totalPaid = computed(() => finances.value.reduce((s, f) => s + f.paid, 0));

function formatTime(t: string | null) {
  if (!t) return "-";
  return new Date(t).toLocaleString("zh-CN");
}

async function loadData() {
  loading.value = true;
  try {
    finances.value = await apiGet<StoreFinance[]>("/finances/");
    cashFlows.value = await apiGet<CashFlowRecord[]>("/finances/cashflows");
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
}

async function syncFinance() {
  syncing.value = true;
  try {
    await apiPost("/finances/sync");
    await loadData();
    alert("资金同步成功");
  } catch (e: any) {
    console.error(e);
    alert(`同步失败: ${e?.message || "请稍后重试"}`);
  } finally {
    syncing.value = false;
  }
}

onMounted(loadData);
</script>
