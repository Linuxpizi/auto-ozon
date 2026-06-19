<template>
  <aside class="sidebar">
    <div class="sidebar-logo">Ozon 跨境</div>
    <n-menu :options="menuOptions" :value="activeKey" @update:value="handleMenuClick" :indent="24" />
  </aside>
</template>

<script setup lang="ts">
import { computed, h } from "vue";
import { useRouter, useRoute } from "vue-router";
import { NMenu, type MenuOption } from "naive-ui";

const router = useRouter();
const route = useRoute();

function renderIcon(emoji: string) {
  return () => h("span", { style: { fontSize: "18px" } }, emoji);
}

const menuOptions: MenuOption[] = [
  { label: "仪表盘", key: "Dashboard", icon: renderIcon("📊") },
  { label: "店铺管理", key: "StoreManagement", icon: renderIcon("🏪") },
  { label: "订单管理", key: "Orders", icon: renderIcon("📦") },
  { label: "店铺流水", key: "StoreFinance", icon: renderIcon("💰") },
  { type: "divider", key: "d1" },
  { label: "定时任务", key: "TaskConfig", icon: renderIcon("⚙️") },
];

const activeKey = computed(() => route.name as string);

function handleMenuClick(key: string) {
  const routeMap: Record<string, string> = {
    Dashboard: "/",
    StoreManagement: "/stores",
    Orders: "/orders",
    StoreFinance: "/finances",
    TaskConfig: "/task-configs",
  };
  if (routeMap[key]) router.push(routeMap[key]);
}
</script>

<style scoped>
.sidebar {
  width: 220px;
  min-height: 100vh;
  background: #ffffff;
  border-right: 1px solid #f1f5f9;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.sidebar-logo {
  font-size: 20px;
  font-weight: 700;
  color: #1e293b;
  padding: 24px 20px 16px;
  letter-spacing: 0.5px;
}
</style>
