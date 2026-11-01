import React from 'react';
import { View } from 'react-native';
import type { MascotProps } from './mascot';

/** Off Android (the web harness, tests, a future iPhone build) the mascot is a quiet, correctly sized
 *  space; onboarding replaces it with a still frame exported from the same Rive file. */
export function Mascot({ size, testID }: MascotProps) {
  return <View testID={testID} style={{ width: size, height: size }} accessible accessibilityRole="image" accessibilityLabel="Teddy, a small bear who keeps you company while you set up" />;
}
