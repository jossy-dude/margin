import React from 'react';
import { useStore } from '../../store/store';
import { TodayScreen } from '../Today';
import { TodayV2 } from './TodayV2';

/**
 * The Today route (PLAN R1). Each Style has its own Today: Daylight (the v0.7 look) draws `TodayV2`; Collage,
 * Plain and Notebook draw the v0.6 page, in their own paper. The Style is the only switch, so Today and Week
 * always match each other and the rest of the app.
 */
export function TodayPage() {
  const daylight = useStore((s) => s.settings.palette) === 'daylight';
  return daylight ? <TodayV2 /> : <TodayScreen />;
}
