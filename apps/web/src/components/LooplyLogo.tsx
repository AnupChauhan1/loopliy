interface LooplyLogoProps {
  className?: string;
  /** Render the "Looply" slab-serif wordmark next to the mark */
  wordmark?: boolean;
  /** Light strokes for dark/brand backgrounds */
  light?: boolean;
}

/**
 * Pure-code LOOPLY brand mark — two interlocking C-shaped chain links.
 * Black link opens right and hooks the emerald link, which opens left.
 */
export function LooplyLogo({ className = '', wordmark = false, light = false }: LooplyLogoProps) {
  const dark = light ? '#FFFFFF' : '#0B0F19';
  const green = light ? '#6EE7B7' : '#10B981';
  return (
    <svg
      viewBox={wordmark ? '0 0 220 64' : '0 0 64 64'}
      className={className}
      role="img"
      aria-label="LOOPLY"
      fill="none"
    >
      {/* Black link — opens to the right */}
      <circle
        cx="24" cy="36" r="15"
        stroke={dark} strokeWidth="9" strokeLinecap="round"
        strokeDasharray="70.7 23.6"
        transform="rotate(45 24 36)"
      />
      {/* Emerald link — opens to the left, interlocked on top */}
      <circle
        cx="40" cy="28" r="15"
        stroke={green} strokeWidth="9" strokeLinecap="round"
        strokeDasharray="70.7 23.6"
        transform="rotate(225 40 28)"
      />
      {wordmark && (
        <text
          x="70" y="45"
          fontFamily="'Roboto Slab', 'Arvo', Georgia, 'Times New Roman', serif"
          fontWeight="700"
          fontSize="36"
          letterSpacing="-1"
          fill={dark}
        >
          Looply
        </text>
      )}
    </svg>
  );
}
