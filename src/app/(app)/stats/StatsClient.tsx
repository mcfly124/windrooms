"use client";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend,
} from "chart.js";
import { Line, Bar } from "react-chartjs-2";
import { fmtPln } from "@/lib/currency";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend);

const SERIES = ["#2563eb", "#7c3aed", "#059669", "#b45309", "#dc2626", "#0891b2"];

export default function StatsClient({
  months,
  locations,
  occupancyPct,
  bySource,
  revenue,
  tiles,
  eurRate,
  showEur,
}: {
  months: string[];
  locations: { id: number; name: string; roomCount: number }[];
  /** [monthIndex][locationIndex] → % */
  occupancyPct: number[][];
  bySource: { flyspot: number; public: number }[];
  revenue: number[];
  tiles: {
    occupancyNow: number;
    revenueThisMonth: number;
    creditsGranted: number;
    creditsUsed: number;
    overflowCost: number;
  };
  eurRate: number | null;
  showEur: boolean;
}) {
  const labels = months.map((m) =>
    new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })
  );

  const gridColor = "rgba(148, 163, 184, 0.15)";
  const tickColor = "#94a3b8";
  const baseScales = {
    x: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 11 } } },
    y: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 11 } }, beginAtZero: true },
  };
  const baseOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: tickColor, boxWidth: 12, font: { size: 11 } } } },
    scales: baseScales,
  } as const;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Statistics</h1>

      {/* Tiles */}
      <div className="rounded-2xl border border-line bg-line grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-px overflow-hidden">
        <Tile label="Occupancy this month" value={`${tiles.occupancyNow}%`} sub="confirmed room-nights" />
        <Tile
          label="Revenue this month"
          value={fmtPln(tiles.revenueThisMonth, eurRate, showEur)}
          sub="paid payments"
        />
        <Tile label="Credits granted" value={`+${tiles.creditsGranted}`} sub={`last ${months.length} months`} />
        <Tile label="Credits used" value={`−${tiles.creditsUsed}`} sub={`last ${months.length} months`} />
        <Tile
          label="Hotel overflow cost"
          value={fmtPln(tiles.overflowCost, eurRate, showEur)}
          sub={`last ${months.length} months`}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <ChartCard index="01" title="Occupancy by location · %">
          <Line
            options={{ ...baseOptions, scales: { ...baseScales, y: { ...baseScales.y, max: 100 } } }}
            data={{
              labels,
              datasets: locations.map((l, i) => ({
                label: `${l.name} (${l.roomCount})`,
                data: months.map((_, mi) => occupancyPct[mi][i]),
                borderColor: SERIES[i % SERIES.length],
                backgroundColor: SERIES[i % SERIES.length],
                tension: 0.3,
                pointRadius: 3,
              })),
            }}
          />
        </ChartCard>

        <ChartCard index="02" title="Room-nights · Flyspot vs public">
          <Bar
            options={{
              ...baseOptions,
              scales: {
                x: { ...baseScales.x, stacked: true },
                y: { ...baseScales.y, stacked: true },
              },
            }}
            data={{
              labels,
              datasets: [
                {
                  label: "Flyspot clients",
                  data: bySource.map((s) => s.flyspot),
                  backgroundColor: "#2563eb",
                  borderRadius: 4,
                },
                {
                  label: "Public guests",
                  data: bySource.map((s) => s.public),
                  backgroundColor: "#059669",
                  borderRadius: 4,
                },
              ],
            }}
          />
        </ChartCard>

        <ChartCard index="03" title="Payments received · PLN" wide>
          <Bar
            options={baseOptions}
            data={{
              labels,
              datasets: [
                {
                  label: "PLN",
                  data: revenue,
                  backgroundColor: "#2563eb",
                  borderRadius: 4,
                },
              ],
            }}
          />
        </ChartCard>
      </div>

      <p className="text-xs text-faint">
        Occupancy counts confirmed room-nights against active rooms. Data starts accumulating from the day the
        platform replaced the spreadsheet — a few months in, this page answers the &ldquo;should Gdańsk open to the
        public year-round?&rdquo; question with real numbers.
      </p>
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-card p-4 lg:p-5">
      <div className="label-mono mb-2">{label}</div>
      <div className="text-2xl font-semibold font-mono">{value}</div>
      <div className="text-xs text-mut mt-1">{sub}</div>
    </div>
  );
}

function ChartCard({
  index,
  title,
  children,
  wide,
}: {
  index: string;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={`rounded-2xl border border-line bg-card p-4 ${wide ? "lg:col-span-2" : ""}`}>
      <h2 className="text-sm font-medium mb-3">
        <span className="label-mono mr-2">{index}</span>
        {title}
      </h2>
      <div className="h-64">{children}</div>
    </div>
  );
}
