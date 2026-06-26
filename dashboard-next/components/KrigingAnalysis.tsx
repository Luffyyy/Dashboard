/**
 * משאיר את זה לחברה שעושים פרויקט, לא רלוונטי יותר אלינו
 */


// 'use client';

// import React, { useMemo } from 'react';
// import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ScatterChart, Scatter, Cell } from 'recharts';
// import { CheckCircle, AlertCircle, Info, ThermometerSun, Droplets } from 'lucide-react';
// import type { MQTTMessage } from './DashboardClientWrapper';
// import { computePCA, type PCAObservation } from '../lib/pca';

// interface KrigingAnalysisProps {
//   messages: MQTTMessage[];
// }

// type KrigingPoint = {
//   x: number;
//   y: number;
//   pc1: number;
//   pc2: number;
// };

// type KrigingAnalysisState = {
//   error?: string;
//   spatialStats: {
//     moransPC1: number;
//     moransPC2: number;
//     structurePC1: string;
//     structurePC2: string;
//     observedCount: number;
//     stdPC1: number;
//     stdPC2: number;
//   } | null;
//   predictions: KrigingPoint[];
//   predictionsByDistance: Array<{ distance: string; count: number; avgPC1: number; avgPC2: number }>;
//   observedPoints: KrigingPoint[];
// };

// // --- MATHEMATICAL HELPERS ---

// function interpolateCartesianIDW(
//   points: KrigingPoint[],
//   gridSize: number = 5,
//   step: number = 0.5
// ) {
//   const predictions: KrigingPoint[] = [];
//   for (let x = 0; x <= gridSize; x += step) {
//     for (let y = 0; y <= gridSize; y += step) {
//       let num1 = 0, num2 = 0, den = 0;
//       let exactMatch = null;
      
//       for (const p of points) {
//         const dist = Math.sqrt(Math.pow(x - p.x, 2) + Math.pow(y - p.y, 2));
//         if (dist < 1) { 
//           exactMatch = p; 
//           break; 
//         }
//         if (dist < 5) {
//           const w = 1 / Math.pow(dist, 2);
//           num1 += w * p.pc1; 
//           num2 += w * p.pc2; 
//           den += w;
//         }
//       }
      
//       if (exactMatch) {
//         predictions.push({ x, y, pc1: exactMatch.pc1, pc2: exactMatch.pc2 });
//       } else if (den > 0) {
//         predictions.push({ x, y, pc1: num1 / den, pc2: num2 / den });
//       }
//     }
//   }
//   return predictions;
// }

// function calculateMoransI(points: Array<{ x: number; y: number; value: number }>): number {
//   if (points.length < 3) return 0;
//   const n = points.length;
//   const meanValue = points.reduce((sum, p) => sum + p.value, 0) / n;
//   let sumWeights = 0;
//   let numerator = 0;

//   for (let i = 0; i < n; i++) {
//     for (let j = 0; j < n; j++) {
//       if (i === j) continue;
//       const distance = Math.sqrt(Math.pow(points[i].x - points[j].x, 2) + Math.pow(points[i].y - points[j].y, 2));
//       if (distance > 0 && distance < 5) { 
//         const weight = 1 / distance; 
//         numerator += weight * (points[i].value - meanValue) * (points[j].value - meanValue);
//         sumWeights += weight;
//       }
//     }
//   }

//   const denominatorSum = points.reduce((sum, p) => sum + Math.pow(p.value - meanValue, 2), 0);
//   if (sumWeights === 0 || denominatorSum === 0) return 0;
//   return Math.min(1, Math.max(-1, (n / sumWeights) * (numerator / denominatorSum))); 
// }

// /**
//  * Custom Color Scale Generator: Transitions through a visible Light Slate Midpoint
//  * for clear contrast against white surfaces.
//  */
// const getHeatmapColor = (value: number, isThermal: boolean) => {
//   const v = Math.max(0, Math.min(1, (value + 3) / 6)); // Normalize Z-Score bounds (-3 to +3) into 0-1
  
//   if (isThermal) {
//     // Thermal (PC2): Low = Hot (Red) -> Neutral (Light Slate) -> High = Cold (Blue)
//     if (v < 0.5) {
//       const pct = v * 2; // 0 to 1
//       const s = 80 - (pct * 60); // Desaturate towards slate
//       const l = 50 + (pct * 38); // Lighten towards slate
//       return `hsl(0, ${s}%, ${l}%)`;
//     } else {
//       const pct = (v - 0.5) * 2; // 0 to 1
//       const s = 20 + (pct * 60); // Resaturate towards blue
//       const l = 88 - (pct * 38); // Darken towards standard blue
//       return `hsl(240, ${s}%, ${l}%)`;
//     }
//   } else {
//     // Density (PC1): Low = Dry (Amber) -> Neutral (Light Slate) -> High = Humid (Blue)
//     if (v < 0.5) {
//       const pct = v * 2;
//       const s = 90 - (pct * 70); 
//       const l = 50 + (pct * 38); 
//       return `hsl(35, ${s}%, ${l}%)`;
//     } else {
//       const pct = (v - 0.5) * 2;
//       const s = 20 + (pct * 70); 
//       const l = 88 - (pct * 33); 
//       return `hsl(210, ${s}%, ${l}%)`;
//     }
//   }
// };

// // --- MODULAR UI COMPONENTS ---

// const StatCard = ({ title, value, subtitle, color = "slate" }: { title: string, value: string | number, subtitle?: string, color?: string }) => (
//   <div className={`bg-${color}-50 p-4 rounded-lg border border-${color}-100 text-center flex flex-col justify-center`}>
//     <p className={`text-xs text-${color}-600 font-bold uppercase tracking-wider`}>{title}</p>
//     <p className={`text-2xl font-bold text-${color}-900 mt-1`}>{value}</p>
//     {subtitle && <p className={`text-xs text-${color}-600 font-medium mt-2`}>{subtitle}</p>}
//   </div>
// );

// const UnifiedMapLegend = () => (
//   <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl mt-6 flex flex-col md:flex-row items-center gap-6 justify-center text-xs font-medium text-slate-600">
//     <div className="flex items-center gap-2 shrink-0">
//       <Info size={16} className="text-slate-500" />
//       <span className="font-bold text-slate-800 uppercase tracking-wide">Unified Map Legend:</span>
//     </div>
    
//     <div className="flex flex-wrap gap-x-6 gap-y-3 justify-center md:border-l border-slate-300 md:pl-6">
//       <div className="flex items-center gap-2">
//         <div className="w-24 h-3 rounded bg-linear-to-r from-red-500 via-slate-200 to-blue-500 border border-slate-200" />
//         <span><strong className="text-slate-800">Thermal (PC2):</strong> Red (Hot) &rarr; Gray (Neutral) &rarr; Blue (Cool)</span>
//       </div>
//       <div className="flex items-center gap-2">
//         <div className="w-24 h-3 rounded bg-linear-to-r from-amber-500 via-slate-200 to-blue-600 border border-slate-200" />
//         <span><strong className="text-slate-800">Density (PC1):</strong> Amber (Dry) &rarr; Gray (Neutral) &rarr; Blue (Humid)</span>
//       </div>
//       <div className="flex items-center gap-2">
//         <div className="w-3 h-3 bg-slate-900 rotate-45" />
//         <span className="text-slate-800 font-semibold">Observed Sensor Node</span>
//       </div>
//     </div>
//   </div>
// );

// const InterpolationSurfaceMap = ({
//   title,
//   description,
//   predictions,
//   observedPoints,
//   valueKey,
//   isThermal,
//   Icon,
// }: {
//   title: string;
//   description: string;
//   predictions: KrigingPoint[];
//   observedPoints: KrigingPoint[];
//   valueKey: 'pc1' | 'pc2';
//   isThermal: boolean;
//   Icon: React.ComponentType<{ size?: number; className?: string }>;
// }) => {
//   const iconColor = isThermal ? "text-indigo-600" : "text-sky-600";
  
//   return (
//     <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col">
//       <div className="flex items-center gap-2 mb-2">
//         <Icon size={20} className={iconColor} />
//         <h3 className="text-lg font-bold text-slate-800">{title}</h3>
//       </div>
//       <p className="text-sm text-slate-500 mb-6 grow">{description}</p>
      
//       <div className="w-full aspect-square bg-slate-50 rounded-xl border border-slate-200 p-4">
//         <ResponsiveContainer width="100%" height="100%">
//           <ScatterChart margin={{ top: 10, right: 10, bottom: 20, left: 0 }}>
//             <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
//             <XAxis type="number" dataKey="x" domain={[0, 5]} tickCount={6} fontSize={10} stroke="#64748b" label={{ value: 'Room X (m)', position: 'insideBottom', offset: -10, fill: '#475569', fontWeight: 600, fontSize: 11 }} />
//             <YAxis type="number" dataKey="y" domain={[0, 5]} tickCount={6} fontSize={10} stroke="#64748b" label={{ value: 'Room Y (m)', angle: -90, position: 'insideLeft', fill: '#475569', fontWeight: 600, fontSize: 11 }} />
//             <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }} formatter={(value: unknown) => typeof value === 'number' ? value.toFixed(3) : String(value)} labelFormatter={() => ''} />
            
//             <Scatter name="Interpolated Surface" data={predictions}>
//               {predictions.map((point, idx) => (
//                 <Cell key={`pred-${idx}`} fill={getHeatmapColor(point[valueKey], isThermal)} fillOpacity={0.8} />
//               ))}
//             </Scatter>
            
//             {observedPoints && (
//               <Scatter name="Measured Locations" data={observedPoints} fill="#0f172a" shape="diamond">
//                 {observedPoints.map((_, idx) => <Cell key={`obs-${idx}`} fill="#0f172a" />)}
//               </Scatter>
//             )}
//           </ScatterChart>
//         </ResponsiveContainer>
//       </div>
//     </div>
//   );
// };

// // --- MAIN DASHBOARD COMPONENT ---

// export default function KrigingAnalysis({ messages }: KrigingAnalysisProps) {
//   const analysis = useMemo<KrigingAnalysisState>(() => {
//     if (!messages.length) return { error: 'No data available', spatialStats: null, predictions: [], predictionsByDistance: [], observedPoints: [] };

//     const groups = new Map<string, { t: number[]; h: number[]; p: number[]; x: number; y: number; z: number }>();
//     messages.forEach((msg) => {
//       const topic = msg.topic.includes('temp') ? 't' : msg.topic.includes('humidity') ? 'h' : msg.topic.includes('pressure') ? 'p' : null;
//       if (!topic) return;
//       const xg = Math.round(msg.x * 2) / 2;
//       const yg = Math.round(msg.y * 2) / 2;
//       const key = `${xg}_${yg}_${msg.createAt.slice(0, 16)}`;
      
//       if (!groups.has(key)) groups.set(key, { t: [], h: [], p: [], x: xg, y: yg, z: msg.z });
//       groups.get(key)![topic].push(parseFloat(msg.payload));
//     });

//     const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
//     const observations: PCAObservation[] = [];
//     const spatialCoords: Array<{ x: number; y: number }> = [];

//     for (const g of groups.values()) {
//       if (g.t.length && g.h.length && g.p.length) {
//         observations.push({ temperature: avg(g.t), humidity: avg(g.h), pressure: avg(g.p), zone: 'Ignored' });
//         spatialCoords.push({ x: g.x, y: g.y });
//       }
//     }

//     if (observations.length < 3) {
//       return { error: 'Insufficient spatial data combinations to map surface.', spatialStats: null, predictions: [], predictionsByDistance: [], observedPoints: [] };
//     }

//     const pca = computePCA(observations);
//     if (!pca) {
//       return { error: 'PCA computation failed.', spatialStats: null, predictions: [], predictionsByDistance: [], observedPoints: [] };
//     }

//     const uniqueSpatialMap = new Map<string, { x: number; y: number; sumPC1: number; sumPC2: number; count: number }>();
//     pca.scores.forEach((score, idx) => {
//       const p = { x: spatialCoords[idx].x, y: spatialCoords[idx].y, pc1: score.pc1, pc2: score.pc2 };
//       const key = `${p.x}_${p.y}`;
//       if (!uniqueSpatialMap.has(key)) uniqueSpatialMap.set(key, { x: p.x, y: p.y, sumPC1: 0, sumPC2: 0, count: 0 });
//       const entry = uniqueSpatialMap.get(key)!;
//       entry.sumPC1 += p.pc1;
//       entry.sumPC2 += p.pc2;
//       entry.count += 1;
//     });

//     const observedPoints: KrigingPoint[] = Array.from(uniqueSpatialMap.values()).map(p => ({ x: p.x, y: p.y, pc1: p.sumPC1 / p.count, pc2: p.sumPC2 / p.count }));
//     const interpolatedGrid = interpolateCartesianIDW(observedPoints, 5, 0.5);

//     const moransPC1 = calculateMoransI(observedPoints.map(p => ({ x: p.x, y: p.y, value: p.pc1 })));
//     const moransPC2 = calculateMoransI(observedPoints.map(p => ({ x: p.x, y: p.y, value: p.pc2 })));
    
//     const getStd = (key: 'pc1' | 'pc2') => {
//       const mean = observedPoints.reduce((sum, p) => sum + p[key], 0) / observedPoints.length;
//       return Math.sqrt(observedPoints.reduce((sum, p) => sum + Math.pow(p[key] - mean, 2), 0) / observedPoints.length);
//     };

//     const predictionsByDistance: Array<{ distance: string; count: number; avgPC1: number; avgPC2: number }> = [];
//     for (let i = 0; i <= 3; i += 1) {
//       const inZone = interpolatedGrid.filter((p) => Math.sqrt(Math.pow(p.x - 2.5, 2) + Math.pow(p.y - 2.5, 2)) >= i && Math.sqrt(Math.pow(p.x - 2.5, 2) + Math.pow(p.y - 2.5, 2)) < i + 1);
//       if (inZone.length > 0) {
//         predictionsByDistance.push({
//           distance: `${i}-${i + 1}m`, count: inZone.length,
//           avgPC1: inZone.reduce((sum, p) => sum + p.pc1, 0) / inZone.length,
//           avgPC2: inZone.reduce((sum, p) => sum + p.pc2, 0) / inZone.length,
//         });
//       }
//     }

//     return {
//       pca,
//       spatialStats: {
//         moransPC1, moransPC2,
//         structurePC1: moransPC1 > 0.4 ? 'Strong Clustering' : moransPC1 > 0.1 ? 'Moderate Clustering' : 'Random / Dispersed',
//         structurePC2: moransPC2 > 0.4 ? 'Strong Clustering' : moransPC2 > 0.1 ? 'Moderate Clustering' : 'Random / Dispersed',
//         observedCount: observedPoints.length,
//         stdPC1: getStd('pc1'), stdPC2: getStd('pc2'),
//       },
//       predictions: interpolatedGrid,
//       predictionsByDistance,
//       observedPoints,
//     };
//   }, [messages]);

//   if (analysis.error) return <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm flex items-center gap-3 text-slate-500"><AlertCircle size={20} /><p className="text-sm font-medium">{analysis.error}</p></div>;

//   const stats = analysis.spatialStats!;
//   const isSpatiallyDependent = stats.moransPC2 > 0.1 || stats.moransPC1 > 0.1;

//   return (
//     <div className="space-y-6">
      
//       {/* Hypothesis Header & PCA Explanation */}
//       <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 shadow-sm">
//         <h2 className="text-base font-bold text-blue-900">Hypothesis 2: Localized Micro-Climates</h2>
//         <p className="text-sm text-blue-800 mt-2 leading-relaxed">
//           <strong>Spatial Disturbance Pattern (Localized Micro-Climates)</strong><br />
//           There is distinct spatial heterogeneity in the climate components across the room, which is explained by horizontal distance from disturbance sources and not by vertical height (Z).
//         </p>
//         <div className="mt-4 bg-white/60 p-3 rounded-lg text-xs font-mono text-blue-900 space-y-1">
//           <p><strong>H₀ (Null):</strong> Climate components vary randomly. Moran&apos;s I &asymp; 0.</p>
//           <p><strong>H₁ (Alternative):</strong> Climate components form spatial clusters based on horizontal (X,Y) geographic position.</p>
//         </div>
//       </div>

//       {/* Moran's I Statistical Results */}
//       <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
//         <div className="flex items-start gap-4">
//           {isSpatiallyDependent ? <div className="p-2 bg-emerald-50 rounded-full"><CheckCircle className="text-emerald-600" size={24} /></div> : <div className="p-2 bg-amber-50 rounded-full"><AlertCircle className="text-amber-500" size={24} /></div>}
//           <div className="flex-1">
//             <h3 className="text-lg font-bold text-slate-800">Spatial Autocorrelation (Moran&apos;s I)</h3>
//             <p className="text-sm text-slate-600 mt-1 leading-relaxed">
//               {isSpatiallyDependent ? `Significant localized structure detected. The evaluation confirms clustering, meaning micro-climates are geographically distinct and depend on X/Y horizontal proximity.` : `Weak spatial structure detected. The micro-climate variance is highly dispersed across the horizontal plane.`}
//             </p>
//           </div>
//         </div>

//         <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
//           <StatCard title="Moran's I (Thermal PC2)" value={stats.moransPC2.toFixed(3)} subtitle={stats.structurePC2} color="indigo" />
//           <StatCard title="Moran's I (Density PC1)" value={stats.moransPC1.toFixed(3)} subtitle={stats.structurePC1} color="sky" />
//           <StatCard title="Unique Grid Nodes" value={stats.observedCount} color="slate" />
//           <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 flex flex-col justify-center">
//             <div className="flex justify-between items-center mb-1 text-xs"><span className="text-slate-500 font-medium">PC1 Std Dev:</span><span className="font-bold text-slate-800">{stats.stdPC1.toFixed(3)}</span></div>
//             <div className="flex justify-between items-center text-xs"><span className="text-slate-500 font-medium">PC2 Std Dev:</span><span className="font-bold text-slate-800">{stats.stdPC2.toFixed(3)}</span></div>
//           </div>
//         </div>
//       </div>

//       {/* Grid Layout for Spatial Maps */}
//       {analysis.predictions && analysis.predictions.length > 0 && (
//         <>
//           <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
//             <InterpolationSurfaceMap 
//               title="Thermal Micro-Climate (PC2)" 
//               description="Standardized matrix scale mapping thermal properties. Red areas emphasize low PC2 scores (localized heat plumes) while Blue surfaces show high PC2 scores (cooling outputs)." 
//               predictions={analysis.predictions} observedPoints={analysis.observedPoints} valueKey="pc2" isThermal={true} Icon={ThermometerSun} 
//             />
//             <InterpolationSurfaceMap 
//               title="Density Micro-Climate (PC1)" 
//               description="Correlates directly with baseline Humidity & Pressure. Mapped from Amber (drier, localized dispersion anomalies) up to deep Blue (stagnant, higher relative moisture layers)." 
//               predictions={analysis.predictions} observedPoints={analysis.observedPoints} valueKey="pc1" isThermal={false} Icon={Droplets} 
//             />
//           </div>
//           <UnifiedMapLegend />
//         </>
//       )}

//       {/* Centroid Distance Analysis */}
//       {analysis.predictionsByDistance && analysis.predictionsByDistance.length > 0 && (
//         <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
//           <h3 className="text-lg font-bold text-slate-800 mb-2">Micro-Climate Variance by Radial Distance from Center</h3>
//           <p className="text-sm text-slate-500 mb-6">Displays how the Density (PC1) and Thermal (PC2) profiles shift radially outward from the room&apos;s centroid (X:600, Y:600).</p>
//           <div className="w-full h-72">
//             <ResponsiveContainer width="100%" height="100%">
//               <BarChart data={analysis.predictionsByDistance} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
//                 <CartesianGrid strokeDasharray="3 3" stroke="#f8fafc" />
//                 <XAxis dataKey="distance" stroke="#64748b" fontSize={11} angle={-15} textAnchor="end" />
//                 <YAxis stroke="#64748b" fontSize={11} />
//                 <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0' }} formatter={(value) => typeof value === 'number' ? value.toFixed(3) : value} />
//                 <Legend verticalAlign="top" wrapperStyle={{ paddingBottom: '16px' }} />
//                 <Bar dataKey="avgPC1" fill="#0ea5e9" radius={[4, 4, 0, 0]} name="Average PC1 (Density)" />
//                 <Bar dataKey="avgPC2" fill="#6366f1" radius={[4, 4, 0, 0]} name="Average PC2 (Thermal)" />
//               </BarChart>
//             </ResponsiveContainer>
//           </div>
//         </div>
//       )}

//       {/* Official Conclusion Block */}
//       <div className="bg-slate-50 rounded-xl border border-slate-200 p-5">
//         <h3 className="font-bold text-slate-800 mb-2 uppercase tracking-wider text-sm">Official Conclusion: Hypothesis 2</h3>
//         <p className="text-sm text-slate-700 leading-relaxed">
//           {isSpatiallyDependent ? `Hypothesis 2 is Confirmed. The spatial autocorrelation assessment mathematically proves that the principal components are not randomly distributed. The generated spatial surface maps clearly illustrate the formation of distinct, localized horizontal micro-climates driven by physical (X,Y) geographic proximity to disturbances.` : `Hypothesis 2 cannot be conclusively confirmed. The spatial autocorrelation is weak. While minor localized variations exist, the environmental micro-climate values are heavily mixed and dispersed randomly across the horizontal plane.`}
//         </p>
//       </div>
//     </div>
//   );
// }

