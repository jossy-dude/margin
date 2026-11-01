import { useEffect, useState } from 'react';
import { recordCrash } from '../services/problems';
import { announceAppliedUpdate, bindOtaKv, consumeAppliedUpdate, rememberApplied, useNativeUpdates } from '../services/ota';
import { getState, useStore } from './core';
import { db, R } from './persist';
import { toast } from './toast';

/* ───── self-update (v0.9 WS4) ───────────────────────────────────────────────────────────────────
 * `services/ota.ts` owns the loop but must not import the store or an adapter (the store imports it to
 * wire the resume listener — a cycle). It takes the two calls it needs as a port; this binds them to
 * the open repository's `setting` table. Both directions swallow: an update marker is bookkeeping, and
 * a boot that could not read it must still reach a screen. A failed write lands in the Problems log
 * like every other failed write. */
/* The REAL repository, even while a sample session points `R()` at memory (D5): the marker is about
   this phone's bundle, and a marker written into the sample's memory copy was gone on the next launch —
   exactly the launch that should have said "you're now on…". */
const kvRepo = () => db.real ?? R();
bindOtaKv({
  get: async (k) => { try { return await kvRepo().getKv(k); } catch { return null; } },
  set: async (k, v) => { try { await kvRepo().setKv(k, v); } catch (e) { recordCrash(e, 'save', getState().route); } },
});

/** Say "you’re now on Margin X" — once, from a MOUNTED shell, and only then retire the marker.
 *
 *  Why not `hydrate()` (where this lived): `hydrate` finishes long before `Shell` is drawn. `Gate`
 *  shows `Splash` until the fonts have loaded, and on the launch that applied an update the fonts are
 *  re-read from a bundle that has just changed on disk — the slowest plausible boot. `toast()` starts
 *  its 2.6 s clear timer when it is CALLED, so the sentence would expire behind the splash, invisibly.
 *  It was also consumed (the KV marker deleted) at that same moment, so there was no retry and the
 *  one announcement the loop exists for could be lost outright. Both halves are fixed together:
 *  `announceAppliedUpdate` is now a pure read, and the delete happens here, after the toast is drawn.
 *
 *  "Drawn", not "called": `toast()` only writes the store, and `Overlay` paints it on a later commit.
 *  So the delete waits for `drawn` — the commit in which this hook reads the sentence out of the toast
 *  slot. `useSyncExternalStore` gives every component in one render the same snapshot, so that is the
 *  commit in which `Overlay` (a child of `Shell`, which calls this) drew it too. If anything replaces
 *  the toast first, `drawn` never comes true and the marker stays: the sentence repeats next launch
 *  rather than being lost.
 *
 *  `announced` is module-level rather than a ref because the once-ness belongs to the launch, not to a
 *  component: a sheet closing, a theme change or a remount of `Shell` must not repeat the sentence.
 *  The promise is `.catch`ed because this is a fire-and-forget call site with nobody to hand a
 *  rejection to — `announceAppliedUpdate` is total already, but a hook must never leak one. */
let announced = false;
export function useUpdateAnnouncement(): void {
  const [said, setSaid] = useState<string | null>(null);
  const drawn = useStore((s) => said !== null && s.toast?.text === said);
  useEffect(() => {
    if (announced) return;
    announced = true;
    void announceAppliedUpdate()
      .then((text) => { if (!text) return; toast(text); setSaid(text); })
      .catch(() => { /* the sentence is a courtesy; a boot is not allowed to fail for it */ });
  }, []);
  useEffect(() => { if (drawn) void consumeAppliedUpdate(); }, [drawn]);
  /* An update the NATIVE launch check downloaded (no JS fetch involved) is remembered too, so the launch
     that applies it can announce it. Same marker, same rule: written when the download is staged. */
  const staged = useNativeUpdates()?.downloadedUpdate?.updateId;
  useEffect(() => { if (staged) void rememberApplied(staged); }, [staged]);
}
/** Forget that this launch has announced. Only tests need this, like `resetOtaState`: a real launch
 *  starts with the flag down because the JS module is evaluated afresh. */
export function resetUpdateAnnouncement(): void { announced = false; }
