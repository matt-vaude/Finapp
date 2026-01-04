<script setup lang="ts">
    import { computed } from "vue";
    import { useRoute, RouterLink } from "vue-router";
    
    const route = useRoute();
    const title = computed(() => {
      const map: Record<string, string> = {
        "/dashboard": "Synthèse",
        "/transactions": "Analyse",
        "/budget": "Budget",
        "/import": "Import",
        "/rules": "Règles",
        "/login": "Connexion",
      };
      return map[route.path] ?? "Finance";
    });
    </script>
    
    <template>
      <div class="min-h-screen bg-bg text-text">
        <div class="flex min-h-screen">
          <!-- Sidebar -->
          <aside class="w-72 shrink-0 border-r border-border/60 px-5 py-7">
            <div class="text-xl font-semibold tracking-wide mb-8">
              <span class="text-accent">fin</span><span>ary</span>
            </div>
    
            <nav class="space-y-1.5">
              <RouterLink class="nav" to="/dashboard">Synthèse</RouterLink>
              <RouterLink class="nav" to="/transactions">Analyse</RouterLink>
              <RouterLink class="nav" to="/budget">Budget</RouterLink>
              <RouterLink class="nav" to="/import">Import</RouterLink>
              <RouterLink class="nav" to="/rules">Règles</RouterLink>
            </nav>
    
            <div class="mt-10 p-5 rounded-2xl bg-card border border-border/60">
              <div class="text-sm text-muted">Astuce</div>
              <div class="text-sm mt-2 leading-relaxed">
                Crée des règles pour catégoriser automatiquement tes transactions.
              </div>
            </div>
          </aside>
    
          <!-- Content -->
          <main class="flex-1 min-w-0">
            <header class="px-10 py-7 flex items-center justify-between border-b border-border/60">
              <div>
                <div class="text-2xl font-semibold">{{ title }}</div>
                <div class="text-sm text-muted">Cash in / out, budget, projection</div>
              </div>
    
              <div class="flex items-center gap-2">
                <button class="chip">1J</button>
                <button class="chip">7J</button>
                <button class="chip chip-active">1M</button>
                <button class="chip">YTD</button>
              </div>
            </header>
    
            <div class="px-10 py-10 w-full">
              <!-- ✅ Largeur globale de l'app (comme Finary) -->
              <div class="max-w-[1680px] mx-auto">
                <router-view />
              </div>
            </div>
          </main>
        </div>
      </div>
    </template>
    
    <style scoped>
    .nav {
      @apply block px-3 py-2 rounded-lg text-sm text-muted hover:text-text hover:bg-card2 transition;
    }
    .router-link-active {
      @apply bg-card2 text-text border border-border/60;
    }
    .chip {
      @apply px-3 py-1.5 rounded-full text-xs border border-border/60 text-muted hover:text-text hover:bg-card2 transition;
    }
    .chip-active {
      @apply border-accent/70 text-text;
      box-shadow: 0 0 0 1px rgba(214,162,91,.25) inset;
    }
    </style>
    