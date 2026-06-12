interface NeuLogoProps {
  /** height in px — width scales automatically */
  height?: number;
  /** force a colour; default adapts to light/dark via CSS currentColor */
  color?: string;
  className?: string;
}

export function NeuLogo({ height = 40, color, className = "" }: NeuLogoProps) {
  const c = color ?? "#7B1D3A";
  const r = 22;
  const cx = 26;
  const cy = 26;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 330 52"
      height={height}
      aria-label="Near East University"
      className={className}
      style={{ display: "block" }}
    >
      {/* ── Circle mark ── */}
      {/* Right half filled */}
      <path
        d={`M ${cx} ${cy - r} A ${r} ${r} 0 0 1 ${cx} ${cy + r} Z`}
        fill={c}
      />
      {/* Left half outline only */}
      <path
        d={`M ${cx} ${cy - r} A ${r} ${r} 0 0 0 ${cx} ${cy + r} Z`}
        fill="none"
        stroke={c}
        strokeWidth="1.8"
      />
      {/* Full circle outline */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={c} strokeWidth="1.8" />
      {/* Vertical centre divider */}
      <line x1={cx} y1={cy - r} x2={cx} y2={cy + r} stroke={c} strokeWidth="1.8" />

      {/* ── Text ── */}
      <text
        x="56"
        y="24"
        fontFamily="'Georgia', 'Times New Roman', serif"
        fontWeight="700"
        fontSize="16"
        letterSpacing="1.5"
        fill={c}
      >
        NEAR EAST UNIVERSITY
      </text>
      <text
        x="57"
        y="39"
        fontFamily="'Georgia', 'Times New Roman', serif"
        fontWeight="400"
        fontSize="10"
        letterSpacing="0.5"
        fill={c}
      >
        Established in 1988
      </text>
    </svg>
  );
}
