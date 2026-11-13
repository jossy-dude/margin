import React, { useEffect, useState } from 'react';
import { AppState, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Btn } from './kit';
import { alarmRinging, stopAlarm } from '../services/native';

/**
 * Test report #1 (2026-11-13): an alarm rang with no notification and no screen, and opening the app showed nothing,
 * so it could not be stopped. Whenever an alarm is ringing, every page of the app shows this Stop pill at the top.
 * Checked when the app comes to the front and once a second only while something is ringing.
 */
export function RingingPill() {
  const insets = useSafeAreaInsets();
  const [id, setId] = useState(() => alarmRinging());
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') setId(alarmRinging()); });
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (!id) return;
    const t = setInterval(() => setId(alarmRinging()), 1000);
    return () => clearInterval(t);
  }, [id]);
  if (!id) return null;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top + 8, left: 16, right: 16, alignItems: 'center' }}>
      <Btn icon="pause" label={id === 'preview' ? 'Stop the test ring' : 'Alarm ringing: stop'} testID="ringing-stop" onPress={() => { stopAlarm(); setId(''); }} />
    </View>
  );
}
