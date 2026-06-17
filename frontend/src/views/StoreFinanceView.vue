<template>
  <div class="container">
    <div style="margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
      <h2 class="section-title" style="margin: 0;">店铺流水</h2>
      <div style="display: flex; gap: 8px; align-items: center;">
        <button class="button-secondary" @click="loadData" :disabled="loading">
          {{ loading ? '刷新中...' : '刷新' }}
        </button>
      </div>
    </div>

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

      <!-- Summary card -->
      <div class="card">
        <h3 class="section-title">汇总</h3>
        <div class="grid grid-3">
          <div class="summary-item">
            <h4>总可用余额</h4>
            <p>¥ {{ totalBalance.toFixed(2) }}</p>
          </div>
          <div class="summary-item">
            <h4>总收入</h4>
            <p>¥ {{ totalIncome.toFixed(2) }}</p>
          </div>
          <div class="summary-item">
            <h4>总支出</h4>
            <p>¥ {{ totalExpense.toFixed(2) }}</p>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { apiGet } from "../api";

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

const finances = ref<StoreFinance[]>([]);
const loading = ref(false);

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
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
}

onMounted(loadData);
</script>
