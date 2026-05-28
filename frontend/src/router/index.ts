import { createRouter, createWebHistory } from "vue-router";
import DashboardView from "../views/DashboardView.vue";
import StoreManagementView from "../views/StoreManagementView.vue";
import OrdersView from "../views/OrdersView.vue";
import NotFoundView from "../views/NotFoundView.vue";

const routes = [
  { path: "/", name: "Dashboard", component: DashboardView },
  { path: "/stores", name: "StoreManagement", component: StoreManagementView },
  { path: "/orders", name: "Orders", component: OrdersView },
  { path: "/:pathMatch(.*)*", name: "NotFound", component: NotFoundView },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
