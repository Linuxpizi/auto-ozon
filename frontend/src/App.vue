<template>
  <n-config-provider :theme="isDark ? darkTheme : undefined" :theme-overrides="themeOverrides">
    <n-message-provider>
      <n-dialog-provider>
        <n-notification-provider>
          <n-layout has-sider style="min-height: 100vh;">
            <n-config-provider :theme-overrides="sidebarThemeOverrides">
              <Sidebar :is-dark="isDark" @toggle-theme="isDark = !isDark" />
            </n-config-provider>
            <n-layout-content style="padding: 0;">
              <main class="main-content">
                <router-view />
              </main>
            </n-layout-content>
          </n-layout>
        </n-notification-provider>
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import {
  NConfigProvider,
  NMessageProvider,
  NDialogProvider,
  NNotificationProvider,
  NLayout,
  NLayoutContent,
  darkTheme,
  type GlobalThemeOverrides,
} from "naive-ui";
import Sidebar from "./components/Sidebar.vue";

const isDark = ref(localStorage.getItem("theme") === "dark");

function applyTheme(dark: boolean) {
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "");
  localStorage.setItem("theme", dark ? "dark" : "light");
}

applyTheme(isDark.value);
watch(isDark, (v) => applyTheme(v));

const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: "#4f46e5",
    primaryColorHover: "#6366f1",
    primaryColorPressed: "#4338ca",
    borderRadius: "8px",
    borderRadiusSmall: "6px",
  },
};

// Sidebar wrapper uses light theme so NMenu text stays visible even when app is dark
const sidebarThemeOverrides: GlobalThemeOverrides = {
  common: {
    borderRadius: "8px",
  },
  Menu: {
    color: "var(--bg-sidebar)",
    itemTextColor: "var(--text-sidebar)",
    itemTextColorHover: "#ffffff",
    itemTextColorActive: "#ffffff",
    itemIconColor: "var(--text-sidebar)",
    itemIconColorHover: "#ffffff",
    itemIconColorActive: "#ffffff",
    itemColorActive: "var(--bg-sidebar-active)",
    itemColorHover: "var(--bg-sidebar-hover)",
    itemColorActiveHover: "var(--bg-sidebar-active)",
    arrowColor: "var(--text-sidebar)",
  },
  Layout: {
    color: "var(--bg-sidebar)",
    siderColor: "var(--bg-sidebar)",
    siderBorder: "none",
  },
};
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  background: var(--bg-page);
  color: var(--text-primary);
  -webkit-font-smoothing: antialiased;
}

.main-content {
  padding: 28px 36px;
  min-height: 100vh;
  overflow-x: auto;
}
</style>
