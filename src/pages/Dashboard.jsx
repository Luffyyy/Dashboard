import React, { useState, useEffect, useMemo } from "react";
import { Thermometer, Droplets, Gauge, Database, Activity } from "lucide-react";
import { motion } from "framer-motion";
import SensorChart from "@/components/dashboard/SensorChart";
import StatsCard from "@/components/dashboard/StatsCard";

const CSV_URL = "https://media.base44.com/files/public/6a119e0323a2cb596c1306c3/b6c1010e5_filtered_sensor_data.csv";

function parseCSV(text) {
  const lines = text.trim().split("\n");
  const grouped = { Temperature: [], Humidity: [], Pressure: [] };
  let total = 0;
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    if (parts.length < 3) continue;
    const timestamp = parts[0].trim();
    const type = parts[1].trim();
    const value = parseFloat(parts[2].trim());
    if (grouped[type] && !isNaN(value)) {
      grouped[type].push({ timestamp, value });
      total++;
    }
  }
  return { grouped, total };
}

export default function Dashboard() {
  const [sensorData, setSensorData] = useState(null);
  const [totalRecords, setTotalRecords] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(CSV_URL)
      .then((res) => {
        if (!res.ok) throw new Error("שגיאה בטעינת הנתונים");
        return res.text();
      })
      .then((text) => {
        const { grouped, total } = parseCSV(text);
        setSensorData(grouped);
        setTotalRecords(total);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return (
    <div className="min-h-screen bg-background font-rubik" dir="rtl">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center">
            <Activity className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">
              דשבורד ניטור נתונים - Team 1
            </h1>
            <p className="text-xs text-muted-foreground">Real-time Sensor Monitoring</p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {loading && (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <div className="w-16 h-16 rounded-full bg-accent flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
            <p className="text-muted-foreground font-medium">טוען נתוני חיישנים...</p>
          </div>
        )}

        {error && (
          <div className="text-center py-24 text-destructive">
            <p className="text-lg font-semibold">{error}</p>
          </div>
        )}

        {!loading && !error && sensorData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-6"
          >
            {/* Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatsCard
                icon={Database}
                label="סה״כ מדידות"
                value={totalRecords.toLocaleString()}
                color="#7c5cfc"
                delay={0}
              />
              <StatsCard
                icon={Thermometer}
                label="מדידות טמפרטורה"
                value={sensorData.Temperature.length.toLocaleString()}
                color="#f97066"
                delay={0.1}
              />
              <StatsCard
                icon={Droplets}
                label="מדידות לחות"
                value={sensorData.Humidity.length.toLocaleString()}
                color="#38bdf8"
                delay={0.2}
              />
              <StatsCard
                icon={Gauge}
                label="מדידות לחץ"
                value={sensorData.Pressure.length.toLocaleString()}
                color="#34d399"
                delay={0.3}
              />
            </div>

            {/* Charts */}
            <SensorChart
              data={sensorData.Temperature}
              title="טמפרטורה"
              icon={Thermometer}
              color="#f97066"
              gradientId="tempGrad"
              unit="°C"
              delay={0.2}
            />
            <SensorChart
              data={sensorData.Humidity}
              title="לחות"
              icon={Droplets}
              color="#38bdf8"
              gradientId="humGrad"
              unit="%"
              delay={0.3}
            />
            <SensorChart
              data={sensorData.Pressure}
              title="לחץ אוויר"
              icon={Gauge}
              color="#34d399"
              gradientId="presGrad"
              unit="hPa"
              delay={0.4}
            />
          </motion.div>
        )}
      </main>
    </div>
  );
}