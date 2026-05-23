import React, { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";
import { motion } from "framer-motion";

const formatTimestamp = (ts) => {
  if (!ts) return "";
  // Format: "2026-05-13 18:30:20:859" → "18:30"
  const timePart = ts.split(" ")[1];
  if (!timePart) return ts;
  const parts = timePart.split(":");
  return `${parts[0]}:${parts[1]}`;
};

const formatDate = (ts) => {
  if (!ts) return "";
  const datePart = ts.split(" ")[0];
  return datePart;
};

const CustomTooltip = ({ active, payload, label, unit, color }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card/95 backdrop-blur-sm rounded-2xl px-4 py-3 shadow-xl border border-border">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-base font-semibold" style={{ color }}>
        {payload[0].value.toFixed(2)} {unit}
      </p>
    </div>
  );
};

export default function SensorChart({
  data,
  title,
  icon: Icon,
  color,
  gradientId,
  unit,
  delay = 0,
}) {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];

    // Sample data for performance if too many points
    const maxPoints = 500;
    let sampled = data;
    if (data.length > maxPoints) {
      const step = Math.ceil(data.length / maxPoints);
      sampled = data.filter((_, i) => i % step === 0);
    }

    return sampled.map((d) => ({
      time: formatTimestamp(d.timestamp),
      fullTime: d.timestamp,
      value: d.value,
    }));
  }, [data]);

  const stats = useMemo(() => {
    if (!data || data.length === 0) return null;
    const values = data.map((d) => d.value);
    return {
      min: Math.min(...values).toFixed(1),
      max: Math.max(...values).toFixed(1),
      avg: (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1),
      count: data.length,
    };
  }, [data]);

  if (!data || data.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay }}
        className="bg-card rounded-3xl p-6 shadow-sm border border-border"
      >
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-10 h-10 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: `${color}15` }}
          >
            <Icon className="w-5 h-5" style={{ color }} />
          </div>
          <h3 className="text-lg font-semibold">{title}</h3>
        </div>
        <p className="text-muted-foreground text-sm text-center py-8">
          אין נתונים זמינים
        </p>
      </motion.div>
    );
  }

  // Determine date range
  const firstDate = formatDate(data[0]?.timestamp);
  const lastDate = formatDate(data[data.length - 1]?.timestamp);
  const dateRange =
    firstDate === lastDate ? firstDate : `${firstDate} — ${lastDate}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      className="bg-card rounded-3xl p-6 shadow-sm border border-border"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: `${color}15` }}
          >
            <Icon className="w-5 h-5" style={{ color }} />
          </div>
          <div>
            <h3 className="text-lg font-semibold">{title}</h3>
            <p className="text-xs text-muted-foreground">{dateRange}</p>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      {stats && (
        <div className="flex gap-4 mb-4 mt-3">
          <div className="bg-secondary/60 rounded-2xl px-4 py-2 flex-1 text-center">
            <p className="text-xs text-muted-foreground">ממוצע</p>
            <p className="text-sm font-bold" style={{ color }}>
              {stats.avg}
            </p>
          </div>
          <div className="bg-secondary/60 rounded-2xl px-4 py-2 flex-1 text-center">
            <p className="text-xs text-muted-foreground">מינימום</p>
            <p className="text-sm font-bold">{stats.min}</p>
          </div>
          <div className="bg-secondary/60 rounded-2xl px-4 py-2 flex-1 text-center">
            <p className="text-xs text-muted-foreground">מקסימום</p>
            <p className="text-sm font-bold">{stats.max}</p>
          </div>
          <div className="bg-secondary/60 rounded-2xl px-4 py-2 flex-1 text-center">
            <p className="text-xs text-muted-foreground">מדידות</p>
            <p className="text-sm font-bold">{stats.count.toLocaleString()}</p>
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.2} />
                <stop offset="100%" stopColor={color} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(var(--border))"
              vertical={false}
            />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={60}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              width={50}
              domain={["auto", "auto"]}
            />
            <Tooltip
              content={<CustomTooltip unit={unit} color={color} />}
              cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: "4 4" }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2.5}
              fill={`url(#${gradientId})`}
              dot={false}
              activeDot={{
                r: 5,
                fill: color,
                stroke: "#fff",
                strokeWidth: 2,
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}