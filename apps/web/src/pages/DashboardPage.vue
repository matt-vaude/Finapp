<script setup lang="ts">
    import { ref, onMounted, computed } from "vue";
    import { http } from "../services/http";
    import CashflowSankey from "../pages/CashflowSankey.vue";
    
    const month = ref(new Date().toISOString().slice(0, 7));
    const dash = ref<any>(null);
    
    const sankeyMode = ref<"real" | "budget">("real");
    const incomeMode = ref<"detail" | "simple">("detail");
    
    // ✅ nouveau : toggle liste
    const listMode = ref<"category" | "label">("category");
    
    // data local transactions/categories
    const tx = ref<any[]>([]);
    const catMap = ref<Record<string, string>>({});
    
    function eur(n: number) {
      return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n ?? 0);
    }
    
    async function loadCategoriesOnce() {
      if (Object.keys(catMap.value).length) return;
      const res = await http.get("/categories");
      const m: Record<string, string> = {};
      for (const c of res.data ?? []) m[c.id] = c.name;
      catMap.value = m;
    }
    
    async function load() {
      await loadCategoriesOnce();
    
      const [d, t] = await Promise.all([
        http.get("/dashboard", { params: { month: month.value } }),
        http.get("/transactions", { params: { month: month.value } }),
      ]);
    
      dash.value = d.data;
      tx.value = t.data?.items ?? [];
    }
    
    onMounted(load);
    
    // --- Aggregations for side lists ---
    function keyForItem(it: any) {
      if (listMode.value === "label") {
        return (it.label ?? "Sans libellé").toString().trim() || "Sans libellé";
      }
      // category
      return it.categoryId ? (catMap.value[it.categoryId] ?? "Non catégorisé") : "Non catégorisé";
    }
    
    const incomeList = computed(() => {
      const agg = new Map<string, number>();
      for (const it of tx.value) {
        const a = Number(it.amount);
        if (!(a > 0)) continue;
        const k = keyForItem(it);
        agg.set(k, (agg.get(k) ?? 0) + a);
      }
      return [...agg.entries()]
        .map(([name, amount]) => ({ name, amount }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 30);
    });
    
    const expenseList = computed(() => {
      const agg = new Map<string, number>();
      for (const it of tx.value) {
        const a = Number(it.amount);
        if (!(a < 0)) continue;
        const k = keyForItem(it);
        const v = Math.abs(a);
        agg.set(k, (agg.get(k) ?? 0) + v);
      }
      return [...agg.entries()]
        .map(([name, amount]) => ({ name, amount }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 30);
    });
    </script>
    
    <template>
      <div class="space-y-6">
        <!-- Controls -->
        <div class="flex flex-wrap items-center gap-3">
          <input type="month" v-model="month" class="input" />
          <button class="btn" @click="load">Charger</button>
    
          <div class="ml-auto flex flex-wrap gap-2 items-center">
            <button class="chip" :class="{ 'chip-active': sankeyMode === 'real' }" @click="sankeyMode = 'real'">Réel</button>
            <button class="chip" :class="{ 'chip-active': sankeyMode === 'budget' }" @click="sankeyMode = 'budget'">Budget</button>
    
            <div class="w-px h-5 bg-border/60 mx-2 hidden sm:block"></div>
    
            <button class="chip" :class="{ 'chip-active': incomeMode === 'detail' }" @click="incomeMode = 'detail'">Revenus détaillés</button>
            <button class="chip" :class="{ 'chip-active': incomeMode === 'simple' }" @click="incomeMode = 'simple'">Revenus simples</button>
          </div>
        </div>
    
        <!-- KPI -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="card">
            <div class="label">Money in</div>
            <div class="kpi">{{ eur(dash?.income) }}</div>
          </div>
          <div class="card">
            <div class="label">Money out</div>
            <div class="kpi">{{ eur(dash?.expense) }}</div>
          </div>
          <div class="card">
            <div class="label">Money left</div>
            <div class="kpi">{{ eur(dash?.net) }}</div>
          </div>
        </div>
    
        <!-- Main grid -->
        <div class="grid grid-cols-1 xl:grid-cols-4 gap-4">
          <!-- Cashflow -->
          <section class="card xl:col-span-3">
            <div class="flex items-start justify-between">
              <div>
                <div class="text-lg font-semibold">Cashflow</div>
                <div class="text-sm text-muted">Vue mensuelle (Sankey)</div>
              </div>
              <div class="text-sm text-muted">{{ month }}</div>
            </div>
    
            <div class="mt-4 h-[780px] rounded-2xl border border-border/60 bg-card2 overflow-hidden">
              <CashflowSankey :month="month" :mode="sankeyMode" :income="incomeMode" />
            </div>
    
            <div class="mt-4 text-sm text-muted">
              Épargne estimée :
              <span class="text-text font-semibold">{{ eur(dash?.saved_estimate) }}</span>
            </div>
          </section>
    
          <!-- ✅ Flux du mois -->
          <aside class="card">
            <div class="flex items-start justify-between">
              <div>
                <div class="text-lg font-semibold">Flux du mois</div>
                <div class="text-sm text-muted">Recettes & dépenses</div>
              </div>
              <div class="flex gap-2">
                <button class="chip" :class="{ 'chip-active': listMode==='category' }" @click="listMode='category'">Catégories</button>
                <button class="chip" :class="{ 'chip-active': listMode==='label' }" @click="listMode='label'">Libellés</button>
              </div>
            </div>
    
            <div class="mt-4 grid grid-cols-2 gap-3">
              <!-- Income -->
              <div class="rounded-2xl border border-border/60 bg-card2 p-3">
                <div class="text-sm font-semibold">Recettes</div>
                <div class="mt-2 space-y-2 max-h-[640px] overflow-auto pr-1">
                  <div v-for="r in incomeList" :key="r.name" class="flex items-start justify-between gap-2 text-sm">
                    <span class="text-muted leading-snug">{{ r.name }}</span>
                    <span class="text-text whitespace-nowrap">{{ eur(r.amount) }}</span>
                  </div>
                  <div v-if="incomeList.length===0" class="text-sm text-muted">Aucune recette.</div>
                </div>
              </div>
    
              <!-- Expenses -->
              <div class="rounded-2xl border border-border/60 bg-card2 p-3">
                <div class="text-sm font-semibold">Dépenses</div>
                <div class="mt-2 space-y-2 max-h-[640px] overflow-auto pr-1">
                  <div v-for="r in expenseList" :key="r.name" class="flex items-start justify-between gap-2 text-sm">
                    <span class="text-muted leading-snug">{{ r.name }}</span>
                    <span class="text-text whitespace-nowrap">{{ eur(r.amount) }}</span>
                  </div>
                  <div v-if="expenseList.length===0" class="text-sm text-muted">Aucune dépense.</div>
                </div>
              </div>
            </div>
    
            <div class="mt-4 border-t border-border/60 pt-4">
              <div class="text-sm text-muted">Dépenses par catégorie (API)</div>
              <div class="mt-2 space-y-2 max-h-48 overflow-auto pr-1">
                <div v-for="(v, k) in (dash?.byCategory ?? {})" :key="k" class="flex items-center justify-between text-sm">
                  <span class="text-muted">{{ k }}</span>
                  <span class="text-text">{{ eur(v) }}</span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </template>
    
    <style scoped>
    .card { @apply rounded-2xl bg-card border border-border/60 p-6; }
    .label { @apply text-sm text-muted; }
    .kpi { @apply text-4xl font-semibold mt-1; }
    .input { @apply bg-card border border-border/60 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/30; }
    .btn { @apply bg-accent text-black px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition; }
    .chip { @apply px-3 py-1.5 rounded-full text-xs border border-border/60 text-muted hover:text-text hover:bg-card2 transition; }
    .chip-active { @apply border-accent/70 text-text; box-shadow: 0 0 0 1px rgba(214, 162, 91, 0.25) inset; }
    </style>
    