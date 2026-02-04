import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar } from "react-chartjs-2";
import { api } from "../api/client.js";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const formatRs = (v) => `Rs ${Number(v ?? 0).toLocaleString()}`;

const SalesMonthlyChart = ({ year = new Date().getFullYear() }) => {
  const { data = [], isLoading } = useQuery({
    queryKey: ["sales-monthly", year],
    queryFn: async () => {
      const r = await api.get("/reports/sales/monthly", { params: { year } });
      return Array.isArray(r.data) ? r.data : [];
    }
  });

  const chartData = useMemo(() => {
    const labels = data.map((d) => d.month);
    const values = data.map((d) => Number(d.total ?? 0));

    // Generate a distinct color for each bar using HSL hue steps (comma-separated for broad support)
    const denom = Math.max(values.length, 1);
    const colors = values.map((_, i) => {
      const hue = Math.round((i * 360) / denom);
      return `hsl(${hue}, 70%, 45%)`;
    });
    const borderColors = values.map((_, i) => {
      const hue = Math.round((i * 360) / denom);
      return `hsl(${hue}, 70%, 35%)`;
    });

    return {
      labels,
      datasets: [
        {
          label: `Sales ${year}`,
          data: values,
          backgroundColor: colors,
          borderColor: borderColors,
          borderWidth: 1
        }
      ]
    };
  }, [data, year]);

  const options = useMemo(
    () => ({
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => formatRs(ctx.parsed.y)
          }
        }
      },
      scales: {
        y: {
          ticks: {
            callback: (v) => formatRs(v)
          }
        }
      }
    }),
    []
  );

  if (isLoading) return <div>Loading chart…</div>;
  return <Bar data={chartData} options={options} />;
};

export default SalesMonthlyChart;
