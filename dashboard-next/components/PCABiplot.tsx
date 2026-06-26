"use client";
import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
} from 'recharts';
import { Sparkles, Thermometer, Droplets, Gauge } from 'lucide-react';
import type { MQTTMessage } from './DashboardClientWrapper';
import { computePCA, type PCAObservation } from '../lib/pca';

interface PCABiplotProps {
  messages: MQTTMessage[];
}

// Configurable clustering spatial grid resolution (in meters)
const CLUSTER_SIZE = 2;

// Uniform lowercase keys matching clean normalizer tokens
const ZONE_LOW = 'low';
const ZONE_INTERMEDIATE = 'intermediate';
const ZONE_HIGH = 'high';

// Human-readable labels used consistently for the chart scores and filtering
const DISPLAY_LOW = 'Low (0-0.3 m)';
const DISPLAY_INTERMEDIATE = 'Intermediate (0.3-0.6 m)';
const DISPLAY_HIGH = 'High (0.6 m+)';

const ZONE_COLORS: Record<string, string> = {
  [DISPLAY_LOW]: '#0ea5e9',
  [DISPLAY_INTERMEDIATE]: '#6366f1',
  [DISPLAY_HIGH]: '#f43f5e',
};

const VARIABLE_COLORS: Record<string, string> = {
  Temperature: '#f59e0b',
  Humidity: '#0ea5e9',
  Pressure: '#8b5cf6',
};

const LOADING_SCALE = 3;

export default function PCABiplot({ messages }: PCABiplotProps) {
  // Use the exact options array for the pill toggles
  const [activeZone, setActiveZone] = useState<string>('All');

  // Build co-located, simultaneous (T,H,P) observations clustered by custom spatial bins and minute chunks
  const observations = useMemo<PCAObservation[]>(() => {
    const groups = new Map<string, { t: number[]; h: number[]; p: number[]; z: string }>();
    const minute = (t: string) => t.slice(0, 16);

    for (const msg of messages) {
      if (!msg.temperature || !msg.humidity || !msg.pressure) continue;

      const tVal = parseFloat(msg.temperature);
      const hVal = parseFloat(msg.humidity);
      const pVal = parseFloat(msg.pressure);

      if (!Number.isFinite(tVal) || !Number.isFinite(hVal) || !Number.isFinite(pVal)) continue;

      // CLUSTERING OPTIMIZATION: Cluster neighboring points into a shared index bin 
      // by dividing by the cluster size, flooring, and scaling back.
      const xCluster = Math.floor(msg.x / CLUSTER_SIZE) * CLUSTER_SIZE + (CLUSTER_SIZE / 2);
      const yCluster = Math.floor(msg.y / CLUSTER_SIZE) * CLUSTER_SIZE + (CLUSTER_SIZE / 2);
      
      const rawZone = typeof msg.z === 'string' ? msg.z.trim().toLowerCase() : 'intermediate';
      const timeBucket = minute(msg.createAt || '');

      // Compound key matching coordinates clustering, time context, and height layer
      const key = `${xCluster.toFixed(2)}_${yCluster.toFixed(2)}_${timeBucket}_${rawZone}`;

      if (!groups.has(key)) {
        groups.set(key, { t: [], h: [], p: [], z: rawZone });
      }
      
      const group = groups.get(key)!;
      group.t.push(tVal);
      group.h.push(hVal);
      group.p.push(pVal);
    }

    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const result: PCAObservation[] = [];

    for (const group of groups.values()) {
      if (!group.t.length || !group.h.length || !group.p.length) continue;
      
      let displayZone = DISPLAY_INTERMEDIATE;
      if (group.z.includes('low')) displayZone = DISPLAY_LOW;
      if (group.z.includes('high')) displayZone = DISPLAY_HIGH;

      result.push({
        temperature: avg(group.t),
        humidity: avg(group.h),
        pressure: avg(group.p),
        zone: displayZone,
      });
    }

    return result;
  }, [messages]);

  const pca = useMemo(() => computePCA(observations), [observations]);

  const axisDomain = useMemo<[number, number]>(() => {
    if (!pca) return [-4, 4];
    let max = LOADING_SCALE * 1.15;
    for (const s of pca.scores) {
      max = Math.max(max, Math.abs(s.pc1), Math.abs(s.pc2));
    }
    const padded = Math.ceil(max);
    return [-padded, padded];
  }, [pca]);

  const filteredScores = useMemo(() => {
    if (!pca) return [];
    if (activeZone === 'All') return pca.scores;
    
    let targetDisplayLabel = DISPLAY_INTERMEDIATE;
    if (activeZone === ZONE_LOW) targetDisplayLabel = DISPLAY_LOW;
    if (activeZone === ZONE_HIGH) targetDisplayLabel = DISPLAY_HIGH;

    return pca.scores.filter(s => s.zone === targetDisplayLabel);
  }, [pca, activeZone]);

  if (!pca) {
    return (
      <div className="bg-white p-10 rounded-xl border border-slate-100 shadow-sm text-center font-sans">
        <p className="text-sm text-slate-500">Not enough complete temperature, humidity and pressure samples to compute PCA.</p>
      </div>
    );
  }

  const pc1Pct = (pca.explained[0] * 100).toFixed(1);
  const pc2Pct = (pca.explained[1] * 100).toFixed(1);
  const cumPct = ((pca.explained[0] + pca.explained[1]) * 100).toFixed(1);

  const filterOptions = ['All', ZONE_LOW, ZONE_INTERMEDIATE, ZONE_HIGH];

  return (
    <div className="space-y-4 font-sans">
      {/* Variance summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-100 shadow-sm">
          <p className="text-[10px] text-slate-400 font-semibold uppercase">Samples Analyzed (Clustered)</p>
          <h2 className="text-base font-bold text-slate-900 mt-0.5 font-mono">{pca.sampleCount}</h2>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-100 shadow-sm">
          <p className="text-[10px] text-slate-400 font-semibold uppercase">PC1 Variance</p>
          <h2 className="text-base font-bold text-amber-600 mt-0.5 font-mono">{pc1Pct}%</h2>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-100 shadow-sm">
          <p className="text-[10px] text-slate-400 font-semibold uppercase">PC2 Variance</p>
          <h2 className="text-base font-bold text-indigo-600 mt-0.5 font-mono">{pc2Pct}%</h2>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-100 shadow-sm">
          <p className="text-[10px] text-slate-400 font-semibold uppercase">Cumulative (PC1+PC2)</p>
          <h2 className="text-base font-bold text-slate-900 mt-0.5 font-mono">{cumPct}%</h2>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Biplot Canvas */}
        <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm lg:col-span-2 flex flex-col min-h-[30rem] min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4 mb-3">
            <div>
              <h3 className="font-semibold text-slate-700">PCA Biplot — PC1 vs PC2</h3>
              <p className="text-[11px] text-slate-400">Standardized environmental variables (Temperature, Humidity, Pressure).</p>
            </div>
            
            {/* Pill-shaped Tab Filter */}
            <div className="flex bg-slate-50 p-1 rounded-lg border border-slate-200/60 self-start sm:self-auto shrink-0">
              {filterOptions.map((zone) => {
                const label = zone === 'All' ? 'All' : zone === 'intermediate' ? 'Inter.' : zone;
                return (
                  <button
                    key={zone}
                    onClick={() => setActiveZone(zone)}
                    className={`text-[10px] font-bold px-2.5 py-1 rounded-md transition-all uppercase tracking-wide ${
                      activeZone === zone ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 h-[22rem] min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 15, right: 25, bottom: 15, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  type="number"
                  dataKey="pc1"
                  name="PC1"
                  domain={axisDomain}
                  tickCount={9}
                  fontSize={10}
                  stroke="#94a3b8"
                  label={{ value: `PC1 (${pc1Pct}%)`, position: 'insideBottom', offset: -8, fontSize: 10, fill: '#64748b', fontWeight: 600 }}
                />
                <YAxis
                  type="number"
                  dataKey="pc2"
                  name="PC2"
                  domain={axisDomain}
                  tickCount={9}
                  fontSize={10}
                  stroke="#94a3b8"
                  label={{ value: `PC2 (${pc2Pct}%)`, angle: -90, position: 'insideLeft', offset: 15, fontSize: 10, fill: '#64748b', fontWeight: 600 }}
                />
                <ZAxis range={[45, 45]} />
                <ReferenceLine x={0} stroke="#cbd5e1" strokeWidth={1} />
                <ReferenceLine y={0} stroke="#cbd5e1" strokeWidth={1} />

                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    if (active && payload?.length) {
                      const d = payload[0].payload;
                      return (
                        <div className="bg-slate-900 text-white font-mono text-[10px] p-2 rounded-md shadow-md space-y-0.5">
                          <p className="text-blue-400 font-bold">{d.zone}</p>
                          <p>PC1: {d.pc1.toFixed(2)} | PC2: {d.pc2.toFixed(2)}</p>
                          <p>T: {d.temperature.toFixed(2)} °C</p>
                          <p>H: {d.humidity.toFixed(2)} %</p>
                          <p>P: {d.pressure.toFixed(1)} hPa</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />

                <Scatter name="Observations" data={filteredScores}>
                  {filteredScores.map((s, i) => (
                    <Cell key={`pca-${i}`} fill={ZONE_COLORS[s.zone] ?? '#3b82f6'} fillOpacity={0.55} />
                  ))}
                </Scatter>

                {/* Loading vectors */}
                {pca.loadings.map((loading) => {
                  const color = VARIABLE_COLORS[loading.variable] ?? '#475569';
                  return (
                    <ReferenceLine
                      key={loading.variable}
                      stroke={color}
                      strokeWidth={2.5}
                      segment={[
                        { x: 0, y: 0 },
                        { x: loading.pc1 * LOADING_SCALE, y: loading.pc2 * LOADING_SCALE },
                      ]}
                      label={{
                        value: loading.variable,
                        position: 'end',
                        fill: color,
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    />
                  );
                })}
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Loadings / interpretation panel */}
        <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm lg:col-span-1 flex flex-col min-h-[30rem] min-w-0">
          <div className="border-b border-slate-100 pb-4 mb-4">
            <h3 className="font-semibold text-slate-700 flex items-center gap-2">
              <Sparkles size={15} className="text-indigo-500" />
              Component Loadings
            </h3>
            <p className="text-[11px] text-slate-400">Variable contribution to each principal component.</p>
          </div>

          <div className="space-y-3">
            {pca.loadings.map((loading) => {
              const Icon = loading.variable === 'Temperature' ? Thermometer : loading.variable === 'Humidity' ? Droplets : Gauge;
              return (
                <div key={loading.variable} className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-1.5 rounded-md" style={{ backgroundColor: `${VARIABLE_COLORS[loading.variable]}20`, color: VARIABLE_COLORS[loading.variable] }}>
                      <Icon size={13} />
                    </div>
                    <p className="text-xs font-bold text-slate-700">{loading.variable}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">PC1</p>
                      <p className="text-xs font-mono font-bold text-slate-700">{loading.pc1.toFixed(3)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">PC2</p>
                      <p className="text-xs font-mono font-bold text-slate-700">{loading.pc2.toFixed(3)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-auto pt-4">
            <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-3">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-indigo-400 mb-1">How to read</p>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Each point is a clustered, co-located, simultaneous T/H/P reading projected onto the first two principal components.
                Arrows show how each variable loads onto PC1/PC2 — points near an arrow score high on that variable.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}