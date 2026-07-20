<template>
  <n-layout-sider
    bordered
    collapse-mode="width"
    :collapsed-width="64"
    :width="220"
    show-trigger="bar"
    :native-scrollbar="false"
    :style="{ background: 'var(--bg-sidebar)', '--n-border-color': 'rgba(255,255,255,0.08)' }"
  >
    <div class="sidebar-layout">
      <div class="sidebar-brand">
        <img class="brand-icon" src="/logo.png" alt="鲸智 AI" />
        <span class="brand-text">鲸智 AI</span>
      </div>
      <div class="sidebar-menu-wrap">
        <n-menu
          :options="menuOptions"
          :value="activeKey"
          @update:value="handleMenuClick"
          :indent="24"
        />
      </div>
      <div class="sidebar-footer" @click.stop>
        <div v-if="auth.user" class="user-summary">
          <div class="user-avatar">{{ (auth.user.name || auth.user.email).charAt(0).toUpperCase() }}</div>
          <div class="user-info">
            <strong>{{ auth.user.name || "鲸智用户" }}</strong>
            <span>{{ auth.user.email }}</span>
          </div>
          <button class="logout-button" title="退出登录" @click="logout">↪</button>
        </div>
        <div class="theme-toggle" @click="$emit('toggleTheme')">
          <span v-if="isDark">☀️</span>
          <span v-else>🌙</span>
          <span class="theme-label">{{ isDark ? '亮色' : '暗色' }}</span>
        </div>
      </div>
    </div>
  </n-layout-sider>
</template>

<script setup lang="ts">
import { computed, h } from "vue";
import { useRouter, useRoute } from "vue-router";
import { NMenu, NLayoutSider, type MenuOption } from "naive-ui";
import { useAuthStore } from "../store/auth";

const props = defineProps<{ isDark: boolean }>();
defineEmits<{ toggleTheme: [] }>();

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();

function renderIcon(emoji: string) {
  return () => h("span", { style: { fontSize: "18px", lineHeight: "1" } }, emoji);
}

const menuOptions: MenuOption[] = [
  { label: "仪表盘", key: "Dashboard", icon: renderIcon("📊") },
  { label: "店铺管理", key: "StoreManagement", icon: renderIcon("🏪") },
  { label: "订单管理", key: "Orders", icon: renderIcon("📦") },
  { label: "退货订单", key: "ReturnOrders", icon: renderIcon("🔄") },
  { label: "店铺流水", key: "StoreFinance", icon: renderIcon("💰") },
  { label: "商品管理", key: "ProductManagement", icon: renderIcon("📋") },
  { label: "智囊", key: "Intelligence", icon: renderIcon("🧠") },
  { type: "divider", key: "d1" },
  { label: "选品中心", key: "ProductSelection", icon: renderIcon("🔍") },
  { label: "上架管理", key: "UploadManagement", icon: renderIcon("📦") },
  { label: "物流", key: "Logistics", icon: renderIcon("🚚") },
  { type: "divider", key: "d2" },
  { label: "定时任务", key: "TaskConfig", icon: renderIcon("⚙️") },
  { label: "飞书配置", key: "FeishuConfig", icon: renderIcon("🔔") },
];

const activeKey = computed(() => route.name as string);

function handleMenuClick(key: string) {
  router.push({ name: key });
}

function logout() {
  auth.logout();
  router.replace({ name: "Login" });
}
</script>

<style scoped>
.sidebar-layout {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 20px 20px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  margin-bottom: 8px;
}

.sidebar-menu-wrap {
  flex: 1;
  overflow-y: auto;
  position: relative;
  z-index: 0;
}

.brand-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  object-fit: contain;
  flex-shrink: 0;
}

.brand-text {
  font-size: 16px;
  font-weight: 700;
  color: #ffffff;
  white-space: nowrap;
}

.sidebar-footer {
  padding: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  position: relative;
  z-index: 10;
  flex-shrink: 0;
}

.user-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 8px 12px;
  margin-bottom: 4px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  min-width: 0;
}

.user-avatar {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
}

.user-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.user-info strong,
.user-info span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-info strong { color: #fff; font-size: 12px; }
.user-info span { color: var(--text-sidebar); font-size: 10px; margin-top: 2px; }

.logout-button {
  border: 0;
  background: transparent;
  color: var(--text-sidebar);
  cursor: pointer;
  font-size: 18px;
  padding: 3px;
}

.logout-button:hover { color: #fff; }

.theme-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
  color: var(--text-sidebar);
  font-size: 13px;
}

.theme-toggle:hover {
  background: var(--bg-sidebar-hover);
  color: #fff;
}

.theme-label {
  font-weight: 500;
}
</style>
