<script setup lang="ts">
  import { computed, ref } from "vue";
  
  import WaterfallIncomeSavings from "../components/charts/WaterfallIncomeSavings.vue";
  import StackedByMonth from "../components/charts/StackedByMonth.vue";
  import CumulativeVsBudget from "../components/charts/CumulativeVsBudget.vue";
  import BudgetVsActualBullet from "../components/charts/BudgetVsActualBullet.vue";
  import MerchantsPareto from "../components/charts/MerchantsPareto.vue";
  
  const month = ref(new Date().toISOString().slice(0, 7));
  const endMonth = computed(() => month.value);
  </script>
  
  <template>
    <div class="space-y-6">
      <div class="flex flex-wrap items-center gap-3">
        <input type="month" v-model="month" class="input" />
        <div class="text-sm text-muted">
          Analyse visuelle : budget, dérives, marchands, trajectoire.
        </div>
      </div>
  
      <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <section class="card">
          <div class="title">Waterfall — Revenu → Épargne</div>
          <div class="sub">Comprendre où part le revenu (top postes)</div>
          <div class="chart h-[420px]">
            <WaterfallIncomeSavings :month="month" />
          </div>
        </section>
  
        <section class="card">
          <div class="title">Cumul du mois — Réel vs Budget</div>
          <div class="sub">Voir si tu consommes plus vite que ton budget</div>
          <div class="chart h-[420px]">
            <CumulativeVsBudget :month="month" />
          </div>
        </section>
  
        <section class="card xl:col-span-2">
          <div class="title">Barres empilées — dépenses par mois (catégories)</div>
          <div class="sub">Tendance sur 12 mois, détection des dérives</div>
          <div class="chart h-[520px]">
            <StackedByMonth :endMonth="endMonth" :months="12" />
          </div>
        </section>
  
        <section class="card xl:col-span-2">
          <div class="title">Bullet — Budget vs Réel (catégories)</div>
          <div class="sub">Dépassements en haut (top 20)</div>
          <div class="chart h-[640px]">
            <BudgetVsActualBullet :month="month" />
          </div>
        </section>
  
        <section class="card xl:col-span-2">
          <div class="title">Top marchands — Pareto (80/20)</div>
          <div class="sub">Les marchands qui expliquent la majorité des dépenses</div>
          <div class="chart h-[520px]">
            <MerchantsPareto :month="month" :limit="15" />
          </div>
        </section>
      </div>
    </div>
  </template>
  
  <style scoped>
  .card { @apply rounded-2xl bg-card border border-border/60 p-6; }
  .title { @apply text-lg font-semibold; }
  .sub { @apply text-sm text-muted mt-1; }
  .chart { @apply mt-4 rounded-2xl border border-border/60 bg-card2 overflow-hidden; }
  .input { @apply bg-card border border-border/60 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/30; }
  </style>
  