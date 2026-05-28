import { defineStore } from "pinia";
import { ref } from "vue";

export const useAppStore = defineStore("app", () => {
  const stores = ref([] as Array<Record<string, unknown>>);
  const orders = ref([] as Array<Record<string, unknown>>);
  const dashboard = ref({
    total_orders: 0,
    quality_check_orders: 0,
    real_orders: 0,
    total_gmv: 0,
    quality_check_gmv: 0,
    real_gmv: 0,
  });

  return {
    stores,
    orders,
    dashboard,
  };
});
