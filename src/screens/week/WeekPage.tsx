import React from 'react';
import { useStore } from '../../store/store';
import { WeekScreen } from '../Week';
import { WeekV2 } from './WeekV2';

/** The Week route (PLAN R2), like Today's: Daylight draws `WeekV2`, the other Styles the v0.6 Week. */
export function WeekPage() {
  const daylight = useStore((s) => s.settings.palette) === 'daylight';
  return daylight ? <WeekV2 /> : <WeekScreen />;
}
