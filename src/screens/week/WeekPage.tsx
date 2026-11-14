import React, { useState } from 'react';
import { View } from 'react-native';
import { WeekScreen } from '../Week';
import { BackToNew } from '../today/TodayPage';
import { WeekV2 } from './WeekV2';

/** The Week route (PLAN R2), like Today's: the v0.7 Week, with the v0.6 one a tap away ("Classic Week") for the
 *  session, until the rest of the app is rebuilt. No setting: PLAN Question 2 chose one look. */
export function WeekPage() {
  const [classic, setClassic] = useState(false);
  if (!classic) return <WeekV2 onClassic={() => setClassic(true)} />;
  return (
    <View style={{ flex: 1 }}>
      <WeekScreen />
      <BackToNew label="New Week" onPress={() => setClassic(false)} />
    </View>
  );
}
