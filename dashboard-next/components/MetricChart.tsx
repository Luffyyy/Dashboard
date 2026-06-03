"use client";
import React, { useState, useMemo } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceDot } from 'recharts';
import { Activity, Droplets, Gauge, MapPin } from 'lucide-react';
import type { MQTTMessage } from './DashboardClientWrapper';
import { formatTimestampTime } from '../lib/time';

interface ChartPoint {
  id: string;
  time: string;
  value: number;
  x: number;
  y: number;
}

interface MetricChartProps {
  temperatureData: ChartPoint[];
  humidityData: ChartPoint[];
  pressureData: ChartPoint[];
  selectedMessage: MQTTMessage | null;
}

// 1. Reusable Stat Display Badge Component
const StatBadge = ({ icon, label, value, border }: { icon: React.ReactNode, label: string, value: string, border?: boolean }) => (
  <div className={`flex items-center gap-2 ${border ? 'sm:border-l border-slate-200 sm:pl-3' : ''}`}>
    {icon}
    <div>
      <p className="text-[9px] font-medium text-slate-400 uppercase tracking-wider">{label}</p>
      <p className="text-xs font-bold text-slate-700 font-mono">{value}</p>
    </div>
  </div>
);

export default function MetricChart({ temperatureData, humidityData, pressureData, selectedMessage }: MetricChartProps) {
  const [chartScope, setChartScope] = useState<'all' | 'local'>('local');

  // 2. Memoize bounding geometry properties
  const selectedSectorCenter = useMemo(() => {
    if (!selectedMessage) return null;
    return {
      x: Math.floor(selectedMessage.X / 100) * 100 + 50,
      y: Math.floor(selectedMessage.Y / 100) * 100 + 50,
    };
  }, [selectedMessage]);

  // 3. Centralized array filtering logic
  const filteredData = useMemo(() => {
    const isPointInSelectedGrid = (x: number, y: number) => {
      if (!selectedSectorCenter) return false;
      return Math.abs(x - selectedSectorCenter.x) <= 50 && Math.abs(y - selectedSectorCenter.y) <= 50;
    };

    if (chartScope === 'all') {
      return { temp: temperatureData, hum: humidityData, pres: pressureData };
    }
    return {
      temp: temperatureData.filter(d => isPointInSelectedGrid(d.x, d.y)),
      hum: humidityData.filter(d => isPointInSelectedGrid(d.x, d.y)),
      pres: pressureData.filter(d => isPointInSelectedGrid(d.x, d.y)),
    };
  }, [chartScope, temperatureData, humidityData, pressureData, selectedSectorCenter]);

  // 4. Construct unified zipped timelines matrix
  const unifiedData = useMemo(() => {
    const timeMap = new Map<string, { id?: string; time: string; Temperature?: number; Humidity?: number; Pressure?: number }>();

    filteredData.temp.forEach(t => timeMap.set(t.time, { id: t.id, time: t.time, Temperature: t.value }));
    filteredData.hum.forEach(h => {
      const existing = timeMap.get(h.time) || { time: h.time };
      timeMap.set(h.time, { ...existing, Humidity: h.value });
    });
    filteredData.pres.forEach(p => {
      const existing = timeMap.get(p.time) || { time: p.time };
      timeMap.set(p.time, { ...existing, Pressure: p.value });
    });

    return Array.from(timeMap.values()).sort((a, b) => a.time.localeCompare(b.time));
  }, [filteredData]);

  // 5. Pull state endpoints from pre-filtered array allocations
  const localLastStats = useMemo(() => {
    const lastTemp = filteredData.temp[filteredData.temp.length - 1];
    const lastHum = filteredData.hum[filteredData.hum.length - 1];
    const lastPres = filteredData.pres[filteredData.pres.length - 1];

    return {
      temp: lastTemp ? `${lastTemp.value.toFixed(2)} °C` : 'N/A',
      hum: lastHum ? `${lastHum.value.toFixed(2)} %` : 'N/A',
      pres: lastPres ? `${lastPres.value.toFixed(1)} hPa` : 'N/A'
    };
  }, [filteredData]);

  const selectedPoint = useMemo(() => {
    if (!selectedMessage) return null;
    const cleanTime = formatTimestampTime(selectedMessage.createAt);
    return unifiedData.find(d => d.id === selectedMessage.id || d.time === cleanTime);
  }, [unifiedData, selectedMessage]);

  return (
    <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm lg:col-span-2 flex flex-col justify-between h-full min-h-120">
      <div className="space-y-4">
        {/* Metric Chart Toolbar Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-b-slate-100 pb-4">
          <div>
            <h3 className="font-semibold text-slate-700">Environmental Monitors History</h3>
            <p className="text-[11px] text-slate-400">Analyze chronological charts inside space segments.</p>
          </div>

          <div className="flex bg-slate-50 p-1 rounded-lg border border-slate-200/60 self-start sm:self-auto">
            {(['local', 'all'] as const).map((scope) => (
              <button
                key={scope}
                disabled={scope === 'local' && !selectedMessage}
                onClick={() => setChartScope(scope)}
                className={`text-[10px] font-bold px-2.5 py-1 rounded-md transition-all disabled:opacity-40 uppercase tracking-wide ${
                  chartScope === scope ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                {scope === 'local' ? 'Selected Sector' : 'All Locations'}
              </button>
            ))}
          </div>
        </div>

        {/* Sector Last Read Values Metric Display Cards */}
        {chartScope === 'local' && selectedMessage && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
            <StatBadge 
              icon={<div className="p-1.5 bg-blue-100 text-blue-700 rounded-md"><MapPin size={12} /></div>}
              label="Sector Center"
              value={selectedSectorCenter ? `X:${selectedSectorCenter.x} Y:${selectedSectorCenter.y}` : 'N/A'}
            />
            <StatBadge 
              icon={<div className="p-1.5 bg-amber-100 text-amber-700 rounded-md"><Activity size={12} /></div>}
              label="Sector Last Temp"
              value={localLastStats.temp}
              border
            />
            <StatBadge 
              icon={<div className="p-1.5 bg-sky-100 text-sky-700 rounded-md"><Droplets size={12} /></div>}
              label="Sector Last Hum"
              value={localLastStats.hum}
              border
            />
            <StatBadge 
              icon={<div className="p-1.5 bg-purple-100 text-purple-700 rounded-md"><Gauge size={12} /></div>}
              label="Sector Last Baro"
              value={localLastStats.pres}
              border
            />
          </div>
        )}
      </div>

      {/* Visual Chart Frame Layout */}
      <div className="w-full flex-1 h-77.5 mt-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={unifiedData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
            <defs>
              {[['tempGradient', '#f59e0b'], ['humidityGradient', '#0ea5e9'], ['pressureGradient', '#8b5cf6']].map(([id, color]) => (
                <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.15}/>
                  <stop offset="95%" stopColor={color} stopOpacity={0}/>
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="time" stroke="#94a3b8" fontSize={10} tickLine={false} />
            <YAxis yAxisId="left" stroke="#94a3b8" fontSize={10} tickLine={false} domain={['auto', 'auto']} />
            <YAxis yAxisId="right" orientation="right" stroke="#94a3b8" fontSize={10} tickLine={false} domain={['auto', 'auto']} />
            
            <Tooltip contentStyle={{ borderRadius: '8px', borderColor: '#f1f5f9', fontSize: '11px' }} />
            <Legend verticalAlign="top" height={32} iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
            
            <Area yAxisId="left" name="Temperature (°C)" type="monotone" dataKey="Temperature" stroke="#f59e0b" strokeWidth={2} fill="url(#tempGradient)" connectNulls />
            <Area yAxisId="left" name="Humidity (%)" type="monotone" dataKey="Humidity" stroke="#0ea5e9" strokeWidth={2} fill="url(#humidityGradient)" connectNulls />
            <Area yAxisId="right" name="Pressure (hPa)" type="monotone" dataKey="Pressure" stroke="#8b5cf6" strokeWidth={2} fill="url(#pressureGradient)" connectNulls />

            {selectedPoint?.Temperature !== undefined && (
              <ReferenceDot yAxisId="left" x={selectedPoint.time} y={selectedPoint.Temperature} r={5} fill="#d97706" stroke="#ffffff" strokeWidth={2} />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}