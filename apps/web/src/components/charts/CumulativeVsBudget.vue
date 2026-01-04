<script setup lang="ts">
  import { computed, onMounted, ref, watch } from "vue";
  import { http } from "../../services/http";
  
  import VueECharts from "vue-echarts";
  import * as echarts from "echarts/core";
  import { LineChart } from "echarts/charts";
  import { GridComponent, TooltipComponent, LegendComponent } from "echarts/components";
  import { SVGRenderer } from "echarts/renderers";
  
  echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, SVGRenderer]);
  
  const props = defineProps<{ month: string }>();
  
  const loading = ref(false);
  const payload = ref<any>(null);
  
  function eur(v: number) {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(v ?? 0);
  }
  
  async function load() {
    loading.value = true;
    try {
      const res = await http.get("/analytics/cumulative", { params: { month: props.month } });
      payload.value = res.data;
    } finally {
      loading.value = false;
    }
  }
  onMounted(load);
  watch(() => props.month, load);
  
  const option = computed(() => {
    if (!payload.value) return {};
    const labels = payload.value.labels as string[];
    const actual = payload.value.actual as number[];
    const budgetLine = payload.value.budgetLine as number[];
  
    return {
      tooltip: {
        trigger: "axis",
        formatter: (params: any) => {
          const day = params?.[0]?.axisValue ?? "";
          const a = params?.find((p: any) => p.seriesName === "Réel")?.data ?? 0;
          const b = params?.find((p: any) => p.seriesName === "Budget (linéaire)")?.data ?? 0;
          const diff = Number(a) - Number(b);
          return [
            `<b>Jour ${day}</b>`,
            `Réel: <b>${eur(a)}</b>`,
            `Budget: <b>${eur(b)}</b>`,
            `Écart: <b>${eur(diff)}</b>`,
          ].join("<br/>");
        },
        backgroundColor: "rgba(15,15,18,.95)",
        borderColor: "rgba(255,255,255,.10)",
        textStyle: { color: "#e8e8ea" },
      },
      legend: { top: 0, textStyle: { color: "#cfcfd5" } },
      grid: { left: 20, right: 20, top: 40, bottom: 30, containLabel: true },
      xAxis: {
        type: "category",
        data: labels,
        axisLabel: { color: "#b8b8bc" },
        axisLine: { lineStyle: { color: "rgba(255,255,255,.12)" } },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: "#b8b8bc", formatter: (v: number) => `${Math.round(v)}€` },
        splitLine: { lineStyle: { color: "rgba(255,255,255,.08)" } },
      },
      series: [
        { name: "Réel", type: "line", smooth: true, showSymbol: false, data: actual },
        { name: "Budget (linéaire)", type: "line", smooth: true, showSymbol: false, data: budgetLine },
      ],
    };
  });
  </script>
  
  <template>
    <div class="h-full w-full">
      <div v-if="loading" class="h-full w-full flex items-center justify-center text-muted">
        Chargement…
      </div>
      <VueECharts v-else class="h-full w-full" :option="option" :init-options="{ renderer: 'svg' }" autoresize />
    </div>
  </template>
  