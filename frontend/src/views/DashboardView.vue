<template>
  <div class="container">
    <div class="page-header">
      <n-h2 class="page-title" style="margin: 0;">仪表盘</n-h2>
    </div>

    <section class="logistics-hero">
      <div class="logistics-hero__main">
        <div class="logistics-hero__eyebrow">重点关注 · 跨境物流</div>
        <h3>跨境就是给物流公司打工，选择一个好的云仓很重要</h3>
        <p>
          物流能力直接影响利润、履约时效和售后成本。首页固定展示物流选型标准，方便团队在选品、上架和订单履约时优先评估。
        </p>
        <div class="logistics-hero__actions">
          <a
            class="logistics-hero__link"
            href="https://www.kuajing84.com/index/login/register?number=MDAwMDAwMDAwMH66vWWArrmv"
            target="_blank"
            rel="noopener noreferrer"
          >
            跨境巴士
            <span>↗</span>
          </a>
        </div>
      </div>

      <div class="logistics-criteria">
        <div v-for="item in logisticsCriteria" :key="item.title" class="logistics-criteria__item">
          <span class="logistics-criteria__icon">{{ item.icon }}</span>
          <div>
            <strong>{{ item.title }}</strong>
            <p>{{ item.desc }}</p>
          </div>
        </div>
      </div>
    </section>

    <n-grid :cols="3" :x-gap="20" :y-gap="20">
      <n-gi v-for="item in stats" :key="item.label">
        <div class="summary-item">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div :style="{ width: '44px', height: '44px', borderRadius: '12px', background: item.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }">
              {{ item.icon }}
            </div>
            <div>
              <div style="font-size: 13px; color: var(--text-secondary); font-weight: 500; margin-bottom: 2px;">{{ item.label }}</div>
              <div style="font-size: 26px; font-weight: 700; color: var(--text-primary);">
                {{ item.prefix }}{{ typeof item.value === 'number' ? item.value.toLocaleString() : item.value }}
              </div>
            </div>
          </div>
        </div>
      </n-gi>
    </n-grid>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive } from "vue";
import { NGrid, NGi, NH2 } from "naive-ui";
import { apiGet } from "../api";
import { useAppStore } from "../store";

const appStore = useAppStore();
const summary = reactive(appStore.dashboard);

const stats = reactive([
  { label: "总订单", value: 0, icon: "📦", bg: "var(--accent-light)" },
  { label: "质检单", value: 0, icon: "🔍", bg: "var(--accent-light)" },
  { label: "真实订单", value: 0, icon: "✅", bg: "var(--accent-light)" },
  { label: "总 GMV", value: 0, icon: "💰", bg: "var(--accent-light)", prefix: "₽" },
  { label: "质检单 GMV", value: 0, icon: "📊", bg: "var(--accent-light)", prefix: "₽" },
  { label: "真实 GMV", value: 0, icon: "📈", bg: "var(--accent-light)", prefix: "₽" },
]);

const logisticsCriteria = [
  { title: "物流费", desc: "优先核算单件利润和阶梯费用", icon: "💸" },
  { title: "贴单费", desc: "关注云仓操作费和批量成本", icon: "🏷️" },
  { title: "物流周期", desc: "影响承诺时效、店铺评分和回款", icon: "⏱️" },
  { title: "质检单处理", desc: "能否协助处理质检单与异常件", icon: "🔍" },
  { title: "超规格订单", desc: "提前确认超长、超重、超体积方案", icon: "📐" },
];

async function loadSummary() {
  try {
    const data = await apiGet<any>("/dashboard/summary");
    Object.assign(summary, data);
    Object.assign(appStore.dashboard, data);
    stats[0].value = data.total_orders;
    stats[1].value = data.quality_check_orders;
    stats[2].value = data.real_orders;
    stats[3].value = data.total_gmv;
    stats[4].value = data.quality_check_gmv;
    stats[5].value = data.real_gmv;
  } catch (error) {
    console.error("Failed to load dashboard summary", error);
  }
}

onMounted(loadSummary);
</script>

<style scoped>
.logistics-hero {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(360px, 0.9fr);
  gap: 20px;
  margin-bottom: 24px;
  padding: 24px;
  border: 1px solid rgba(129, 140, 248, 0.28);
  border-radius: 24px;
  background:
    radial-gradient(circle at 12% 0%, rgba(250, 204, 21, 0.22), transparent 28%),
    radial-gradient(circle at 90% 20%, rgba(56, 189, 248, 0.2), transparent 32%),
    linear-gradient(135deg, #111827 0%, #172554 48%, #312e81 100%);
  box-shadow: 0 22px 55px rgba(2, 6, 23, 0.28);
  overflow: hidden;
}

.logistics-hero::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px);
  background-size: 28px 28px;
  mask-image: linear-gradient(90deg, rgba(0,0,0,0.65), transparent);
}

.logistics-hero__main {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.logistics-hero__eyebrow {
  width: fit-content;
  margin-bottom: 10px;
  padding: 5px 10px;
  border-radius: 999px;
  background: rgba(250, 204, 21, 0.16);
  color: #fde68a;
  font-size: 12px;
  font-weight: 700;
  border: 1px solid rgba(250, 204, 21, 0.28);
}

.logistics-hero h3 {
  margin: 0;
  color: #ffffff;
  font-size: 24px;
  line-height: 1.35;
  font-weight: 800;
  text-shadow: 0 2px 18px rgba(0, 0, 0, 0.28);
}

.logistics-hero p {
  margin: 10px 0 0;
  color: #cbd5e1;
  line-height: 1.7;
}

.logistics-hero__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 20px;
}

.logistics-hero__link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: 12px;
  background: linear-gradient(135deg, #f59e0b, #f97316);
  color: #111827;
  text-decoration: none;
  font-weight: 700;
  box-shadow: 0 14px 32px rgba(249, 115, 22, 0.34);
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}

.logistics-hero__link:hover {
  transform: translateY(-1px);
  box-shadow: 0 18px 38px rgba(249, 115, 22, 0.42);
}

.logistics-criteria {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.logistics-criteria__item {
  display: flex;
  gap: 10px;
  padding: 14px;
  border: 1px solid rgba(148, 163, 184, 0.26);
  border-radius: 16px;
  background: rgba(15, 23, 42, 0.72);
  backdrop-filter: blur(10px);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.logistics-criteria__item:first-child {
  grid-column: span 2;
}

.logistics-criteria__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  border-radius: 12px;
  background: rgba(129, 140, 248, 0.18);
  font-size: 17px;
}

.logistics-criteria strong {
  display: block;
  color: #f8fafc;
  font-size: 14px;
  line-height: 1.2;
}

.logistics-criteria p {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.45;
  color: #b6c2d9;
}

@media (max-width: 1100px) {
  .logistics-hero {
    grid-template-columns: 1fr;
  }

  .logistics-criteria__item:first-child {
    grid-column: auto;
  }
}

@media (max-width: 720px) {
  .logistics-hero {
    padding: 18px;
  }

  .logistics-criteria {
    grid-template-columns: 1fr;
  }
}
</style>
