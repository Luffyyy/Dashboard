import React, { useState } from "react";
import { Thermometer, Droplets, Gauge, Database, Clock, Activity } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import FileUpload from "@/components/dashboard/FileUpload";
import SensorChart from "@/components/dashboard/SensorChart";
import StatsCard from "@/components/dashboard/StatsCard";

export default function Dashboard() {
  const [sensorData, setSensorData] = useState(null);
  const [totalRecords, setTotalRecords] = useState(0);

  const handleDataLoaded = (grouped, total) => {
    setSensorData(grouped);
    setTotalRecords(total);
  };

  const hasData = sensorData !== null;

  return (
    <div className="min-h-screen bg-background font-rubik" dir="rtl">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center">
              <Activity className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">
                דשבורד ניטור נתונים
              </h1>
              <p className="text-xs text-muted-foreground">Team 1</p>
            </div>
          </div>
          {hasData && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onClick={() => {
                setSensorData(null);
                setTotalRecords(0);
              }}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors bg-secondary rounded-full px-4 py-2"
            >
              העלה קובץ חדש
            </motion.button>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <AnimatePresence mode="wait">
          {!hasData ? (
            <motion.div
              key="upload"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-2xl mx-auto mt-12"
            >
              <div className="text-center mb-8">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
                  className="w-20 h-20 rounded-full bg-accent mx-auto mb-4 flex items-center justify-center"
                >
                  <Database className="w-9 h-9 text-primary" />
                </motion.div>
                <h2 className="text-2xl font-bold text-foreground mb-2">
                  ברוכים הבאים לדשבורד הניטור
                </h2>
                <p className="text-muted-foreground">
                  העלה קובץ CSV עם נתוני חיישנים כדי להתחיל בניתוח
                </p>
              </div>
              <FileUpload onDataLoaded={handleDataLoaded} />
            </motion.div>
          ) : (
            <motion.div
              key="charts"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
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
        </AnimatePresence>
      </main>
    </div>
  );
}