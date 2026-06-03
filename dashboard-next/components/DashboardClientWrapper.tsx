"use client";
import React, { useState, useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import SpatialMap from './SpatialMap';
import MetricChart from './MetricChart';
import TimePlaybackController from './TimePlaybackController';
import { formatTimestampDay, formatTimestampTime, getTimestampMinutes } from '../lib/time';

export interface MQTTMessage {
  id: string;
  createAt: string;
  payload: string;
  X: number;
  Y: number;
  Z: number;
  topic: string;
}

interface WrapperProps {
  initialMessages: MQTTMessage[];
  brokerHost: string;
  clientId: string;
}

export enum HeightZone {
  LOW = 'Low (0-300mm)',
  INTERMEDIATE = 'Intermediate (301-600mm)',
  HIGH = 'High (600mm+)'
}

export function getHeightZone(z: number): HeightZone {
  if (z <= 300) return HeightZone.LOW;
  if (z <= 600) return HeightZone.INTERMEDIATE;
  return HeightZone.HIGH;
}

function checkWarning(topic: string, val: number): boolean {
  if (topic.includes('temp') && val > 25.00) return true;
  if (topic.includes('humidity') && (val < 40.0 || val > 70.0)) return true;
  if (topic.includes('pressure') && (val < 950.0 || val > 1050.0)) return true;
  return false;
}

function getSectorCenter(message: MQTTMessage | null) {
  if (!message) return null;
  return {
    x: Math.floor(message.X / 100) * 100 + 50,
    y: Math.floor(message.Y / 100) * 100 + 50,
  };
}

export default function DashboardClientWrapper({ initialMessages, brokerHost, clientId }: WrapperProps) {
  
  // Isolate latest message containing valid coordinates
  const latestValidMessage = useMemo(() => {
    if (!initialMessages.length) return null;
    for (let i = initialMessages.length - 1; i >= 0; i--) {
      if (initialMessages[i].X !== undefined && initialMessages[i].Y !== undefined) return initialMessages[i];
    }
    return initialMessages[initialMessages.length - 1];
  }, [initialMessages]);

  const availableDays = useMemo(() => {
    const days = new Set<string>();
    initialMessages.forEach((m) => days.add(formatTimestampDay(m.createAt)));
    return Array.from(days).sort();
  }, [initialMessages]);

  const defaultDay = availableDays[availableDays.length - 1] || "";

  const defaultEndMinutesValue = useMemo(() => {
    if (!latestValidMessage) return 1440;
    return getTimestampMinutes(latestValidMessage.createAt) ?? 1440;
  }, [latestValidMessage]);

  // View States
  const [selectedDay, setSelectedDay] = useState<string>(defaultDay);
  const [startTimeMinutes, setStartTimeMinutes] = useState<number>(0);
  const [endTimeMinutes, setEndTimeMinutes] = useState<number>(defaultEndMinutesValue);
  const [selectedMessage, setSelectedMessage] = useState<MQTTMessage | null>(latestValidMessage);
  const [activeHeightFilter, setActiveHeightFilter] = useState<HeightZone>(() => 
    latestValidMessage ? getHeightZone(latestValidMessage.Z) : HeightZone.INTERMEDIATE
  );

  const isLive = selectedDay === defaultDay && endTimeMinutes >= defaultEndMinutesValue && startTimeMinutes === 0;
  const latestSector = useMemo(() => getSectorCenter(latestValidMessage), [latestValidMessage]);

  const latestRobotPosition = useMemo(() => {
    if (!latestValidMessage) return null;
    return {
      x: latestValidMessage.X,
      y: latestValidMessage.Y,
      zLabel: getHeightZone(latestValidMessage.Z),
      zValue: latestValidMessage.Z,
    };
  }, [latestValidMessage]);

  // Filter messages based on playback timeline parameters
  const historicalTimeScopeMessages = useMemo(() => {
    return initialMessages.filter((m) => {
      if (formatTimestampDay(m.createAt) !== selectedDay) return false;

      const msgMinutes = getTimestampMinutes(m.createAt);
      if (msgMinutes === null) return false;

      return msgMinutes >= startTimeMinutes && msgMinutes <= endTimeMinutes;
    });
  }, [initialMessages, selectedDay, startTimeMinutes, endTimeMinutes]);

  const selectedMessageForViews = useMemo(() => {
    if (selectedMessage && historicalTimeScopeMessages.some((message) => message.id === selectedMessage.id)) {
      return selectedMessage;
    }

    for (let i = historicalTimeScopeMessages.length - 1; i >= 0; i--) {
      if (historicalTimeScopeMessages[i].X !== undefined && historicalTimeScopeMessages[i].Y !== undefined) {
        return historicalTimeScopeMessages[i];
      }
    }

    return historicalTimeScopeMessages[historicalTimeScopeMessages.length - 1] ?? latestValidMessage;
  }, [historicalTimeScopeMessages, latestValidMessage, selectedMessage]);

  // Refactored unified timeline processing extraction mapping helper loop
  const timelines = useMemo(() => {
    const mapTopic = (kw: string) => historicalTimeScopeMessages
      .filter((m) => m.topic.includes(kw))
      .map((m) => ({ time: formatTimestampTime(m.createAt), value: parseFloat(m.payload), id: m.id, x: m.X, y: m.Y }));

    return {
      temperature: mapTopic('temp'),
      humidity: mapTopic('humidity'),
      pressure: mapTopic('pressure')
    };
  }, [historicalTimeScopeMessages]);

  // Dynamic Cache Mapping layout for multi-layer map quadrant boxes
  const preBinnedGridData = useMemo(() => {
    const zones = {
      [HeightZone.LOW]: new Map<string, { xGrid: number; yGrid: number; sourceLogs: MQTTMessage[]; hasWarning: boolean }>(),
      [HeightZone.INTERMEDIATE]: new Map<string, { xGrid: number; yGrid: number; sourceLogs: MQTTMessage[]; hasWarning: boolean }>(),
      [HeightZone.HIGH]: new Map<string, { xGrid: number; yGrid: number; sourceLogs: MQTTMessage[]; hasWarning: boolean }>(),
    };

    historicalTimeScopeMessages.forEach((m) => {
      const zone = getHeightZone(m.Z);
      const xGrid = Math.floor(m.X / 100) * 100 + 50;
      const yGrid = Math.floor(m.Y / 100) * 100 + 50;
      const key = `${xGrid}_${yGrid}`;

      const targetMap = zones[zone];
      if (!targetMap.has(key)) {
        targetMap.set(key, { xGrid, yGrid, sourceLogs: [], hasWarning: false });
      }
      
      const entry = targetMap.get(key)!;
      entry.sourceLogs.push(m);
      if (checkWarning(m.topic, parseFloat(m.payload))) {
        entry.hasWarning = true;
      }
    });

    const transform = (zoneKey: HeightZone) => 
      Array.from(zones[zoneKey].values()).map(cell => ({
        x: cell.xGrid,
        y: cell.yGrid,
        count: cell.sourceLogs.length,
        hasWarning: cell.hasWarning,
        rawMessage: cell.sourceLogs[cell.sourceLogs.length - 1]
      }));

    return {
      [HeightZone.LOW]: transform(HeightZone.LOW),
      [HeightZone.INTERMEDIATE]: transform(HeightZone.INTERMEDIATE),
      [HeightZone.HIGH]: transform(HeightZone.HIGH),
    };
  }, [historicalTimeScopeMessages]);

  // Real-time metrics lookup processing loop helper
  const realtimeMetrics = useMemo(() => {
    if (!latestValidMessage) return { temp: 'N/A', hum: 'N/A', pres: 'N/A', tempAlert: false, humAlert: false, presAlert: false };
    
    const getVal = (kw: string) => parseFloat(initialMessages.filter(m => m.topic.includes(kw)).pop()?.payload || '0');
    
    const temp = getVal('temp');
    const hum = getVal('humidity');
    const pres = getVal('pressure');

    return {
      temp: temp.toFixed(2),
      hum: hum.toFixed(2),
      pres: pres.toFixed(1),
      tempAlert: checkWarning('temp', temp),
      humAlert: checkWarning('humidity', hum),
      presAlert: checkWarning('pressure', pres)
    };
  }, [latestValidMessage, initialMessages]);

  const handleTimeRangeChange = (start: number, end: number) => {
    setStartTimeMinutes(start);
    setEndTimeMinutes(end);
  };

  const handleResetToLive = () => {
    setSelectedDay(defaultDay);
    setStartTimeMinutes(0);
    setEndTimeMinutes(defaultEndMinutesValue);
  };

  const statusCards = [
    { label: 'Latest Realtime Temp', value: `${realtimeMetrics.temp} °C`, alert: realtimeMetrics.tempAlert },
    { label: 'Latest Realtime Humidity', value: `${realtimeMetrics.hum} %`, alert: realtimeMetrics.humAlert },
    { label: 'Latest Realtime Barometer', value: `${realtimeMetrics.pres} hPa`, alert: realtimeMetrics.presAlert },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans">
      <header className="bg-white border-b border-slate-100 sticky top-0 z-10 px-8 py-3.5 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">MiR-Eco Telemetry Dashboard</h1>
          <p className="text-xs text-slate-500">Node ID: <span className="font-mono text-blue-600 font-semibold">{clientId}</span></p>
        </div>
        <div className="bg-emerald-50 text-emerald-700 border border-emerald-100 px-3 py-1 text-xs font-medium rounded-full">
          {brokerHost}
        </div>
      </header>

      {/* Made gaps tighter using space-y-4 instead of space-y-6 */}
      <main className="p-6 mx-auto space-y-4 max-w-7xl">
        
        {/* Real-time Metric Banners (Made padding smaller using p-3.5) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {statusCards.map((card) => (
            <div
              key={card.label}
              className={`bg-white p-3.5 rounded-xl border shadow-sm transition-all ${card.alert ? 'border-red-200 bg-red-50/40' : 'border-slate-100'}`}
            >
              <div className="flex justify-between items-center">
                <p className="text-[10px] text-slate-400 font-semibold uppercase">{card.label}</p>
                {card.alert && <AlertTriangle size={13} className="text-red-500 animate-pulse" />}
              </div>
              <h2 className={`text-base font-bold mt-0.5 ${card.alert ? 'text-red-600' : 'text-slate-900'}`}>{card.value}</h2>
            </div>
          ))}

          <div className="bg-white p-3.5 rounded-xl border border-slate-100 shadow-sm flex flex-col justify-center">
            <p className="text-[10px] text-slate-400 font-semibold uppercase">Latest Sector</p>
            <h2 className="text-base font-bold text-slate-900 font-mono mt-0.5">
              X:{latestSector?.x ?? 0} Y:{latestSector?.y ?? 0}
            </h2>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-100 shadow-sm flex flex-col justify-center">
            <p className="text-[10px] text-slate-400 font-semibold uppercase">Latest Robot Position</p>
            <h2 className="text-base font-bold text-slate-900 font-mono mt-0.5">
              ({latestRobotPosition?.x ?? 0}, {latestRobotPosition?.y ?? 0}, {latestRobotPosition?.zValue ?? 0})
            </h2>
            <p className="text-[11px] font-medium text-slate-500 leading-none mt-0.5">
              {latestRobotPosition?.zLabel ?? 'Low (0 mm)'}
            </p>
          </div>
        </div>

        <TimePlaybackController 
          availableDays={availableDays}
          selectedDay={selectedDay}
          onDayChange={setSelectedDay}
          startTime={startTimeMinutes}
          endTime={endTimeMinutes}
          onTimeRangeChange={handleTimeRangeChange}
          onResetToLive={handleResetToLive}
          isLive={isLive}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <MetricChart 
            temperatureData={timelines.temperature} 
            humidityData={timelines.humidity} 
            pressureData={timelines.pressure}
            selectedMessage={selectedMessageForViews}
          />
          <SpatialMap 
            binnedData={preBinnedGridData[activeHeightFilter]}
            selectedMessage={selectedMessageForViews}
            latestMessage={latestValidMessage}
            activeFilter={activeHeightFilter}
            onFilterChange={setActiveHeightFilter}
            onSelectMessage={setSelectedMessage}
          />
        </div>
      </main>
    </div>
  );
}