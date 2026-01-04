<script setup lang="ts">
  import { computed, onMounted, ref, watch } from "vue";
  import { http } from "../../services/http";
  
  import VueECharts from "vue-echarts";
  import * as echarts from "echarts/core";
  import { BarChart } from "echarts/charts";
  import { GridComponent, TooltipComponent, LegendComponent } from "echarts/components";
  import { SVGRenderer } from "echarts/renderers";
  
  echarts.use([BarChart, GridComponent, TooltipComponent, LegendComponent, SVGRenderer]);
  
  const props = defineProps<{ month: string }>();
  
  const loading = ref(false);
  const payload = ref<any>(null);
  
  function eur(v: number) {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(v ?? 0);
  }
  
  async function load() {
    loading.value = true;
    try {
      const res = await http.get("/analytics/waterfall", { params: { month: props.month } });
      payload.value = res.data;
    } finally {
      loading.value = false;
    }
  }
  onMounted(load);
  watch(() => props.month, load);
  
  const option = computed(() => {
    if (!payload.value) return {};
  
    const steps = payload.value.steps as Array<{ name: string; value: number }>;
    const names = steps.map((s) => s.name);
  
    let running = 0;
    const placeholder: number[] = [];
    const bars: number[] = [];
  
    for (let i = 0; i < steps.length; i++) {
      const v = steps[i].value;
  
      if (i === 0) {
        placeholder.push(0);
        bars.push(v);
        running = v;
        continue;
      }
  
      if (i === steps.length - 1) {
        placeholder.push(0);
        bars.push(v);
        continue;
      }
  
      const next = running + v; // v négatif (dépense)
      placeholder.push(Math.min(running, next));
      bars.push(Math.abs(v));
      running = next;
    }
  
    return {
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params: any) => {
          const idx = params?.[0]?.dataIndex ?? 0;
          const v = steps[idx]?.value ?? 0;
          return `<b>${steps[idx].name}</b><br/>${eur(v)}`;
        },
        backgroundColor: "rgba(15,15,18,.95)",
        borderColor: "rgba(255,255,255,.10)",
        textStyle: { color: "#e8e8ea" },
      },
      grid: { left: 20, right: 20, top: 20, bottom: 40, containLabel: true },
      xAxis: {
        type: "category",
        data: names,
        axisLabel: { color: "#b8b8bc", rotate: 20 },
        axisLine: { lineStyle: { color: "rgba(255,255,255,.12)" } },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: "#b8b8bc", formatter: (v: number) => `${Math.round(v)}€` },
        splitLine: { lineStyle: { color: "rgba(255,255,255,.08)" } },
      },
      series: [
        {
          name: "base",
          type: "bar",
          stack: "total",
          itemStyle: { color: "transparent" },
          emphasis: { itemStyle: { color: "transparent" } },
          data: placeholder,
        },
        {
          name: "variation",
          type: "bar",
          stack: "total",
          data: bars,
          label: {
            show: true,
            position: "top",
            color: "#e8e8ea",
            formatter: (p: any) => eur(steps[p.dataIndex]?.value ?? 0),
          },
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
  