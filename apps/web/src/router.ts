import { createRouter, createWebHistory } from "vue-router";
import LoginPage from "./pages/LoginPage.vue";
import DashboardPage from "./pages/DashboardPage.vue";
import ImportPage from "./pages/ImportPage.vue";
import BudgetPage from "./pages/BudgetPage.vue";
import AnalysisPage from "./pages/AnalysisPage.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/login", component: LoginPage },
    { path: "/dashboard", component: DashboardPage },
    { path: "/transactions", component: AnalysisPage }, // <-- ici
    { path: "/budget", component: BudgetPage },
    { path: "/import", component: ImportPage },
    { path: "/", redirect: "/dashboard" },
  ],
});
