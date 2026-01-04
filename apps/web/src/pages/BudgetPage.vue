<script setup lang="ts">
    import { ref, onMounted } from "vue";
    import { http } from "../services/http";
    
    const month = ref(new Date().toISOString().slice(0, 7));
    const categories = ref<any[]>([]);
    const budgets = ref<any[]>([]);
    const categoryId = ref("");
    const limit = ref<number>(300);
    const info = ref("");
    
    async function load() {
      const [c, b] = await Promise.all([
        http.get("/categories"),
        http.get("/budgets", { params: { month: month.value } }),
      ]);
      categories.value = c.data;
      budgets.value = b.data.items;
    }
    
    async function saveBudget() {
      if (!categoryId.value) return;
      await http.post("/budgets", { month: month.value, categoryId: categoryId.value, limit: limit.value });
      info.value = "Budget enregistré ✅";
      categoryId.value = "";
      await load();
    }
    
    async function remove(id: string) {
      await http.delete(`/budgets/${id}`);
      await load();
    }
    
    function eur(n: number) {
      return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n ?? 0);
    }
    function pct(spent: number, lim: number) {
      if (!lim) return 0;
      return Math.min(100, Math.round((spent / lim) * 100));
    }
    
    onMounted(load);
    </script>
    
    <template>
      <div class="space-y-6">
        <div class="flex items-center gap-3">
          <input type="month" v-model="month" class="input" />
          <button class="btn" @click="load">Charger</button>
          <div class="text-sm text-muted">{{ info }}</div>
        </div>
    
        <div class="card">
          <div class="text-lg font-semibold">Ajouter une enveloppe</div>
          <div class="text-sm text-muted mt-1">Définis une limite mensuelle par catégorie.</div>
    
          <div class="mt-4 flex flex-col md:flex-row gap-3 md:items-center">
            <select v-model="categoryId" class="input flex-1">
              <option value="">Choisir une catégorie</option>
              <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
    
            <input type="number" v-model.number="limit" class="input w-40" />
            <button class="btn" @click="saveBudget">Enregistrer</button>
          </div>
        </div>
    
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div v-for="b in budgets" :key="b.id" class="card">
            <div class="flex items-start justify-between">
              <div>
                <div class="text-base font-semibold">{{ b.categoryName }}</div>
                <div class="text-sm text-muted">Limite : {{ eur(b.limit) }}</div>
              </div>
              <button class="chip" @click="remove(b.id)">Supprimer</button>
            </div>
    
            <div class="mt-4 flex items-end justify-between">
              <div>
                <div class="text-sm text-muted">Dépensé</div>
                <div class="text-2xl font-semibold">{{ eur(b.spent) }}</div>
              </div>
              <div class="text-sm text-muted">{{ pct(b.spent, b.limit) }}%</div>
            </div>
    
            <div class="mt-3 h-2 rounded-full bg-card2 border border-border/60 overflow-hidden">
              <div
                class="h-2"
                :style="{
                  width: pct(b.spent, b.limit) + '%',
                  background: 'linear-gradient(90deg, rgba(214,162,91,.9), rgba(214,162,91,.35))'
                }"
              />
            </div>
          </div>
        </div>
      </div>
    </template>
    
    <style scoped>
    .card { @apply rounded-2xl bg-card border border-border/60 p-5; }
    .input { @apply bg-card border border-border/60 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/30; }
    .btn { @apply bg-accent text-black px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition; }
    .chip { @apply px-3 py-1.5 rounded-full text-xs border border-border/60 text-muted hover:text-text hover:bg-card2 transition; }
    </style>
    