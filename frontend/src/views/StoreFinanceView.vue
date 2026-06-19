<template>
  <div class="container">
    <div style="margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
      <n-h2 prefix="bar" style="margin: 0;">店铺流水</n-h2>
      <div style="display: flex; gap: 8px; align-items: center;">
        <n-button type="primary" @click="syncFinance" :loading="syncing">
          {{ syncing ? '同步中...' : '一键同步' }}
        </n-button>
        <n-button @click="loadData" :loading="loading">
          {{ loading ? '刷新中...' : '刷新' }}
        </n-button>
      </div>
    </div>

    <n-tabs v-model:value="activeTab" type="line" style="margin-bottom: 16px;">
      <n-tab-pane name="balance" tab="余额报告" />
      <n-tab-pane name="cashflow" tab="财务报告" />
    </n-tabs>

    <!-- 余额报告 tab -->
    <template v-if="activeTab === 'balance'">
      <div v-if="loading && !finances.length" style="text-align: center; padding: 48px; color: #64748b;">
        加载中...
      </div>

      <div v-else-if="!finances.length" style="text-align: center; padding: 48px; color: #64748b;">
        暂无资金数据，请先同步店铺流水信息。
      </div>

      <template v-else>
        <div class="card" style="margin-bottom: 20px;">
          <table class="table">
            <thead>
              <tr>
                <th>店铺名称</th>
                <th>所属账号</th>
                <th>可用余额</th>
                <th>总收入</th>
                <th>总支出/扣款</th>
                <th>待结算金额</th>
                <th>最后同步</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in finances" :key="item.id">
                <td>{{ item.store_name }}</td>
                <td>{{ item.account_name }}</td>
                <td>
                  <span :style="{ color: item.balance >= 0 ? '#166534' : '#dc2626', fontWeight: 600 }">
                    ¥ {{ item.balance.toFixed(2) }}
                  </span>
                </td>
                <td style="color: #166534;">¥ {{ item.total_income.toFixed(2) }}</td>
                <td style="color: #dc2626;">¥ {{ item.total_expense.toFixed(2) }}</td>
                <td>¥ {{ item.pending_amount.toFixed(2) }}</td>
                <td style="font-size: 12px; color: #64748b;">{{ formatTime(item.last_sync_at) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="card">
          <n-h3 prefix="bar" style="margin: 0 0 16px;">汇总</n-h3>
          <n-grid :cols="3" :x-gap="20">
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
          </n-grid>
        </div>
      </template>
    </template>

    <!-- 财务报告 tab -->
    <template v-if="activeTab === 'cashflow'">
      <div v-if="loading" style="text-align: center; padding: 48px; color: #64748b;">
        加载中...
      </div>
      <div v-else-if="!cashFlowItems.length" style="text-align: center; padding: 48px; color: #64748b;">
        暂无财务报告数据，请先同步店铺流水。
      </div>
      <div v-else class="card">
        <table class="table">
          <thead>
            <tr>
              <th>店铺</th>
              <th>金额</th>
              <th>类型</th>
              <th>描述</th>
              <th>时间</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, idx) in cashFlowItems" :key="idx">
              <td>{{ item.store_name }}</td>
              <td>
                <span :style="{ color: item.amount >= 0 ? '#166534' : '#dc2626', fontWeight: 600 }">
                  ¥ {{ item.amount.toFixed(2) }}
                </span>
              </td>
              <td>{{ item.type }}</td>
              <td style="max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                {{ item.description }}
              </td>
              <td style="font-size: 12px; color: #64748b;">{{ item.posted_at }}</td>
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
  account_name: string;
  balance: number;
  total_income: number;
  total_expense: number;
  pending_amount: number;
  last_sync_at: string | null;
}

interface CashFlowItem {
  store_name: string;
  amount: number;
  type: string;
  description: string;
  posted_at: string;
}

const activeTab = ref<string | number>("balance");
const finances = ref<StoreFinance[]>([]);
const cashFlowItems = ref<CashFlowItem[]>([]);
const loading = ref(false);
const syncing = ref(false);

const totalBalance = computed(() => finances.value.reduce((s, f) => s + f.balance, 0));
const totalIncome = computed(() => finances.value.reduce((s, f) => s + f.total_income, 0));
const totalExpense = computed(() => finances.value.reduce((s, f) => s + f.total_expense, 0));

function formatTime(t: string | null) {
  if (!t) return "-";
  return new Date(t).toLocaleString("zh-CN");
}

async function loadData() {
  loading.value = true;
  try {
    finances.value = await apiGet<StoreFinance[]>("/finances/");
    cashFlowItems.value = finances.value.flatMap(f => [
      {
        store_name: f.store_name,
        amount: f.total_income,
        type: "收入",
        description: "期间总收入",
        posted_at: f.last_sync_at || "",
      },
      {
        store_name: f.store_name,
        amount: -f.total_expense,
        type: "支出",
        description: "期间总支出/扣款",
        posted_at: f.last_sync_at || "",
      },
    ]);
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
