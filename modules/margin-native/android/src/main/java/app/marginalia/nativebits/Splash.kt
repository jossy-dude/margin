package app.marginalia.nativebits

/**
 * v0.7.7 (SPEC §6): one splash from tap to Today. MainActivity holds the system splash on screen until JS says its
 * first frame is up (`MarginNative.splashDone()`, from App.tsx's `mark('frame')`), or until a 2 s failsafe.
 * Process-wide: a warm start in a live process finds it already true and holds nothing.
 */
object Splash {
  @Volatile @JvmStatic var done: Boolean = false
}
