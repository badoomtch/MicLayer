// MicLayer logo + wordmark, lifted directly from the design handoff's brand.jsx.
// Single-fill SVG; works on dark and light surfaces.

export function LogoCapsule({
  size = 18,
  color = 'currentColor',
}: {
  size?: number;
  color?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-label="MicLayer">
      <rect x="10" y="3" width="12" height="18" rx="6" fill={color} opacity="0.18" />
      <rect x="11.5" y="6" width="9" height="2" rx="1" fill={color} />
      <rect x="11.5" y="10" width="9" height="2" rx="1" fill={color} />
      <rect x="11.5" y="14" width="9" height="2" rx="1" fill={color} />
      <path
        d="M7 17.5 v1.5 a9 9 0 0 0 18 0 v-1.5"
        stroke={color}
        strokeWidth="1.75"
        strokeLinecap="round"
        fill="none"
      />
      <line x1="16" y1="26" x2="16" y2="29.25" stroke={color} strokeWidth="1.75" strokeLinecap="round" />
      <line x1="12" y1="29.25" x2="20" y2="29.25" stroke={color} strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({
  height = 14,
  color = 'currentColor',
}: {
  height?: number;
  color?: string;
}) {
  return (
    <span
      style={{
        fontFamily: "'Inter', sans-serif",
        fontSize: height,
        lineHeight: 1,
        fontWeight: 600,
        letterSpacing: '-0.025em',
        color,
        display: 'inline-flex',
        alignItems: 'baseline',
      }}
    >
      <span style={{ fontWeight: 700 }}>Mic</span>
      <span style={{ fontWeight: 500, opacity: 0.85 }}>Layer</span>
    </span>
  );
}

export function Lockup({
  size = 18,
  color = 'currentColor',
}: {
  size?: number;
  color?: string;
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color }}>
      <LogoCapsule size={size} color={color} />
      <Wordmark height={size * 0.62} color={color} />
    </span>
  );
}
