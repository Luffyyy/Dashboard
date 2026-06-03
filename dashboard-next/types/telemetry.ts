export enum HeightZone {
  LOW = 'Low',            // 0 to 300 mm
  INTERMEDIATE = 'Intermediate',  // 301 to 600 mm
  HIGH = 'High'           // 600+ mm
}

export function getHeightZone(z: number): HeightZone {
  if (z <= 300) return HeightZone.LOW;
  if (z <= 600) return HeightZone.INTERMEDIATE;
  return HeightZone.HIGH;
}

// Optional: Colors to visually map the height zone level on the UI
export const HeightZoneColors = {
  [HeightZone.LOW]: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', fill: '#f59e0b' },
  [HeightZone.INTERMEDIATE]: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', fill: '#6366f1' },
  [HeightZone.HIGH]: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', fill: '#f43f5e' }
};