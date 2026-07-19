"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Filler,
  Tooltip,
  Legend,
} from "chart.js";
import { Line, Bar } from "react-chartjs-2";
import { sourceLabel } from "@/lib/traffic";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Filler, Tooltip, Legend);

type Row = { key: string; views: number; visitors: number };

const DEVICE_COLOR: Record<string, string> = {
  desktop: "#2563eb",
  mobile: "#7c3aed",
  tablet: "#059669",
};

const MEDIUM_TONE: Record<string, string> = {
  organic: "bg-ok-soft text-ok",
  social: "bg-purp-soft text-purp",
  referral: "bg-acc-softer text-acc",
  email: "bg-warn-soft text-warn",
  none: "bg-hovr text-mut",
};

export default function TrafficClient({
  days,
  ranges,
  labels,
  views,
  visitors,
  sources,
  pages,
  devices,
  countries,
  tiles,
}: {
  days: number;
  ranges: number[];
  labels: string[];
  views: number[];
  visitors: number[];
  sources: (Row & { medium: string | null; links: Row[] })[];
  pages: Row[];
  devices: Row[];
  countries: Row[];
  tiles: {
    views: number;
    visitors: number;
    prevViews: number;
    prevVisitors: number;
    bookings: number;
    conversionPct: number;
  };
}) {
  const gridColor = "rgba(148, 163, 184, 0.15)";
  const tickColor = "#94a3b8";
  const baseScales = {
    x: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 11 }, maxTicksLimit: 12 } },
    y: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 11 }, precision: 0 }, beginAtZero: true },
  };
  const baseOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: tickColor, boxWidth: 12, font: { size: 11 } } } },
    scales: baseScales,
  } as const;

  const dayLabels = labels.map((d) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" })
  );
  const maxSource = Math.max(1, ...sources.map((s) => s.visitors));
  const [expanded, setExpanded] = useState<string | null>(null);
  const empty = tiles.views === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-xl font-semibold">Traffic</h1>
        <span className="text-xs text-mut">windrooms.pl · public site</span>
        <div className="ml-auto flex rounded-lg border border-line overflow-hidden">
          {ranges.map((r) => (
            <Link
              key={r}
              href={`/traffic?days=${r}`}
              className={`px-3 py-1.5 text-xs font-mono ${
                r === days ? "bg-acc text-white" : "text-mut hover:bg-hovr"
              }`}
            >
              {r}d
            </Link>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-line grid grid-cols-2 lg:grid-cols-4 gap-px overflow-hidden">
        <Tile label="Visitors" value={tiles.visitors.toLocaleString()} prev={tiles.prevVisitors} days={days} />
        <Tile label="Page views" value={tiles.views.toLocaleString()} prev={tiles.prevViews} days={days} />
        <Tile label="Public bookings" value={tiles.bookings.toLocaleString()} sub="made in this window" />
        <Tile label="Visitor → booking" value={`${tiles.conversionPct}%`} sub="of unique visitors booked" />
      </div>

      {empty && (
        <div className="rounded-2xl border border-line bg-card p-6 text-sm text-mut">
          No visits recorded in this window yet. Tracking starts the moment someone opens{" "}
          <span className="font-mono text-ink">/book</span> — give it a day, or open the public site yourself to
          see a first row appear.
        </div>
      )}

      <div className="rounded-2xl border border-line bg-card p-4">
        <h2 className="text-sm font-medium mb-3">
          <span className="label-mono mr-2">01</span>
          Visitors &amp; page views · last {days} days
        </h2>
        <div className="h-64">
          <Line
            options={baseOptions}
            data={{
              labels: dayLabels,
              datasets: [
                {
                  label: "Visitors",
                  data: visitors,
                  borderColor: "#2563eb",
                  backgroundColor: "rgba(37, 99, 235, 0.12)",
                  fill: true,
                  tension: 0.3,
                  pointRadius: days > 45 ? 0 : 2,
                },
                {
                  label: "Page views",
                  data: views,
                  borderColor: "#7c3aed",
                  backgroundColor: "#7c3aed",
                  tension: 0.3,
                  pointRadius: days > 45 ? 0 : 2,
                },
              ],
            }}
          />
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Sources — the "where from" question, ranked by people not hits */}
        <div className="rounded-2xl border border-line bg-card p-4">
          <h2 className="text-sm font-medium mb-3">
            <span className="label-mono mr-2">02</span>
            Where visitors come from
          </h2>
          {sources.length === 0 ? (
            <p className="text-sm text-faint py-6 text-center">Nothing yet.</p>
          ) : (
            <div className="space-y-1.5">
              {sources.map((s) => {
                const open = expanded === s.key;
                const canOpen = s.links.length > 0;
                return (
                  <div key={s.key}>
                    <button
                      type="button"
                      disabled={!canOpen}
                      onClick={() => setExpanded(open ? null : s.key)}
                      className={`relative w-full rounded-lg overflow-hidden text-left ${
                        canOpen ? "hover:ring-1 hover:ring-line" : "cursor-default"
                      }`}
                    >
                      <div
                        className="absolute inset-y-0 left-0 bg-acc-softer"
                        style={{ width: `${(s.visitors / maxSource) * 100}%` }}
                      />
                      <div className="relative flex items-center gap-2 px-3 py-2 text-sm">
                        {canOpen && (
                          <span className={`text-faint text-[10px] shrink-0 ${open ? "rotate-90" : ""}`}>▶</span>
                        )}
                        <span className="truncate">{sourceLabel(s.key)}</span>
                        {s.medium && (
                          <span
                            className={`label-mono px-1.5 py-0.5 rounded ${
                              MEDIUM_TONE[s.medium] ?? "bg-hovr text-mut"
                            }`}
                          >
                            {s.medium}
                          </span>
                        )}
                        <span className="ml-auto font-mono text-xs text-mut shrink-0">
                          {s.visitors} <span className="text-faint">/ {s.views}</span>
                        </span>
                      </div>
                    </button>
                    {open && (
                      <div className="pl-6 pr-1 py-1.5 space-y-1">
                        {s.links.map((l) => (
                          <div key={l.key} className="flex items-center gap-2 text-xs">
                            <a
                              href={l.key}
                              target="_blank"
                              rel="noopener noreferrer nofollow"
                              className="font-mono text-mut hover:text-acc truncate"
                              title={l.key}
                            >
                              {l.key}
                            </a>
                            <span className="ml-auto font-mono text-faint shrink-0">
                              {l.visitors} / {l.views}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              <p className="text-xs text-faint pt-1">
                visitors / page views · click a source for the exact links
              </p>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-line bg-card p-4">
          <h2 className="text-sm font-medium mb-3">
            <span className="label-mono mr-2">03</span>
            Most visited pages
          </h2>
          {pages.length === 0 ? (
            <p className="text-sm text-faint py-6 text-center">Nothing yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="label-mono text-left">
                  <th className="pb-2 font-normal">Page</th>
                  <th className="pb-2 font-normal text-right">Visitors</th>
                  <th className="pb-2 font-normal text-right">Views</th>
                </tr>
              </thead>
              <tbody>
                {pages.map((p) => (
                  <tr key={p.key} className="border-t border-line">
                    <td className="py-2 font-mono text-xs truncate max-w-[220px]">{p.key}</td>
                    <td className="py-2 text-right font-mono text-xs">{p.visitors}</td>
                    <td className="py-2 text-right font-mono text-xs text-mut">{p.views}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="rounded-2xl border border-line bg-card p-4">
          <h2 className="text-sm font-medium mb-3">
            <span className="label-mono mr-2">04</span>
            Devices
          </h2>
          <div className="h-48">
            {devices.length === 0 ? (
              <p className="text-sm text-faint py-6 text-center">Nothing yet.</p>
            ) : (
              <Bar
                options={{ ...baseOptions, indexAxis: "y" as const, plugins: { legend: { display: false } } }}
                data={{
                  labels: devices.map((d) => d.key),
                  datasets: [
                    {
                      label: "Visitors",
                      data: devices.map((d) => d.visitors),
                      backgroundColor: devices.map((d) => DEVICE_COLOR[d.key] ?? "#2563eb"),
                      borderRadius: 4,
                    },
                  ],
                }}
              />
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-card p-4">
          <h2 className="text-sm font-medium mb-3">
            <span className="label-mono mr-2">05</span>
            Countries
          </h2>
          {countries.length === 0 ? (
            <p className="text-sm text-faint py-6 text-center">
              Country data appears once the site runs on Vercel.
            </p>
          ) : (
            <div className="space-y-1.5">
              {countries.map((c) => (
                <div key={c.key} className="flex items-center gap-2 text-sm px-1 py-1.5 border-b border-line last:border-0">
                  <span className="font-mono text-xs bg-hovr rounded px-1.5 py-0.5">{c.key}</span>
                  <span className="ml-auto font-mono text-xs text-mut">{c.visitors}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-faint">
        Counted first-party, without cookies: a visitor is a salted daily hash of IP + browser that cannot be
        traced back to a person or linked across days, so no consent banner is required. Known bots are dropped.
        Only the public site (<span className="font-mono">/book…</span>) is tracked — never the ops app.
      </p>
    </div>
  );
}

function Tile({
  label,
  value,
  sub,
  prev,
  days,
}: {
  label: string;
  value: string;
  sub?: string;
  prev?: number;
  days?: number;
}) {
  const current = Number(value.replace(/[^\d.]/g, ""));
  const delta = prev !== undefined && prev > 0 ? Math.round(((current - prev) / prev) * 100) : null;
  return (
    <div className="bg-card p-4 lg:p-5">
      <div className="label-mono mb-2">{label}</div>
      <div className="text-2xl font-semibold font-mono">{value}</div>
      <div className="text-xs mt-1">
        {delta !== null ? (
          <span className={delta >= 0 ? "text-ok" : "text-bad"}>
            {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}%{" "}
            <span className="text-mut">vs previous {days}d</span>
          </span>
        ) : (
          <span className="text-mut">{sub ?? `previous ${days}d: none`}</span>
        )}
      </div>
    </div>
  );
}
