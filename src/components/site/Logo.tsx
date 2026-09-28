// ALX wordmark, track "Bougie": the L is a candle standing on a level.
// Drawn in currentColor so it follows the theme.

export function Wordmark({ width = 56, height = 26, title }: { width?: number; height?: number; title?: string }) {
  return (
    <svg width={width} height={height} viewBox="0 0 172 80" role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <text x="62" y="64" textAnchor="end" fontSize="72" fontWeight="500" fill="currentColor" style={{ fontFamily: "var(--serif)" }}>
        A
      </text>
      <line x1="78" y1="6" x2="78" y2="64" stroke="currentColor" strokeWidth="3" />
      <rect x="71" y="18" width="14" height="36" fill="currentColor" />
      <line x1="71" y1="61" x2="108" y2="61" stroke="currentColor" strokeWidth="6" />
      <text x="112" y="64" textAnchor="start" fontSize="72" fontWeight="500" fill="currentColor" style={{ fontFamily: "var(--serif)" }}>
        X
      </text>
    </svg>
  );
}

/** Round mark (favicon family). */
export function Mark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="32" fill="currentColor" />
      <line x1="27" y1="12" x2="27" y2="50" stroke="var(--paper)" strokeWidth="2.5" />
      <rect x="21" y="19" width="12" height="23" fill="var(--paper)" />
      <line x1="21" y1="48" x2="45" y2="48" stroke="var(--paper)" strokeWidth="5" />
    </svg>
  );
}
