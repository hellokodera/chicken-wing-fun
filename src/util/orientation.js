// Shared portrait-detection signal — used by orientationGuard.js (whether to
// show the "rotate your device" overlay) and fullscreenButton.js (whether to
// surface the fullscreen escape hatch on scenes it wouldn't normally appear
// on, while that overlay is covering them).

// The overlay's DOM id — shared so fullscreenButton.js can find its card
// element (to keep clear of it in portrait) without a circular import back
// into orientationGuard.js, which already imports fullscreenSupported() from
// fullscreenButton.js.
export const GUARD_ID = 'cwf-orientation-guard';
//
// Primary signal: matchMedia. Complement: raw viewport ratio, for browsers
// whose (orientation: portrait) query lags or misreports (some Android
// WebViews, desktop device-emulation modes). Either signal saying "portrait"
// wins — a false negative (game running sideways) is worse than a brief false
// positive.
export function portraitNow() {
  const mm =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(orientation: portrait)').matches;
  const ratio = window.innerHeight > window.innerWidth;
  return Boolean(mm || ratio);
}
