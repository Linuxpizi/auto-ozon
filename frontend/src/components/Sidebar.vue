<template>
  <aside class="sidebar">
    <h3 class="sidebar-title">Ozon 跨境</h3>
    <nav class="sidebar-nav">
      <router-link
        to="/"
        class="nav-link"
        :class="{ 'nav-link-active': route.name === 'Dashboard' }"
      >
        <span class="nav-icon">📊</span>
        仪表盘
      </router-link>
      <router-link
        to="/stores"
        class="nav-link"
        :class="{ 'nav-link-active': route.name === 'StoreManagement' }"
      >
        <span class="nav-icon">🏪</span>
        店铺管理
      </router-link>
      <router-link
        to="/orders"
        class="nav-link"
        :class="{ 'nav-link-active': route.name === 'Orders' }"
      >
        <span class="nav-icon">📦</span>
        订单管理
      </router-link>
      <router-link
        to="/finances"
        class="nav-link"
        :class="{ 'nav-link-active': route.name === 'StoreFinance' }"
      >
        <span class="nav-icon">💰</span>
        店铺流水
      </router-link>
    </nav>
    <div class="sidebar-divider"></div>
    <nav class="sidebar-nav sidebar-bottom">
      <router-link
        to="/task-configs"
        class="nav-link"
        :class="{ 'nav-link-active': route.name === 'TaskConfig' }"
      >
        <span class="nav-icon">⚙️</span>
        定时任务
      </router-link>
    </nav>
  </aside>
</template>

<script setup lang="ts">
import { useRoute } from "vue-router";
const route = useRoute();
</script>

<style scoped>
.sidebar {
  width: 240px;
  min-height: 100vh;
  background: #ffffff;
  border-right: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  padding: 0;
  flex-shrink: 0;
}
.sidebar-title {
  font-size: 20px;
  font-weight: 700;
  color: #1e293b;
  padding: 24px 20px 20px;
  margin: 0;
  letter-spacing: 0.5px;
}
.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0 12px;
}
.sidebar-bottom {
  padding-bottom: 24px;
}
.sidebar-divider {
  height: 1px;
  background: #e2e8f0;
  margin: 8px 12px;
}
.nav-link {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 10px;
  color: #475569;
  font-size: 15px;
  font-weight: 500;
  text-decoration: none;
  transition: all 0.15s ease;
}
.nav-link:hover {
  background: #f1f5f9;
  color: #1e293b;
}
.nav-link-active {
  background: #eff6ff;
  color: #2563eb;
  font-weight: 600;
}
.nav-icon {
  font-size: 18px;
  line-height: 1;
}
</style>
