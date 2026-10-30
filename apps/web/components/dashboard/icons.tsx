/**
 * The dashboard's icon set — hand-drawn 24px strokes, currentColor throughout.
 * Emoji are banned as icons; these carry the same meaning with hairline
 * strokes that sit still on paper. Every icon accepts a className so the
 * caller sizes it; default 16px.
 */

type P = { className?: string };

function base(className?: string) {
  return {
    className: className ?? 'h-4 w-4',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
}

export const IconPhone = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" />
  </svg>
);

export const IconMessage = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M4 5h16v11H9l-5 4V5Z" />
  </svg>
);

export const IconBell = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" />
    <path d="M10 19a2 2 0 0 0 4 0" />
  </svg>
);

export const IconVoice = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M12 3v18" />
    <path d="M8 7v10M16 7v10M4 10v4M20 10v4" />
  </svg>
);

export const IconCheckin = ({ className }: P) => (
  <svg {...base(className)}>
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <path d="M9 4V3h6v1" />
    <path d="m9 13 2 2 4-4" />
  </svg>
);

export const IconMic = ({ className }: P) => (
  <svg {...base(className)}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0" />
    <path d="M12 18v3" />
  </svg>
);

export const IconSpeaker = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M4 9v6h4l5 4V5L8 9H4Z" />
    <path d="M16.5 8.5a5 5 0 0 1 0 7" />
  </svg>
);

export const IconSpeakerOff = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M4 9v6h4l5 4V5L8 9H4Z" />
    <path d="m16 9 5 6M21 9l-5 6" />
  </svg>
);

export const IconLock = ({ className }: P) => (
  <svg {...base(className)}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);

export const IconCopy = ({ className }: P) => (
  <svg {...base(className)}>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </svg>
);

export const IconPlay = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M8 5.5v13l11-6.5-11-6.5Z" />
  </svg>
);

export const IconStop = ({ className }: P) => (
  <svg {...base(className)}>
    <rect x="6" y="6" width="12" height="12" rx="1.5" />
  </svg>
);

export const IconHome = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="m4 11 8-7 8 7" />
    <path d="M6 10v10h12V10" />
  </svg>
);

export const IconMoon = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M20 13A8 8 0 0 1 11 4a8 8 0 1 0 9 9Z" />
  </svg>
);

export const IconSun = ({ className }: P) => (
  <svg {...base(className)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
  </svg>
);

export const IconGauge = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M4 14a8 8 0 1 1 16 0" />
    <path d="m12 14 4-5" />
  </svg>
);

export const IconEye = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
    <circle cx="12" cy="12" r="2.5" />
  </svg>
);

export const IconSignal = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M4 20v-4M9 20v-8M14 20v-12M19 20V4" />
  </svg>
);

export const IconChevron = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="m9 5 7 7-7 7" />
  </svg>
);
