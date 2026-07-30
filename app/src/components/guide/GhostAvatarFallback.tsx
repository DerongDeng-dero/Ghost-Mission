export default function GhostAvatarFallback() {
  return (
    <svg
      viewBox="0 0 80 80"
      className="h-20 w-20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id="ghost-avatar-glow" cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor="#88EEFF" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#00E5FF" stopOpacity="0.08" />
        </radialGradient>
      </defs>
      <circle cx="40" cy="40" r="31" fill="url(#ghost-avatar-glow)" />
      <path
        d="M24 52V36c0-10 7-18 16-18s16 8 16 18v16l-5-4-5 5-6-5-6 5-5-5-5 4Z"
        fill="#0A1924"
        fillOpacity="0.82"
        stroke="#00E5FF"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <ellipse cx="34" cy="35" rx="3.5" ry="4.5" fill="#E8F8FF" />
      <ellipse cx="46" cy="35" rx="3.5" ry="4.5" fill="#E8F8FF" />
      <circle cx="35" cy="36" r="1.5" fill="#00A8C7" />
      <circle cx="47" cy="36" r="1.5" fill="#00A8C7" />
      <path
        d="M34 43c1.6 2 3.6 3 6 3s4.4-1 6-3"
        stroke="#00E5FF"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}
