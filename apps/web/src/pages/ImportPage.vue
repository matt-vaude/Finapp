<script setup lang="ts">
    import { ref } from "vue";
    import { http } from "../services/http";
    
    const file = ref<File | null>(null);
    const status = ref("");
    const details = ref<any>(null);
    const uploading = ref(false);
    
    async function upload() {
      if (!file.value) {
        status.value = "Choisis un fichier CSV d’abord.";
        return;
      }
    
      uploading.value = true;
      status.value = "Import en cours…";
      details.value = null;
    
      try {
        const form = new FormData();
        form.append("file", file.value);
    
        const res = await http.post("/imports/csv", form, {
          headers: { "Content-Type": "multipart/form-data" },
        });
    
        details.value = res.data;
    
        status.value =
          `Import OK — imported=${res.data.imported}, updated=${res.data.updated}, ` +
          `skipped=${res.data.skipped}, total=${res.data.totalRows ?? "?"}`;
      } catch (e: any) {
        const msg =
          e?.response?.data?.message ??
          e?.response?.data?.error ??
          e?.message ??
          "Erreur inconnue";
        status.value = `Erreur import: ${msg}`;
      } finally {
        uploading.value = false;
      }
    }
    
    function onFileChange(e: Event) {
      const input = e.target as HTMLInputElement;
      file.value = input.files?.[0] ?? null;
      status.value = "";
      details.value = null;
    }
    </script>
    
    <template>
      <div class="space-y-6">
        <div class="card">
          <div class="text-lg font-semibold">Import CSV</div>
          <div class="text-sm text-muted mt-1">
            Sélectionne un export bancaire (.csv). On te remonte aussi les lignes “skippées” si le format ne match pas.
          </div>
    
          <div class="mt-4 flex flex-col sm:flex-row gap-3 sm:items-center">
            <input class="input flex-1" type="file" accept=".csv" @change="onFileChange" />
            <button class="btn" :disabled="uploading" @click="upload">
              {{ uploading ? "Import…" : "Importer" }}
            </button>
          </div>
    
          <div class="mt-4 text-sm" :class="status.startsWith('Erreur') ? 'text-red-300' : 'text-muted'">
            {{ status }}
          </div>
        </div>
    
        <div v-if="details" class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <!-- Résumé -->
          <div class="card">
            <div class="text-base font-semibold">Résumé</div>
            <div class="mt-3 space-y-2 text-sm">
              <div class="row"><span class="text-muted">Importés</span><span class="text-text">{{ details.imported }}</span></div>
              <div class="row"><span class="text-muted">Mis à jour</span><span class="text-text">{{ details.updated }}</span></div>
              <div class="row"><span class="text-muted">Skippés</span><span class="text-text">{{ details.skipped }}</span></div>
              <div class="row"><span class="text-muted">Total lignes</span><span class="text-text">{{ details.totalRows }}</span></div>
            </div>
          </div>
    
          <!-- Headers détectés -->
          <div class="card">
            <div class="text-base font-semibold">En-têtes détectés</div>
            <div class="mt-3 flex flex-wrap gap-2">
              <span v-for="h in (details.headers ?? [])" :key="h" class="chip">
                {{ h }}
              </span>
            </div>
          </div>
    
          <!-- Errors sample -->
          <div v-if="(details.errorsSample ?? []).length" class="card lg:col-span-2">
            <div class="text-base font-semibold">Erreurs (échantillon)</div>
            <div class="text-sm text-muted mt-1">
              Si tout est “skippé”, ces lignes indiquent ce qui n’a pas été reconnu (date/montant).
            </div>
    
            <div class="mt-4 overflow-auto border border-border/60 rounded-2xl">
              <table class="w-full text-sm">
                <thead class="bg-card2">
                  <tr>
                    <th class="p-3 text-left text-muted">Ligne</th>
                    <th class="p-3 text-left text-muted">Raison</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="e in details.errorsSample" :key="e.line" class="border-t border-border/60">
                    <td class="p-3 text-text whitespace-nowrap">{{ e.line }}</td>
                    <td class="p-3 text-muted">{{ e.reason }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </template>
    
    <style scoped>
    .card { @apply rounded-2xl bg-card border border-border/60 p-6; }
    .input { @apply bg-card border border-border/60 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/30; }
    .btn { @apply bg-accent text-black px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition disabled:opacity-60 disabled:cursor-not-allowed; }
    .chip { @apply px-3 py-1.5 rounded-full text-xs border border-border/60 text-muted bg-card2; }
    .row { @apply flex items-center justify-between; }
    </style>
    