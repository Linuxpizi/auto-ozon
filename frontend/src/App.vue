<template>
  <div class="dashboard-layout">
    <Sidebar />
    <main class="main-content">
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import Sidebar from "./components/Sidebar.vue";
</script>
