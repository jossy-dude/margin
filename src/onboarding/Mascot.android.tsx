import React, { useEffect } from 'react';
import { View } from 'react-native';
import { Fit, RiveView, useRive, useRiveFile } from '@rive-app/react-native';
import { RIG, type MascotProps } from './mascot';
import teddy from '../../assets/rive/teddy.riv';

/** The live mascot on Android: Teddy's Rive state machine, driven by the page through `MascotProps`. A
 *  file that fails to load leaves an empty, correctly sized space — never a crash on the first screen. */
export function Mascot({ size, look = 50, checking = false, handsUp = false, cue = null, still = false, testID }: MascotProps) {
  const { riveFile } = useRiveFile(teddy);
  const { riveViewRef, setHybridRef } = useRive();
  useEffect(() => { try { riveViewRef?.setNumberInputValue(RIG.look, still ? 50 : look); } catch { /* not loaded yet */ } }, [riveViewRef, look, still]);
  useEffect(() => { try { riveViewRef?.setBooleanInputValue(RIG.checking, checking && !still); } catch { /* not loaded yet */ } }, [riveViewRef, checking, still]);
  useEffect(() => { try { riveViewRef?.setBooleanInputValue(RIG.handsUp, handsUp); } catch { /* not loaded yet */ } }, [riveViewRef, handsUp]);
  useEffect(() => { if (!cue || still) return; try { riveViewRef?.triggerInput(cue.kind === 'success' ? RIG.success : RIG.fail); } catch { /* not loaded yet */ } }, [riveViewRef, cue, still]);
  return (
    <View testID={testID} style={{ width: size, height: size }} accessible accessibilityRole="image" accessibilityLabel="Teddy, a small bear who keeps you company while you set up">
      {riveFile ? <RiveView file={riveFile} hybridRef={setHybridRef} artboardName={RIG.artboard} stateMachineName={RIG.machine} autoPlay={!still} fit={Fit.Contain} style={{ width: size, height: size }} /> : null}
    </View>
  );
}
