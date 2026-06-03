"use client";
import React from 'react';
import { Calendar, Clock } from 'lucide-react';
import { formatMinutesToTime } from '../lib/time';

interface TimePlaybackControllerProps {
  availableDays: string[];
  selectedDay: string;
  onDayChange: (day: string) => void;
  startTime: number;  // Minutes from midnight (0 - 1440)
  endTime: number;    // Minutes from midnight (0 - 1440)
  onTimeRangeChange: (start: number, end: number) => void;
  onResetToLive: () => void;
  isLive: boolean;
}

// Reusable styling strings to maximize code readability and consistency
const thumbCustomStyles = "[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-600 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow-md [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-blue-600 [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:shadow-md";
const inputBaseClass = `absolute w-full h-2 pointer-events-none appearance-none bg-transparent left-0 top-2 cursor-pointer ${thumbCustomStyles}`;

// Local DRY Sub-component for individual slider handles
const SliderHandle = ({ value, onChange, zIndex }: { value: number; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; zIndex: string }) => (
  <input
    type="range"
    min="0"
    max="1440"
    step="10"
    value={value}
    onChange={onChange}
    className={`${inputBaseClass} ${zIndex}`}
  />
);

export default function TimePlaybackController({
  availableDays,
  selectedDay,
  onDayChange,
  startTime,
  endTime,
  onTimeRangeChange,
  onResetToLive,
  isLive
}: TimePlaybackControllerProps) {

  return (
    <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-50 pb-3">
        <div className="flex items-center gap-2">
          <Clock size={18} className="text-blue-500" />
          <div>
            <h3 className="font-semibold text-slate-700 text-sm">Historical Range Playback</h3>
            <p className="text-[11px] text-slate-400">Isolate data packets captured between a custom historical window range.</p>
          </div>
        </div>

        <button
          onClick={onResetToLive}
          disabled={isLive}
          className={`flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg border transition-all ${
            isLive
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 cursor-default'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 shadow-sm active:scale-95'
          }`}
        >
          {isLive ? '📡 Connected Live' : 'Jump to Current Target'}
        </button>
      </div>

      {/* Made gaps tighter using gap-4 to clean presentation consistency */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
        {/* Day Selection */}
        <div className="relative">
          <label className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 block mb-1">Select Active Day</label>
          <div className="relative flex items-center">
            <Calendar size={14} className="absolute left-3 text-slate-400 pointer-events-none" />
            <select
              value={selectedDay}
              onChange={(e) => onDayChange(e.target.value)}
              className="w-full text-xs font-medium pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-blue-400 appearance-none cursor-pointer"
            >
              {availableDays.map((day) => (
                <option key={day} value={day}>{day}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Hour Dual Slider */}
        <div className="md:col-span-3">
          <div className="flex justify-between items-center mb-1">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">Time Filter Bounds</span>
            <span className="text-xs font-mono font-bold bg-blue-50 text-blue-600 px-2 py-0.5 rounded border border-blue-100">
              {formatMinutesToTime(startTime)} — {formatMinutesToTime(endTime)}
            </span>
          </div>

          <div className="relative w-full h-6 pt-2">
            {/* Base Background Track */}
            <div className="absolute left-0 right-0 h-2 bg-slate-100 rounded-lg top-2 pointer-events-none" />
            
            {/* Colored Range overlay fill */}
            <div 
              className="absolute h-2 bg-blue-500 rounded-lg top-2 pointer-events-none opacity-30"
              style={{
                left: `${(startTime / 1440) * 100}%`,
                right: `${100 - (endTime / 1440) * 100}%`
              }}
            />

            {/* Renderized Range Input Handles */}
            <SliderHandle 
              value={startTime} 
              onChange={(e) => onTimeRangeChange(Math.min(parseInt(e.target.value), endTime - 10), endTime)} 
              zIndex="z-20" 
            />
            <SliderHandle 
              value={endTime} 
              onChange={(e) => onTimeRangeChange(startTime, Math.max(parseInt(e.target.value), startTime + 10))} 
              zIndex="z-30" 
            />
          </div>
          
          <div className="flex justify-between text-[9px] font-mono text-slate-400 mt-1 px-1">
            {['00:00', '06:00', '12:00', '18:00', '24:00'].map(tick => <span key={tick}>{tick}</span>)}
          </div>
        </div>
      </div>
    </div>
  );
}