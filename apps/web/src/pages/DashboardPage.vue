<script setup lang="ts">
    import { ref, onMounted, computed, watch } from "vue";
    import { http } from "../services/http";
    import CashflowSankey from "../pages/CashflowSankey.vue";
    
    const month = ref(new Date().toISOString().slice(0, 7));
    const dash = ref<any>(null);
    
    const sankeyMode = ref<"real" | "budget">("real");
    const incomeMode = ref<"detail" | "simple">("detail");
    
    const listMode = ref<"category" | "label">("category");
    
    // UI
    const density = ref<"compact" | "comfort">("comfort");
    
    const tx = ref<any[]>([]);
    const catMap = ref<Record<string, string>>({});
    
    const loading = ref(false);
    const errorMsg = ref<string | null>(null);
    
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
      loading.value = true;
      errorMsg.value = null;
      try {
        await loadCategoriesOnce();
    
        const [d, t] = await Promise.all([
          http.get("/dashboard", { params: { month: month.value } }),
          http.get("/transactions", { params: { month: month.value } }),
        ]);
    
        dash.value = d.data;
        tx.value = t.data?.items ?? [];
      } catch (e: any) {
        errorMsg.value = e?.response?.data?.message ?? e?.message ?? "Erreur lors du chargement.";
      } finally {
        loading.value = false;
      }
    }
    
    onMounted(load);
    watch(month, () => load());
    
    // --- Aggregations ---
    function keyForItem(it: any) {
      if (listMode.value === "label") {
        return (it.label ?? "Sans libellé").toString().trim() || "Sans libellé";
      }
      return it.categoryId ? catMap.value[it.categoryId] ?? "Non catégorisé" : "Non catégorisé";
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
        .slice(0, 50);
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
        .slice(0, 50);
    });
    
    const incomeTotal = computed(() => Number(dash.value?.income ?? 0));
    const expenseTotal = computed(() => Number(dash.value?.expense ?? 0));
    const net = computed(() => Number(dash.value?.net ?? 0));
    const netLabel = computed(() => (net.value >= 0 ? "Reste (épargne)" : "Déficit"));
    
    function pct(part: number, total: number) {
      if (!total || total <= 0) return 0;
      return Math.round((part / total) * 1000) / 10; // 1 décimale
    }
    </script>
    
    <template>
      <div class="space-y-6">
        <!-- Controls -->
        <div class="flex flex-wrap items-center gap-3">
          <div class="flex items-center gap-3">
            <input type="month" v-model="month" class="input" />
            <span v-if="loading" class="text-sm text-muted">Chargement…</span>
            <span v-else class="text-sm text-muted">Auto</span>
          </div>
    
          <div class="ml-auto flex flex-wrap gap-2 items-center">
            <button class="chip" :class="{ 'chip-active': sankeyMode === 'real' }" @click="sankeyMode = 'real'">Réel</button>
            <button class="chip" :class="{ 'chip-active': sankeyMode === 'budget' }" @click="sankeyMode = 'budget'">Budget</button>
    
            <div class="w-px h-5 bg-border/60 mx-2 hidden sm:block"></div>
    
            <button class="chip" :class="{ 'chip-active': incomeMode === 'detail' }" @click="incomeMode = 'detail'">Revenus détaillés</button>
            <button class="chip" :class="{ 'chip-active': incomeMode === 'simple' }" @click="incomeMode = 'simple'">Revenus simples</button>
          </div>
        </div>
    
        <!-- Error -->
        <div v-if="errorMsg" class="rounded-2xl border border-border/60 bg-card p-4">
          <div class="text-sm font-semibold">Erreur</div>
          <div class="text-sm text-muted mt-1">{{ errorMsg }}</div>
          <button class="btn mt-3" @click="load">Recharger</button>
        </div>
    
        <!-- KPI -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="card kpi-card">
            <div class="kpi-top">
              <div class="label">Recettes</div>
              <span class="pill pill-in">IN</span>
            </div>
            <div class="kpi">{{ eur(incomeTotal) }}</div>
            <div class="sub">Total des entrées du mois</div>
          </div>
    
          <div class="card kpi-card">
            <div class="kpi-top">
              <div class="label">Dépenses</div>
              <span class="pill pill-out">OUT</span>
            </div>
            <div class="kpi">{{ eur(expenseTotal) }}</div>
            <div class="sub">Total des sorties du mois</div>
          </div>
    
          <div class="card kpi-card">
            <div class="kpi-top">
              <div class="label">{{ netLabel }}</div>
              <span class="pill" :class="net >= 0 ? 'pill-ok' : 'pill-bad'">{{ net >= 0 ? "OK" : "ALERTE" }}</span>
            </div>
            <div class="kpi" :class="net >= 0 ? 'kpi-ok' : 'kpi-bad'">{{ eur(net) }}</div>
            <div class="sub">Recettes − Dépenses</div>
          </div>
        </div>
    
        <!-- Main -->
        <div class="grid grid-cols-1 xl:grid-cols-4 gap-4">
          <!-- Sankey -->
          <section class="card xl:col-span-3">
            <div class="flex items-start justify-between">
              <div>
                <div class="text-lg font-semibold">Cashflow</div>
                <div class="text-sm text-muted">Vue mensuelle (Sankey)</div>
              </div>
              <div class="text-sm text-muted">{{ month }}</div>
            </div>
    
            <div class="mt-4 h-[820px] rounded-2xl border border-border/60 bg-card2 overflow-hidden">
              <CashflowSankey :month="month" :mode="sankeyMode" :income="incomeMode" />
            </div>
    
            <div class="mt-4 text-sm text-muted">
              Épargne estimée :
              <span class="text-text font-semibold">{{ eur(dash?.saved_estimate ?? 0) }}</span>
            </div>
          </section>
    
          <!-- Flux du mois -->
          <aside class="card">
            <div class="flex items-start justify-between gap-3">
              <div>
                <div class="text-lg font-semibold">Flux du mois</div>
                <div class="text-sm text-muted">Lisible + barres</div>
              </div>
    
              <div class="flex flex-wrap gap-2 justify-end">
                <button class="chip" :class="{ 'chip-active': listMode === 'category' }" @click="listMode = 'category'">Catégories</button>
                <button class="chip" :class="{ 'chip-active': listMode === 'label' }" @click="listMode = 'label'">Libellés</button>
                <button class="chip" :class="{ 'chip-active': density === 'comfort' }" @click="density = 'comfort'">Confort</button>
                <button class="chip" :class="{ 'chip-active': density === 'compact' }" @click="density = 'compact'">Compact</button>
              </div>
            </div>
    
            <!-- ✅ layout vertical (plus lisible) -->
            <div class="mt-4 space-y-3">
              <!-- Recettes -->
              <div class="panel">
                <div class="panel-head sticky">
                  <div class="flex items-center justify-between w-full">
                    <div class="text-sm font-semibold">Recettes</div>
                    <div class="panel-total in">{{ eur(incomeTotal) }}</div>
                  </div>
                </div>
    
                <div class="list" :class="density === 'compact' ? 'list-compact' : 'list-comfort'">
                  <div v-for="r in incomeList" :key="r.name" class="row" :title="r.name">
                    <div class="row-top">
                      <span class="row-name">{{ r.name }}</span>
                      <span class="row-amt in">+ {{ eur(r.amount) }}</span>
                    </div>
                    <div class="row-bottom">
                      <div class="bar">
                        <div class="bar-fill in" :style="{ width: pct(r.amount, incomeTotal) + '%' }"></div>
                      </div>
                      <span class="row-pct">{{ pct(r.amount, incomeTotal) }}%</span>
                    </div>
                  </div>
                  <div v-if="incomeList.length === 0" class="text-sm text-muted p-2">Aucune recette.</div>
                </div>
              </div>
    
              <!-- Dépenses -->
              <div class="panel">
                <div class="panel-head sticky">
                  <div class="flex items-center justify-between w-full">
                    <div class="text-sm font-semibold">Dépenses</div>
                    <div class="panel-total out">{{ eur(expenseTotal) }}</div>
                  </div>
                </div>
    
                <div class="list" :class="density === 'compact' ? 'list-compact' : 'list-comfort'">
                  <div v-for="r in expenseList" :key="r.name" class="row" :title="r.name">
                    <div class="row-top">
                      <span class="row-name">{{ r.name }}</span>
                      <span class="row-amt out">- {{ eur(r.amount) }}</span>
                    </div>
                    <div class="row-bottom">
                      <div class="bar">
                        <div class="bar-fill out" :style="{ width: pct(r.amount, expenseTotal) + '%' }"></div>
                      </div>
                      <span class="row-pct">{{ pct(r.amount, expenseTotal) }}%</span>
                    </div>
                  </div>
                  <div v-if="expenseList.length === 0" class="text-sm text-muted p-2">Aucune dépense.</div>
                </div>
              </div>
            </div>
    
            <div class="mt-4 border-t border-border/60 pt-4">
              <div class="text-sm text-muted">Dépenses par catégorie (API)</div>
              <div class="mt-2 space-y-2 max-h-56 overflow-auto pr-1">
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
    .input { @apply bg-card border border-border/60 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/30; }
    .btn { @apply bg-accent text-black px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition; }
    .chip { @apply px-3 py-1.5 rounded-full text-xs border border-border/60 text-muted hover:text-text hover:bg-card2 transition; }
    .chip-active { @apply border-accent/70 text-text; box-shadow: 0 0 0 1px rgba(214,162,91,.25) inset; }
    
    .label { @apply text-sm text-muted; }
    .kpi { @apply text-4xl font-semibold mt-1; }
    .sub { @apply text-sm text-muted mt-2; }
    .kpi-top { @apply flex items-center justify-between; }
    
    .pill { @apply text-[11px] px-2 py-1 rounded-full border border-border/60 bg-card2 text-muted; }
    .pill-in { border-color: rgba(34,197,94,.35); }
    .pill-out { border-color: rgba(239,68,68,.35); }
    .pill-ok { border-color: rgba(34,197,94,.45); color: rgba(225,255,235,.95); }
    .pill-bad { border-color: rgba(239,68,68,.45); color: rgba(255,225,225,.95); }
    .kpi-ok { text-shadow: 0 0 20px rgba(34,197,94,.12); }
    .kpi-bad { text-shadow: 0 0 20px rgba(239,68,68,.12); }
    
    /* ✅ Flux panels */
    .panel { @apply rounded-2xl border border-border/60 bg-card2 overflow-hidden; }
    .panel-head { @apply px-3 py-3 border-b border-border/60 bg-card2; }
    .panel-head.sticky { position: sticky; top: 0; z-index: 5; }
    
    .panel-total { @apply text-sm font-semibold; }
    .panel-total.in { color: rgba(34,197,94,.95); }
    .panel-total.out { color: rgba(239,68,68,.95); }
    
    .list { @apply overflow-auto; max-height: 340px; }
    .list-comfort .row { @apply px-3 py-2; }
    .list-compact .row { @apply px-3 py-1.5; }
    
    .row { @apply border-b border-border/40 hover:bg-card/60 transition; }
    .row-top { @apply flex items-start justify-between gap-2; }
    .row-name {
      @apply text-sm text-text/90 leading-snug;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      max-width: 100%;
    }
    .row-amt { @apply text-sm font-semibold whitespace-nowrap; }
    .row-amt.in { color: rgba(34,197,94,.95); }
    .row-amt.out { color: rgba(239,68,68,.95); }
    
    .row-bottom { @apply flex items-center gap-2 mt-1; }
    .row-pct { @apply text-[11px] text-muted w-10 text-right; }
    
    .bar { @apply h-2 rounded-full bg-bg/50 flex-1 overflow-hidden; }
    .bar-fill { @apply h-full rounded-full; }
    .bar-fill.in { background: rgba(34,197,94,.85); }
    .bar-fill.out { background: rgba(239,68,68,.85); }
    </style>
    