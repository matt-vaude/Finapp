<script setup lang="ts">
    import { ref, onMounted } from "vue";
    import { http } from "../services/http";
    
    const month = ref(new Date().toISOString().slice(0,7));
    const tx = ref<any[]>([]);
    const categories = ref<any[]>([]);
    const msg = ref("");
    
    async function load() {
      const [t, c] = await Promise.all([
        http.get("/transactions", { params: { month: month.value } }),
        http.get("/categories")
      ]);
      tx.value = t.data.items;
      categories.value = c.data;
    }
    
    async function setCategory(txId: string, categoryId: string) {
      await http.patch(`/transactions/${txId}`, { categoryId });
      await load();
    }
    
    async function applyRules() {
      const res = await http.post(`/rules/apply?month=${month.value}`);
      msg.value = `Règles appliquées: ${res.data.updated} transactions mises à jour`;
      await load();
    }
    
    onMounted(load);
    </script>
    
    <template>
      <div style="max-width:1100px;margin:40px auto;">
        <h2>Transactions</h2>
    
        <div style="display:flex;gap:10px;align-items:center;">
          <input type="month" v-model="month" />
          <button @click="load">Charger</button>
          <button @click="applyRules">Appliquer règles</button>
          <span>{{ msg }}</span>
        </div>
    
        <table style="width:100%;margin-top:15px;border-collapse:collapse;">
          <thead>
            <tr>
              <th align="left">Date</th>
              <th align="left">Label</th>
              <th align="right">Montant</th>
              <th align="left">Catégorie</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in tx" :key="t.id" style="border-top:1px solid #ddd;">
              <td>{{ new Date(t.date).toISOString().slice(0,10) }}</td>
              <td>{{ t.label }}</td>
              <td align="right">{{ t.amount }}</td>
              <td>
                <select :value="t.categoryId || ''" @change="(e:any)=>setCategory(t.id, e.target.value)">
                  <option value="">(non catégorisé)</option>
                  <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
                </select>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
    