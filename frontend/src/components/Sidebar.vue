<template>
  <aside class="sidebar">
    <h3>Ozon 跨境</h3>
    <router-link
      to="/"
      class="nav-link"
      :class="{ 'nav-link-active': route.name === 'Dashboard' }"
    >
      仪表盘
    </router-link>
    <router-link
      to="/stores"
      class="nav-link"
      :class="{ 'nav-link-active': route.name === 'StoreManagement' }"
    >
      店铺管理
    </router-link>
    <router-link
      to="/monitor"
      class="nav-link"
      :class="{ 'nav-link-active': route.name === 'StoreMonitor' }"
    >
      店铺监控
    </router-link>
    <router-link
      to="/orders"
      class="nav-link"
      :class="{ 'nav-link-active': route.name === 'Orders' }"
    >
      订单管理
    </router-link>
    <router-link
      to="/listings"
      class="nav-link"
      :class="{ 'nav-link-active': route.name === 'Listing' }"
    >
      精铺刊登
    </router-link>
  </aside>
</template>

<script setup lang="ts">
import { useRoute } from "vue-router";
const route = useRoute();
</script>
