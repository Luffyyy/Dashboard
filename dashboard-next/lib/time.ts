import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';

dayjs.extend(customParseFormat);

const TELEMETRY_TIMESTAMP_FORMATS = [
  'YYYY-MM-DD HH:mm:ss:SSS',
  'YYYY-MM-DD HH:mm:ss',
  'YYYY-MM-DDTHH:mm:ss.SSS[Z]',
  'YYYY-MM-DDTHH:mm:ss.SSS',
  'YYYY-MM-DDTHH:mm:ss',
];

function parseTelemetryTimestamp(timestamp: string) {
  for (const format of TELEMETRY_TIMESTAMP_FORMATS) {
    const parsed = dayjs(timestamp, format, true);
    if (parsed.isValid()) {
      return parsed;
    }
  }

  const fallback = dayjs(timestamp);
  return fallback.isValid() ? fallback : null;
}

export function formatTimestampDay(timestamp: string) {
  const parsed = parseTelemetryTimestamp(timestamp);
  return parsed ? parsed.format('YYYY-MM-DD') : timestamp.split(' ')[0];
}

export function getTimestampMinutes(timestamp: string) {
  const parsed = parseTelemetryTimestamp(timestamp);
  return parsed ? parsed.hour() * 60 + parsed.minute() : null;
}

export function formatTimestampTime(timestamp: string) {
  const parsed = parseTelemetryTimestamp(timestamp);
  return parsed ? parsed.format('HH:mm:ss') : timestamp;
}

export function formatMinutesToTime(minutes: number) {
  return dayjs().startOf('day').add(minutes, 'minute').format('HH:mm');
}