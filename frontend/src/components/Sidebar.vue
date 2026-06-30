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
        <div class="brand-icon">O</div>
        <span class="brand-text">Ozon 跨境</span>
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

const props = defineProps<{ isDark: boolean }>();
defineEmits<{ toggleTheme: [] }>();

const router = useRouter();
const route = useRoute();

function renderIcon(emoji: string) {
  return () => h("span", { style: { fontSize: "18px", lineHeight: "1" } }, emoji);
}

const menuOptions: MenuOption[] = [
  { label: "仪表盘", key: "Dashboard", icon: renderIcon("📊") },
  { label: "店铺管理", key: "StoreManagement", icon: renderIcon("🏪") },
  { label: "订单管理", key: "Orders", icon: renderIcon("📦") },
  { label: "店铺流水", key: "StoreFinance", icon: renderIcon("💰") },
  { label: "商品管理", key: "ProductManagement", icon: renderIcon("📋") },
  { label: "智囊", key: "Intelligence", icon: renderIcon("🧠") },
  { type: "divider", key: "d1" },
  { label: "选品中心", key: "ProductSelection", icon: renderIcon("🔍") },
  { label: "优图 Prompt 引擎", key: "PromptEngine", icon: renderIcon("🤖") },
  { type: "divider", key: "d2" },
  { label: "定时任务", key: "TaskConfig", icon: renderIcon("⚙️") },
];

const activeKey = computed(() => route.name as string);

function handleMenuClick(key: string) {
  router.push({ name: key });
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
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 18px;
  color: #fff;
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
