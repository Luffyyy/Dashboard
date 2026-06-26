// components/BaseANOVAResults.tsx
'use client';

import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import type { MQTTMessage } from './DashboardClientWrapper';
import { computeANOVA } from '../lib/anova';

interface MetricConfig {
  key: 'temperature' | 'humidity';
  label: string;
  unit: string;
  barColor: string;
  getConclusion: (val: number, isSignificant: boolean) => string;
  chartMinMaxPadding: number;
  nullHypothesis: string;
  altHypothesis: string;
  description: string;
  hypothesisTitle: string;
  bannerBg: string;
  bannerText: string;
  bannerBorder: string;
}

interface BaseANOVAResultsProps {
  messages: MQTTMessage[];
  config: MetricConfig;
}

export default function BaseANOVAResults({ messages, config }: BaseANOVAResultsProps) {
  const { anovaResult, chartData } = useMemo(() => {
    if (!messages.length) return { anovaResult: null, chartData: [] };

    const groups = new Map<string, { values: number[]; z: string }>();
    const minute = (t: string) => t.slice(0, 16);

    messages.forEach((msg) => {
      const rawValue = msg[config.key];
      if (rawValue === undefined || rawValue === null || rawValue === "") return;

      const xg = Math.round(msg.x * 2) / 2;
      const yg = Math.round(msg.y * 2) / 2;
      const rawZone = typeof msg.z === 'string' ? msg.z.trim().toLowerCase() : 'intermediate';
      const key = `${xg}_${yg}_${minute(msg.createAt || '')}_${rawZone}`;

      if (!groups.has(key)) {
        groups.set(key, { values: [], z: rawZone });
      }
      groups.get(key)!.values.push(parseFloat(rawValue));
    });

    const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

    const formatZone = (z: string): string => {
      if (z === 'low') return 'Low (0-0.3 m)';
      if (z === 'intermediate') return 'Intermediate (0.3-0.6 m)';
      if (z === 'high') return 'High (0.6 m+)';
      return z;
    };

    // Construct common flat array shape required by computeANOVA
    const observations = Array.from(groups.values())
      .filter((g) => g.values.length > 0)
      .map((g) => ({
        temperature: avg(g.values), // Matches internal execution key constraints of legacy lib functions
        zone: formatZone(g.z),
      }));

    if (observations.length < 3) return { anovaResult: null, chartData: [] };

    const result = computeANOVA(observations);
    const cData = result.groups.map((zone) => ({
      zone,
      [config.label]: parseFloat(result.groupStats[zone].mean.toFixed(2)),
    }));

    return { anovaResult: result, chartData: cData };
  }, [messages, config]);

  if (!anovaResult) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6 text-center text-slate-500">
        Insufficient vertical data records available to process {config.label.toLowerCase()} analytics variance.
      </div>
    );
  }

  const isSignificant = anovaResult.pValue < 0.05;
  const totalN = Object.values(anovaResult.groupStats).reduce((sum, stat) => sum + stat.count, 0);

  return (
    <div className="space-y-6">
      {/* Dynamic Hypothesis Card */}
<div className={`${config.bannerBg} border ${config.bannerBorder} rounded-xl p-5 shadow-sm`}>
  <div className="flex flex-col gap-1.5">
    <span className={`text-[10px] uppercase font-bold tracking-wider ${config.bannerText} opacity-70`}>
      One-Way ANOVA Framework
    </span>
    <h3 className={`font-bold ${config.bannerText} text-base`}>
      {config.hypothesisTitle}
    </h3>
  </div>
  <p className="text-sm text-slate-700 font-medium mt-2 max-w-3xl leading-relaxed">
    {config.description}
  </p>
  
  <div className="mt-4 pt-3.5 border-t border-slate-200/60 grid grid-cols-1 md:grid-cols-2 gap-4">
    <div className="bg-white/70 backdrop-blur-sm p-3 rounded-lg border border-slate-100 flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Null Hypothesis</span>
        <span className="text-xs font-bold font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-800">H₀</span>
      </div>
      <div className="text-sm font-black font-mono text-slate-900 my-0.5 tracking-wide">
        {config.nullHypothesis.formula}
      </div>
      <div className="text-xs text-slate-600 leading-normal font-medium">
        {config.nullHypothesis.meaning}
      </div>
    </div>

    <div className="bg-white/70 backdrop-blur-sm p-3 rounded-lg border border-slate-100 flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Alternative Hypothesis</span>
        <span className="text-xs font-bold font-mono px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">H₁</span>
      </div>
      <div className="text-sm font-black font-mono text-slate-900 my-0.5 tracking-wide">
        {config.altHypothesis.formula}
      </div>
      <div className="text-xs text-slate-600 leading-normal font-medium">
        {config.altHypothesis.meaning}
      </div>
    </div>
  </div>
</div>

      {/* Test Verdict Statement */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <div className="flex items-start gap-3 mb-4">
          {isSignificant ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          )}
          <div>
            <h3 className="font-semibold text-slate-900 text-sm">ANOVA Test Analysis Output</h3>
            <p className={`text-xs ${isSignificant ? 'text-emerald-700' : 'text-amber-700'} mt-1 font-medium leading-relaxed`}>
              {isSignificant 
                ? `Significant: p = ${anovaResult.pValue.toExponential(4)} < 0.05. There is a statistically significant difference in ${config.label.toLowerCase()} profiles across vertical height zones.` 
                : `Not significant: p = ${anovaResult.pValue.toFixed(6)} >= 0.05. Uniform metrics noted; no distinct height profile layout distribution detected.`}
            </p>
          </div>
        </div>

        {/* Statistical Parameters Board */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mt-5">
          {[
            { label: 'F-Statistic', value: anovaResult.fValue.toFixed(3) },
            { label: 'p-value', value: anovaResult.pValue < 0.0001 ? '< 0.0001' : anovaResult.pValue.toFixed(4), highlight: true },
            { label: 'Degrees of Freedom', value: `${anovaResult.dfBetween} / ${anovaResult.dfWithin}` },
            { label: 'Effect Size (η²)', value: anovaResult.effectSize.toFixed(4) },
            { label: 'Sample Size (N)', value: totalN },
            { label: 'Groups (k)', value: anovaResult.groups.length },
          ].map((stat) => (
            <div key={stat.label} className="bg-slate-50 p-3 rounded-lg border border-slate-100">
              <p className="text-[11px] text-slate-500 font-medium">{stat.label}</p>
              <p className={`text-base font-bold font-mono mt-0.5 ${stat.highlight ? (isSignificant ? 'text-emerald-700' : 'text-amber-700') : 'text-slate-900'}`}>
                {stat.value}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Render Chart Layer */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <h3 className="font-semibold text-slate-900 text-sm mb-1">Mean {config.label} by Height Zone</h3>
        <p className="text-xs text-slate-500 mb-4">Calculated group means aggregated using localized sampling groups.</p>
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="zone" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis domain={[`dataMin - ${config.chartMinMaxPadding}`, `dataMax + ${config.chartMinMaxPadding}`]} tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: '#f8fafc' }}
                contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgb(0 0 0 / 0.05)' }}
                formatter={(value: number) => [`${value} ${config.unit}`, `Mean ${config.label}`]}
              />
              <Bar dataKey={config.label} fill={config.barColor} radius={[4, 4, 0, 0]} maxBarSize={50} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Standard Descriptive Matrix Table */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <h3 className="font-semibold text-slate-900 text-sm mb-3">Descriptive Statistics Table</h3>
        <div className="overflow-x-auto rounded-lg border border-slate-100">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-600 font-medium">
                <th className="px-4 py-3">Zone</th>
                <th className="px-4 py-3 text-right">Count (N)</th>
                <th className="px-4 py-3 text-right">Mean {config.label}</th>
                <th className="px-4 py-3 text-right">Variance</th>
                <th className="px-4 py-3 text-right">Std Deviation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {anovaResult.groups.map((zone, idx) => {
                const stat = anovaResult.groupStats[zone];
                return (
                  <tr key={zone} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}>
                    <td className="px-4 py-2.5 font-medium text-slate-900">{zone}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-600">{stat.count}</td>
                    <td className="px-4 py-2.5 text-right font-semibold font-mono text-slate-800">
                      {stat.mean.toFixed(2)}{config.unit}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-500">{stat.variance.toFixed(3)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-500">{Math.sqrt(stat.variance).toFixed(3)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
        <div className={`${isSignificant ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'} border rounded-xl p-4 shadow-sm`}>
            <h3 className={`font-semibold ${isSignificant ? 'text-emerald-900' : 'text-slate-900'} text-sm mb-1.5`}>
                Conclusion
            </h3>
            <p className={`text-xs ${isSignificant ? 'text-emerald-800' : 'text-slate-700'} leading-relaxed font-medium`}>
                {config.getConclusion(anovaResult.pValue, isSignificant)}
            </p>
        </div>
    </div>
  );
}