<script setup lang="ts">
    import { computed, onMounted, ref, watch, onBeforeUnmount } from "vue";
    import { http } from "../services/http";
    
    import VueECharts from "vue-echarts";
    import * as echarts from "echarts/core";
    import { SankeyChart } from "echarts/charts";
    import { TooltipComponent } from "echarts/components";
    import { SVGRenderer } from "echarts/renderers";
    
    echarts.use([SankeyChart, TooltipComponent, SVGRenderer]);
    
    const props = defineProps<{ month: string; mode: "real" | "budget"; income: "detail" | "simple" }>();
    
    const data = ref<any>(null);
    const loading = ref(false);
    
    // zoom/pan (CSS)
    const scale = ref(1);
    const tx = ref(0);
    const ty = ref(0);
    const isPanning = ref(false);
    let panStart: { x: number; y: number; tx: number; ty: number } | null = null;
    
    const isFullscreen = ref(false);
    
    async function load() {
      loading.value = true;
      try {
        const res = await http.get("/cashflow/sankey", {
          params: { month: props.month, mode: props.mode, income: props.income },
        });
        data.value = res.data;
      } finally {
        loading.value = false;
      }
    }
    
    onMounted(load);
    watch(() => [props.month, props.mode, props.income], load);
    
    function clamp(n: number, a: number, b: number) {
      return Math.max(a, Math.min(b, n));
    }
    
    function zoomIn() {
      scale.value = clamp(Number((scale.value * 1.15).toFixed(2)), 1, 3);
    }
    function zoomOut() {
      scale.value = clamp(Number((scale.value / 1.15).toFixed(2)), 1, 3);
    }
    function resetView() {
      scale.value = 1;
      tx.value = 0;
      ty.value = 0;
    }
    
    // reset pan quand retour à 1
    watch(scale, (s) => {
      if (s <= 1) {
        tx.value = 0;
        ty.value = 0;
      }
    });
    
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const zoomInWheel = e.deltaY < 0;
      const factor = zoomInWheel ? 1.12 : 1 / 1.12;
      scale.value = clamp(Number((scale.value * factor).toFixed(2)), 1, 3);
    }
    
    function onPointerDown(e: PointerEvent) {
      if (scale.value <= 1) return;
      isPanning.value = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      panStart = { x: e.clientX, y: e.clientY, tx: tx.value, ty: ty.value };
    }
    
    function onPointerMove(e: PointerEvent) {
      if (!isPanning.value || !panStart) return;
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      tx.value = panStart.tx + dx;
      ty.value = panStart.ty + dy;
    }
    
    function onPointerUp() {
      isPanning.value = false;
      panStart = null;
    }
    
    function toggleFullscreen() {
      isFullscreen.value = !isFullscreen.value;
      if (isFullscreen.value) resetView();
    }
    
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && isFullscreen.value) isFullscreen.value = false;
    }
    onMounted(() => window.addEventListener("keydown", onKey));
    onBeforeUnmount(() => window.removeEventListener("keydown", onKey));
    
    function formatEUR(v: number) {
      return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(v ?? 0);
    }
    
    // ✅ Map nodeId => display label (so edges show nice names too)
    const labelById = computed<Record<string, string>>(() => {
      const m: Record<string, string> = {};
      const nodes = data.value?.nodes ?? [];
      for (const n of nodes) {
        m[n.name] = n.label ?? n.name;
      }
      return m;
    });
    
    const option = computed(() => {
      if (!data.value) return {};
    
      return {
        tooltip: {
          trigger: "item",
          formatter: (p: any) => {
            if (p.dataType === "edge") {
              const s = labelById.value[p.data.source] ?? p.data.source;
              const t = labelById.value[p.data.target] ?? p.data.target;
              return `${s} → ${t}<br/><b>${formatEUR(Number(p.data.value))}</b>`;
            }
    
            const shown = p.data?.label ?? p.name;
            const v = Number(p.data?.value ?? 0);
            return `<b>${shown}</b><br/>${formatEUR(v)}`;
          },
          backgroundColor: "rgba(15,15,18,.95)",
          borderColor: "rgba(255,255,255,.10)",
          textStyle: { color: "#e8e8ea" },
        },
    
        series: [
          {
            type: "sankey",
            data: data.value.nodes, // [{ name: "L2G::Logement", label:"Logement", value:... }]
            links: data.value.links,
    
            nodeWidth: 12,
            nodeGap: 14,
    
            left: 24,
            right: 320,
            top: 10,
            bottom: 10,
    
            emphasis: { focus: "adjacency" },
    
            lineStyle: {
              color: "source",
              opacity: 0.38,
              curveness: 0.5,
            },
    
            itemStyle: {
              borderWidth: 1,
              borderColor: "rgba(255,255,255,.08)",
            },
    
            label: {
              formatter: (p: any) => {
                const shown = p.data?.label ?? p.name;
                const v = Number(p.data?.value ?? 0);
                return `${shown}: ${formatEUR(v)}`;
              },
    
              color: "#e8e8ea",
              fontSize: 12,
              lineHeight: 14,
    
              width: 290,
              overflow: "truncate",
    
              position: "right",
              align: "left",
    
              backgroundColor: "rgba(15,15,18,.85)",
              borderColor: "rgba(255,255,255,.10)",
              borderWidth: 1,
              borderRadius: 6,
              padding: [4, 8],
            },
    
            labelLayout: { hideOverlap: true },
          },
        ],
      };
    });
    
    const transformStyle = computed(() => ({
      transform: `translate(${tx.value}px, ${ty.value}px) scale(${scale.value})`,
      transformOrigin: "center center",
    }));
    </script>
    
    <template>
      <div class="h-full w-full relative select-none">
        <div class="absolute z-10 top-3 right-3 flex gap-2">
          <button class="tool" @click="zoomOut" title="Zoom -">−</button>
          <button class="tool" @click="zoomIn" title="Zoom +">+</button>
          <button class="tool" @click="resetView" title="Reset">Reset</button>
          <button class="tool" @click="toggleFullscreen" title="Plein écran">⤢</button>
        </div>
    
        <div v-if="loading" class="h-full w-full flex items-center justify-center text-muted">
          Chargement…
        </div>
    
        <div
          v-else
          class="h-full w-full overflow-hidden"
          @wheel="onWheel"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
        >
          <div class="h-full w-full" :style="transformStyle">
            <VueECharts class="h-full w-full" :option="option" :init-options="{ renderer: 'svg' }" autoresize />
          </div>
        </div>
    
        <teleport to="body">
          <div v-if="isFullscreen" class="fixed inset-0 z-[9999] bg-bg text-text">
            <div class="h-full w-full p-6">
              <div class="flex items-center justify-between mb-4">
                <div class="text-lg font-semibold">Cashflow (Sankey)</div>
                <div class="flex gap-2">
                  <button class="tool" @click="zoomOut">−</button>
                  <button class="tool" @click="zoomIn">+</button>
                  <button class="tool" @click="resetView">Reset</button>
                  <button class="tool" @click="toggleFullscreen">Fermer</button>
                </div>
              </div>
    
              <div
                class="h-[calc(100vh-96px)] rounded-2xl border border-border/60 bg-card2 overflow-hidden"
                @wheel="onWheel"
                @pointerdown="onPointerDown"
                @pointermove="onPointerMove"
                @pointerup="onPointerUp"
                @pointercancel="onPointerUp"
              >
                <div class="h-full w-full" :style="transformStyle">
                  <VueECharts class="h-full w-full" :option="option" :init-options="{ renderer: 'svg' }" autoresize />
                </div>
              </div>
    
              <div class="text-sm text-muted mt-3">
                Astuce : molette pour zoomer, glisser pour se déplacer (quand zoom &gt; 1), Échap pour fermer.
              </div>
            </div>
          </div>
        </teleport>
      </div>
    </template>
    
    <style scoped>
    .tool {
      @apply px-3 py-1.5 rounded-lg text-xs border border-border/60 bg-card/80 text-muted hover:text-text hover:bg-card2 transition;
    }
    </style>
    