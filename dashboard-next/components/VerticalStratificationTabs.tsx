// components/VerticalStratificationTabs.tsx
'use client';

import React, { useState, useMemo } from 'react';
import { Thermometer, Droplets, Calendar } from 'lucide-react';
import type { MQTTMessage } from './DashboardClientWrapper';
import BaseANOVAResults from './BaseANOVAResults';

interface VerticalStratificationTabsProps {
  messages: MQTTMessage[];
}

export default function VerticalStratificationTabs({ messages }: VerticalStratificationTabsProps) {
  const [subTab, setSubTab] = useState<'temperature' | 'humidity'>('temperature');
  const [selectedDay, setSelectedDay] = useState<string>('all');

  // Parse and extract unique sorted days present in the dataset
  const availableDays = useMemo(() => {
    const daysSet = new Set<string>();
    messages.forEach((msg) => {
      if (msg.createAt) {
        const dateStr = msg.createAt.split(' ')[0]; // Extracts YYYY-MM-DD
        if (dateStr && dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
          daysSet.add(dateStr);
        }
      }
    });
    return Array.from(daysSet).sort();
  }, [messages]);

  // Filter messages based on the selected calendar date
  const filteredMessages = useMemo(() => {
    if (selectedDay === 'all') return messages;
    return messages.filter((msg) => msg.createAt?.startsWith(selectedDay));
  }, [messages, selectedDay]);

  const temperatureConfig = {
    key: 'temperature' as const,
    label: 'Temperature',
    unit: '°C',
    barColor: '#d97706',
    chartMinMaxPadding: 1,
    hypothesisTitle: 'Hypothesis 1: Vertical Thermal Stratification',
    description: 'Measures whether thermal buoyancy (hot air rising, cool air settling) creates statistically distinct ambient environments across room heights.',
    nullHypothesis: {
      formula: 'μ₁ = μ₂ = μ₃',
      meaning: 'The true mean temperatures are uniform across all vertical zones. Elevation has no effect.'
    },
    altHypothesis: {
      formula: 'μᵢ ≠ μⱼ for some i, j',
      meaning: 'At least one vertical zone has a significantly different mean temperature, confirming room stratification.'
    },
    bannerBg: 'bg-amber-50/60',
    bannerText: 'text-amber-900',
    bannerBorder: 'border-amber-200',
    getConclusion: (pValue: number, isSignificant: boolean) => isSignificant
      ? `At the α = 0.05 significance level, we REJECT the null hypothesis (p = ${pValue.toExponential(4)}). There is statistically significant evidence that temperature profiles differ across height zones, confirming vertical thermal stratification.`
      : `At the α = 0.05 significance level, we FAIL TO REJECT the null hypothesis (p = ${pValue.toFixed(6)}). There is insufficient empirical evidence to conclude that mean temperatures differ across height zones.`
  };

  const humidityConfig = {
    key: 'humidity' as const,
    label: 'Humidity',
    unit: '%',
    barColor: '#0284c7',
    chartMinMaxPadding: 2,
    hypothesisTitle: 'Hypothesis 2: Low-Level Moisture Accumulation',
    description: 'Measures whether structural boundaries or microclimate conditions cause humidity to collect disproportionately in lower vertical layers (0-0.3 m).',
    nullHypothesis: {
      formula: 'μ₁ = μ₂ = μ₃',
      meaning: 'The true mean humidity levels are equal across all room elevation zones.'
    },
    altHypothesis: {
      formula: 'μᵢ ≠ μⱼ for some i, j',
      meaning: 'At least one vertical zone exhibits a shifted baseline humidity level, indicating moisture stratification.'
    },
    bannerBg: 'bg-sky-50',
    bannerText: 'text-sky-900',
    bannerBorder: 'border-sky-150',
    getConclusion: (pValue: number, isSignificant: boolean) => isSignificant
      ? `At the α = 0.05 significance level, we REJECT the null hypothesis (p = ${pValue.toExponential(4)}). There is statistically significant evidence that humidity differs across height zones, confirming vertical moisture accumulation.`
      : `At the α = 0.05 significance level, we FAIL TO REJECT the null hypothesis (p = ${pValue.toFixed(6)}). There is insufficient statistical evidence to state that mean humidity levels vary systematically by height zone.`
  };

  return (
    <div className="space-y-6 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 border border-slate-200 rounded-xl shadow-sm">
        {/* Metric Tabs */}
        <div className="bg-slate-100 p-1 flex gap-1 rounded-lg w-full sm:max-w-md">
          <button
            type="button"
            onClick={() => setSubTab('temperature')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold rounded-md transition-all ${
              subTab === 'temperature'
                ? 'bg-amber-500 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Thermometer className="w-4 h-4" />
            Thermal Stratification
          </button>
          <button
            type="button"
            onClick={() => setSubTab('humidity')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold rounded-md transition-all ${
              subTab === 'humidity'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Droplets className="w-4 h-4" />
            Moisture Accumulation
          </button>
        </div>

        {/* Day Selector */}
        <div className="flex items-center gap-2 shrink-0">
          <Calendar className="w-4 h-4 text-slate-400" />
          <label htmlFor="day-select" className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Analysis Frame:
          </label>
          <select
            id="day-select"
            value={selectedDay}
            onChange={(e) => setSelectedDay(e.target.value)}
            className="text-sm font-semibold bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Full Timeline (Combined)</option>
            {availableDays.map((day) => (
              <option key={day} value={day}>
                {day === '2026-06-22' ? '2026-06-22 (Base Scenario)' : 
                 day === '2026-06-23' ? '2026-06-23 (System Stress)' : 
                 day === '2026-06-24' ? '2026-06-24 (Recovery Phase)' : day}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="transition-all duration-200">
        <BaseANOVAResults 
          messages={filteredMessages} 
          config={subTab === 'temperature' ? temperatureConfig : humidityConfig}
          selectedDay={selectedDay}
        />
      </div>
    </div>
  );
}