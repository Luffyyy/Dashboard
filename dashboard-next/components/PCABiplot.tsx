"use client";
import React, { useMemo } from 'react';
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
import { Sparkles, Thermometer, Droplets, Gauge, Info } from 'lucide-react';
import type { MQTTMessage } from './DashboardClientWrapper';
import { computePCA, type PCAObservation } from '../lib/pca';

interface PCABiplotProps {
  messages: MQTTMessage[];
}

const ZONE_LOW = 'low';
const ZONE_INTERMEDIATE = 'intermediate';
const ZONE_HIGH = 'high';

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

const LOADING_SCALE = 2;

// VISUAL OPTIMIZATION ONLY: Combines SVG dots that land within 0.15 units of each other on the graph.
const VISUAL_GRID_RESOLUTION = 0.15; 
// STATISTICAL OUTLIER THRESHOLD: Drops points further than this many standard deviations from the mean.
const Z_SCORE_THRESHOLD = 3.5;

export default function PCABiplot({ messages }: PCABiplotProps) {
  
  // 1. RAW DATA INGESTION & OUTLIER FILTERING
  const { observations, droppedCount } = useMemo(() => {
    const rawParsed = [];
    let sumT = 0, sumH = 0, sumP = 0;

    // Step A: Parse and gather all valid numbers
    for (const msg of messages) {
      if (!msg.temperature || !msg.humidity || !msg.pressure) continue;

      const tVal = parseFloat(msg.temperature);
      const hVal = parseFloat(msg.humidity);
      const pVal = parseFloat(msg.pressure);

      if (!Number.isFinite(tVal) || !Number.isFinite(hVal) || !Number.isFinite(pVal)) continue;

      let displayZone = DISPLAY_INTERMEDIATE;
      const zRaw = typeof msg.z === 'string' ? msg.z.toLowerCase() : '';
      if (zRaw.includes('low')) displayZone = DISPLAY_LOW;
      if (zRaw.includes('high')) displayZone = DISPLAY_HIGH;

      rawParsed.push({ tVal, hVal, pVal, displayZone });
      sumT += tVal;
      sumH += hVal;
      sumP += pVal;
    }

    if (rawParsed.length === 0) return { observations: [], droppedCount: 0 };

    // Step B: Calculate Means
    const meanT = sumT / rawParsed.length;
    const meanH = sumH / rawParsed.length;
    const meanP = sumP / rawParsed.length;

    // Step C: Calculate Standard Deviations (Sigma)
    let sqDiffT = 0, sqDiffH = 0, sqDiffP = 0;
    for (const r of rawParsed) {
      sqDiffT += Math.pow(r.tVal - meanT, 2);
      sqDiffH += Math.pow(r.hVal - meanH, 2);
      sqDiffP += Math.pow(r.pVal - meanP, 2);
    }
    const stdT = Math.sqrt(sqDiffT / rawParsed.length) || 1;
    const stdH = Math.sqrt(sqDiffH / rawParsed.length) || 1;
    const stdP = Math.sqrt(sqDiffP / rawParsed.length) || 1;

    // Step D: Filter out Extreme Outliers (Z-Score filter)
    const cleanResult: PCAObservation[] = [];
    let dropped = 0;

    for (const r of rawParsed) {
      const zT = Math.abs(r.tVal - meanT) / stdT;
      const zH = Math.abs(r.hVal - meanH) / stdH;
      const zP = Math.abs(r.pVal - meanP) / stdP;

      // If any variable is wildly outside the normal bell curve, drop the entire reading
      if (zT > Z_SCORE_THRESHOLD || zH > Z_SCORE_THRESHOLD || zP > Z_SCORE_THRESHOLD) {
        dropped++;
        continue;
      }

      cleanResult.push({
        temperature: r.tVal,
        humidity: r.hVal,
        pressure: r.pVal,
        zone: r.displayZone,
      });
    }

    return { observations: cleanResult, droppedCount: dropped };
  }, [messages]);

  // 2. TRUE PCA MATH (Calculated entirely on the cleaned data)
  const pca = useMemo(() => computePCA(observations), [observations]);

  // 3. GRAPH-LEVEL CLUSTERING (Post-Processing just for browser performance)
  const visualScores = useMemo(() => {
    if (!pca) return { all: [], low: [], intermediate: [], high: [] };

    const gridMap = new Map();

    for (const s of pca.scores) {
      // Snap only the visual coordinates to a predefined graph grid
      const gridX = Math.round(s.pc1 / VISUAL_GRID_RESOLUTION) * VISUAL_GRID_RESOLUTION;
      const gridY = Math.round(s.pc2 / VISUAL_GRID_RESOLUTION) * VISUAL_GRID_RESOLUTION;
      
      const key = `${s.zone}_${gridX.toFixed(2)}_${gridY.toFixed(2)}`;

      if (!gridMap.has(key)) {
        gridMap.set(key, { 
          ...s, 
          pc1: gridX, 
          pc2: gridY, 
          weight: 1 // Tracks how many raw points this single dot represents
        });
      } else {
        const entry = gridMap.get(key);
        // Average the tooltip context so hovering is still accurate
        entry.temperature = (entry.temperature * entry.weight + s.temperature) / (entry.weight + 1);
        entry.humidity = (entry.humidity * entry.weight + s.humidity) / (entry.weight + 1);
        entry.pressure = (entry.pressure * entry.weight + s.pressure) / (entry.weight + 1);
        entry.weight += 1; 
      }
    }

    const all = Array.from(gridMap.values());
    
    return {
      all,
      low: all.filter(s => s.zone === DISPLAY_LOW),
      intermediate: all.filter(s => s.zone === DISPLAY_INTERMEDIATE),
      high: all.filter(s => s.zone === DISPLAY_HIGH),
    };
  }, [pca]);

  const axisDomain = useMemo<[number, number]>(() => {
    if (!pca) return [-4, 4];
    let max = LOADING_SCALE * 1.15;
    for (const s of pca.scores) {
      max = Math.max(max, Math.abs(s.pc1), Math.abs(s.pc2));
    }
    const padded = Math.ceil(max);
    return [-padded, padded];
  }, [pca]);

  if (!pca) {
    return (
      <div className="bg-white p-10 rounded-xl border border-slate-100 shadow-sm text-center font-sans">
        <p className="text-sm text-slate-500">Not enough complete sample distributions to calculate PCA space.</p>
      </div>
    );
  }

  // Statistics are completely tied to the RAW calculation!
  const pc1Pct = (pca.explained[0] * 100).toFixed(1);
  const pc2Pct = (pca.explained[1] * 100).toFixed(1);
  const cumPct = ((pca.explained[0] + pca.explained[1]) * 100).toFixed(1);

  const facets = [
    { title: "Low Layer (0-0.3 m)", data: visualScores.low, label: DISPLAY_LOW, filterKey: ZONE_LOW },
    { title: "Intermediate Layer (0.3-0.6 m)", data: visualScores.intermediate, label: DISPLAY_INTERMEDIATE, filterKey: ZONE_INTERMEDIATE },
    { title: "High Layer (0.6 m+)", data: visualScores.high, label: DISPLAY_HIGH, filterKey: ZONE_HIGH }
  ];

  return (
    <div className="space-y-4 font-sans">
      {/* Metrics Header Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-100 shadow-sm">
          <p className="text-[10px] text-slate-400 font-semibold uppercase">Total Samples Analyzed</p>
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
          <p className="text-[10px] text-slate-400 font-semibold uppercase">Cumulative Explained</p>
          <h2 className="text-base font-bold text-slate-900 mt-0.5 font-mono">{cumPct}%</h2>
        </div>
      </div>

      {/* Explanation Panel */}
      <div className="bg-amber-100 border border-slate-100  rounded-xl p-4 flex gap-3">
        <Info size={16} className="text-slate-400 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-500 leading-relaxed space-y-1.5">
          <p>
            <span className="font-semibold text-slate-700">PCA (Principal Component Analysis)</span> takes the
            three correlated readings — temperature, humidity, pressure — and compresses them into two new axes,
            <span className="font-semibold text-slate-700"> PC1</span> and <span className="font-semibold text-slate-700">PC2</span>,
            that capture as much of the original variation as possible. Each dot is one sensor reading projected
            onto those two axes; readings that sit close together behaved similarly across all three variables.
          </p>
          <p>
            The colored arrows are <span className="font-semibold text-slate-700">loadings</span>: they show how
            strongly each original variable pulls in the PC1/PC2 space, and in what direction. A longer arrow
            means that variable drives more of the spread you see; arrows pointing the same way mean those
            variables tend to rise and fall together, while arrows pointing opposite ways mean they trade off.
          </p>
          <p>
            Readings more than {Z_SCORE_THRESHOLD.toFixed(1)} standard deviations from the mean on any variable
            are treated as sensor glitches and excluded before the PCA is computed ({droppedCount} dropped here).
            Dots are then snapped to a light visual grid purely so overlapping points don't pile up on screen —
            this never changes the underlying math, only how densely-packed clusters are drawn; the size of each
            dot reflects how many raw readings it represents.
          </p>
        </div>
      </div>

      {/* Main Aggregated Master Biplot */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm lg:col-span-2 flex flex-col min-h-[28rem]">
          <div className="border-b border-slate-100 pb-3 mb-3 flex justify-between items-center">
            <div>
              <h3 className="font-semibold text-slate-700">Combined Overlapping Multi-Layer Space</h3>
              <p className="text-[11px] text-slate-400">Outliers ({droppedCount} removed) filtered. PCA calculated on healthy dataset.</p>
            </div>
            <div className="text-[10px] bg-slate-100 text-slate-500 px-2 py-1 rounded border border-slate-200">
              Drawing {visualScores.all.length} clustered SVG points
            </div>
          </div>
          <div className="flex-1 h-[20rem] relative">
            {/* Loading-vector key, pinned over the plot so the arrows read
                as a deliberate overlay rather than getting lost in the dots */}
            <div className="absolute top-1 right-1 z-10 bg-white/90 backdrop-blur-sm border border-slate-100 rounded-lg px-2 py-1.5 space-y-1 shadow-sm">
              {pca.loadings.map((l) => (
                <div key={`key-${l.variable}`} className="flex items-center gap-1.5">
                  <svg width="14" height="8" className="shrink-0">
                    <line x1="0" y1="4" x2="14" y2="4" stroke={VARIABLE_COLORS[l.variable as keyof typeof VARIABLE_COLORS]} strokeWidth={2.5} />
                    <circle cx="14" cy="4" r="2" fill={VARIABLE_COLORS[l.variable as keyof typeof VARIABLE_COLORS]} />
                  </svg>
                  <span className="text-[10px] text-slate-500">{l.variable}</span>
                </div>
              ))}
            </div>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" dataKey="pc1" domain={axisDomain} tickCount={7} fontSize={10} stroke="#94a3b8" />
                <YAxis type="number" dataKey="pc2" domain={axisDomain} tickCount={7} fontSize={10} stroke="#94a3b8" />
                {/* ZAxis uses the 'weight' to make denser clustered points appear slightly larger */}
                <ZAxis dataKey="weight" range={[25, 90]} />
                <ReferenceLine x={0} stroke="#cbd5e1" />
                <ReferenceLine y={0} stroke="#cbd5e1" />
                
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    if (active && payload?.length) {
                      const d = payload[0].payload;
                      return (
                        <div className="bg-slate-900 text-white font-mono text-[10px] p-2 rounded-md shadow-md space-y-0.5">
                          <p className="text-blue-400 font-bold">{d.zone}</p>
                          <p className="text-slate-400 mb-1 border-b border-slate-700 pb-1">Represents {d.weight} points</p>
                          <p>T: {d.temperature.toFixed(2)} °C</p>
                          <p>H: {d.humidity.toFixed(2)} %</p>
                          <p>P: {d.pressure.toFixed(1)} hPa</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />

                {/* Points drawn first, faded back, so the loading vectors layered on top read clearly */}
                <Scatter name="All Observations" data={visualScores.all}>
                  {visualScores.all.map((s, i) => (
                    <Cell key={`all-${i}`} fill={ZONE_COLORS[s.zone]} fillOpacity={0.25} />
                  ))}
                </Scatter>

                {/* Loadings get a white halo behind the solid stroke, plus a white-outlined
                    label — this is what actually separates them from the cloud of dots,
                    not just a thicker line. */}
                {pca.loadings.map((l) => (
                  <ReferenceLine
                    key={`load-all-halo-${l.variable}`}
                    stroke="#ffffff"
                    strokeWidth={6}
                    strokeOpacity={0.9}
                    segment={[{ x: 0, y: 0 }, { x: l.pc1 * LOADING_SCALE, y: l.pc2 * LOADING_SCALE }]}
                  />
                ))}
                {pca.loadings.map((l) => (
                  <ReferenceLine
                    key={`load-all-${l.variable}`}
                    stroke={VARIABLE_COLORS[l.variable as keyof typeof VARIABLE_COLORS]}
                    strokeWidth={3}
                    segment={[{ x: 0, y: 0 }, { x: l.pc1 * LOADING_SCALE, y: l.pc2 * LOADING_SCALE }]}
                    label={{
                      value: l.variable,
                      position: 'end',
                      fill: VARIABLE_COLORS[l.variable as keyof typeof VARIABLE_COLORS],
                      fontSize: 11,
                      fontWeight: 800,
                      stroke: '#ffffff',
                      strokeWidth: 3,
                      paintOrder: 'stroke',
                    }}
                  />
                ))}
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          {/* Legend: zones (dots) + variables (loading arrows) */}
          <div className="border-t border-slate-100 mt-3 pt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
            {Object.entries(ZONE_COLORS).map(([zone, color]) => (
              <div key={zone} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: color, opacity: 0.65 }} />
                <span className="text-[11px] text-slate-500">{zone}</span>
              </div>
            ))}
            <span className="w-px h-3.5 bg-slate-200" />
            {Object.entries(VARIABLE_COLORS).map(([variable, color]) => (
              <div key={variable} className="flex items-center gap-1.5">
                <span className="w-3.5 h-0.5 inline-block rounded-full" style={{ backgroundColor: color }} />
                <span className="text-[11px] text-slate-500">{variable} loading</span>
              </div>
            ))}
          </div>
        </div>

        {/* Component Loadings Analysis Panel */}
        <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm lg:col-span-1 flex flex-col justify-between">
          <div>
            <div className="border-b border-slate-100 pb-3 mb-4">
              <h3 className="font-semibold text-slate-700 flex items-center gap-2">
                <Sparkles size={15} className="text-indigo-500" />
                Component Loadings
              </h3>
              <p className="text-[11px] text-slate-400 mt-1">
                How much each variable contributes to PC1 (horizontal) and PC2 (vertical). Bigger magnitude = bigger influence on that axis.
              </p>
            </div>
            <div className="space-y-2.5">
              {pca.loadings.map((loading) => {
                const Icon = loading.variable === 'Temperature' ? Thermometer : loading.variable === 'Humidity' ? Droplets : Gauge;
                return (
                  <div key={loading.variable} className="bg-slate-50 border border-slate-100 rounded-xl p-2.5">
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="p-1 rounded-md" style={{ backgroundColor: `${VARIABLE_COLORS[loading.variable as keyof typeof VARIABLE_COLORS]}15`, color: VARIABLE_COLORS[loading.variable as keyof typeof VARIABLE_COLORS] }}>
                        <Icon size={12} />
                      </div>
                      <p className="text-xs font-bold text-slate-700">{loading.variable}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div>
                        <p className="text-[8px] text-slate-400 font-bold uppercase">PC1</p>
                        <p className="text-xs font-mono font-bold text-slate-600">{loading.pc1.toFixed(3)}</p>
                      </div>
                      <div>
                        <p className="text-[8px] text-slate-400 font-bold uppercase">PC2</p>
                        <p className="text-xs font-mono font-bold text-slate-600">{loading.pc2.toFixed(3)}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Small Multiples Row Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {facets.map((facet) => {
          return (
            <div key={facet.filterKey} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex flex-col">
              <div className="border-b border-slate-50 pb-2 mb-2 flex justify-between items-center">
                <h4 className="text-xs font-bold text-slate-700 flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ZONE_COLORS[facet.label] }} />
                  {facet.title}
                </h4>
              </div>
              <div className="h-[14rem] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 10, right: 15, bottom: -5, left: -15 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f8fafc" />
                    <XAxis type="number" dataKey="pc1" domain={axisDomain} tick={false} stroke="#cbd5e1" />
                    <YAxis type="number" dataKey="pc2" domain={axisDomain} tick={false} stroke="#cbd5e1" />
                    <ZAxis dataKey="weight" range={[25, 75]} />
                    <ReferenceLine x={0} stroke="#e2e8f0" strokeDasharray="2 2" />
                    <ReferenceLine y={0} stroke="#e2e8f0" strokeDasharray="2 2" />
                    <Scatter name={facet.title} data={facet.data}>
                      {facet.data.map((s, i) => (
                        <Cell key={`facet-${facet.filterKey}-${i}`} fill={ZONE_COLORS[facet.label]} fillOpacity={0.4} />
                      ))}
                    </Scatter>
                    {pca.loadings.map((l) => (
                      <ReferenceLine
                        key={`load-facet-halo-${facet.filterKey}-${l.variable}`}
                        stroke="#ffffff"
                        strokeWidth={4.5}
                        strokeOpacity={0.9}
                        segment={[{ x: 0, y: 0 }, { x: l.pc1 * LOADING_SCALE, y: l.pc2 * LOADING_SCALE }]}
                      />
                    ))}
                    {pca.loadings.map((l) => (
                      <ReferenceLine
                        key={`load-facet-${facet.filterKey}-${l.variable}`}
                        stroke={VARIABLE_COLORS[l.variable as keyof typeof VARIABLE_COLORS]}
                        strokeWidth={2}
                        segment={[{ x: 0, y: 0 }, { x: l.pc1 * LOADING_SCALE, y: l.pc2 * LOADING_SCALE }]}
                      />
                    ))}
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}