<script setup lang="ts">
  import { computed, onMounted, ref, watch } from "vue";
  import { http } from "../../services/http";
  
  import VueECharts from "vue-echarts";
  import * as echarts from "echarts/core";
  import { BarChart } from "echarts/charts";
  import { GridComponent, TooltipComponent } from "echarts/components";
  import { SVGRenderer } from "echarts/renderers";
  
  echarts.use([BarChart, GridComponent, TooltipComponent, SVGRenderer]);
  
  const props = defineProps<{ month: string }>();
  
  const loading = ref(false);
  const payload = ref<any>(null);
  
  function eur(v: number) {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(v ?? 0);
  }
  
  async function load() {
    loading.value = true;
    try {
      const res = await http.get("/analytics/budget-vs-actual", { params: { month: props.month } });
      payload.value = res.data;
    } finally {
      loading.value = false;
    }
  }
  onMounted(load);
  watch(() => props.month, load);
  
  const option = computed(() => {
    if (!payload.value) return {};
    const items = payload.value.items as Array<{ name: string; budget: number; actual: number }>;
  
    const names = items.map((i) => i.name);
    const budgets = items.map((i) => i.budget);
    const actuals = items.map((i) => i.actual);
  
    return {
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params: any) => {
          const idx = params?.[0]?.dataIndex ?? 0;
          const b = budgets[idx] ?? 0;
          const a = actuals[idx] ?? 0;
          const diff = a - b;
          return [
            `<b>${names[idx]}</b>`,
            `Budget: <b>${eur(b)}</b>`,
            `Réel: <b>${eur(a)}</b>`,
            `Écart: <b>${eur(diff)}</b>`,
          ].join("<br/>");
        },
        backgroundColor: "rgba(15,15,18,.95)",
        borderColor: "rgba(255,255,255,.10)",
        textStyle: { color: "#e8e8ea" },
      },
      grid: { left: 240, right: 20, top: 10, bottom: 10, containLabel: false },
      xAxis: {
        type: "value",
        axisLabel: { color: "#b8b8bc", formatter: (v: number) => `${Math.round(v)}€` },
        splitLine: { lineStyle: { color: "rgba(255,255,255,.08)" } },
      },
      yAxis: {
        type: "category",
        data: names,
        axisLabel: { color: "#cfcfd5", width: 230, overflow: "truncate" },
        axisLine: { lineStyle: { color: "rgba(255,255,255,.12)" } },
      },
      series: [
        {
          name: "Budget",
          type: "bar",
          data: budgets,
          barWidth: 14,
          itemStyle: { opacity: 0.25 },
          z: 1,
        },
        {
          name: "Réel",
          type: "bar",
          data: actuals,
          barWidth: 10,
          barGap: "-100%",
          label: {
            show: true,
            position: "right",
            color: "#e8e8ea",
            formatter: (p: any) => eur(actuals[p.dataIndex] ?? 0),
          },
          z: 2,
        },
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
  