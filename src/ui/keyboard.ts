import { useEffect, useState } from 'react';
import { Keyboard } from 'react-native';

/** Is a soft keyboard on screen?
 *
 *  The bottom nav and the + button are floating chrome pinned to the bottom of the window, over
 *  scrolling page content. When the keyboard comes up the window is resized for it, so both stay at the
 *  bottom of what is left — which on a 411 dp phone is a strip about 900 px tall, so a floating bar and a
 *  62 dp button end up sitting **on** the content you are typing near.
 *
 *  Measured on a 411 dp Android phone: with the keyboard up the nav's bottom stroke sat at y 1485 and the
 *  keyboard's top edge at y 1521 — a 36 px gap, which is exactly `navInset`'s 14 dp. So the nav is
 *  already at the bottom of the *visible* area; what is wrong is that
 *  anything floats over the content at all. The + button occupied y 1131-1278, squarely on a task card.
 *
 *  Neither control is usable while typing, so both yield to the keyboard rather than covering the field. */
export function useKeyboardUp() {
  const [up, setUp] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setUp(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setUp(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return up;
}