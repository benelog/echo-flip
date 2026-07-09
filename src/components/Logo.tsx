/** Card-stack brand mark matching the PWA icon (public/icons). */
export function Logo({
  size = 20,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className}
      aria-hidden
    >
      <rect x="11" y="9" width="32" height="22" rx="5" fill="#93c5fd" />
      <rect x="5" y="15" width="32" height="22" rx="5" fill="#2563eb" />
      <line
        x1="11"
        y1="23"
        x2="30"
        y2="23"
        stroke="#ffffff"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <line
        x1="11"
        y1="30"
        x2="22"
        y2="30"
        stroke="#93c5fd"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
