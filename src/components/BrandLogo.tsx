interface BrandLogoProps {
  size?: 'sm' | 'md';
}

export function BrandLogo({ size = 'md' }: BrandLogoProps) {
  const iconSize = size === 'sm' ? 'w-7 h-7' : 'w-8 h-8';
  const textSize = size === 'sm' ? 'text-base' : 'text-lg';

  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 select-none">
      <svg
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden="true"
        className={iconSize}
      >
        <rect
          x="1.5"
          y="1.5"
          width="29"
          height="29"
          rx="8"
          fill="#0F131A"
          stroke="rgba(245, 158, 11, 0.45)"
          strokeWidth="1.5"
        />
        <path
          d="M9 21L14.5 11L18.5 17L23 10"
          stroke="#F59E0B"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M19.5 10H23V13.5"
          stroke="#10B981"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className={`font-display font-bold tracking-tight text-[#F8FAFC] ${textSize}`}>
        EraEarn
      </span>
    </span>
  );
}
