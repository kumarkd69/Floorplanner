/**
 * Minimal 16px stroke icon set, drawn on a 24px grid.
 * Inline SVG keeps the bundle free of an icon dependency and lets icons inherit
 * `currentColor` so active/disabled states need no extra rules.
 */
interface Props {
  size?: number;
  className?: string;
}

const svg = (path: React.ReactNode, extra?: { fill?: boolean }) =>
  function Icon({ size = 16, className }: Props) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={extra?.fill ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
        focusable="false"
      >
        {path}
      </svg>
    );
  };

export const IconCursor = svg(<path d="M5 3l6.5 16 2.2-6.3L20 10.5z" />);
export const IconHand = svg(
  <path d="M9 11V5.5a1.5 1.5 0 013 0V11m0-1.5v-4a1.5 1.5 0 013 0V11m0-2a1.5 1.5 0 013 0v6a6 6 0 01-6 6h-1a6 6 0 01-6-6v-3.5a1.5 1.5 0 013 0" />,
);
export const IconWall = svg(
  <>
    <rect x="3" y="7" width="18" height="10" rx="1" />
    <path d="M3 12h18M9 7v5M15 12v5" />
  </>,
);
export const IconCurve = svg(<path d="M3 18C3 10 10 4 21 6" />);
export const IconRoom = svg(
  <>
    <rect x="3" y="4" width="18" height="16" rx="1.5" />
    <path d="M3 12h7v8" />
  </>,
);
export const IconDoor = svg(
  <>
    <path d="M4 20h16M7 20V5h8v15" />
    <path d="M15 20a8 8 0 00-8-8" strokeDasharray="2 2" />
  </>,
);
export const IconWindow = svg(
  <>
    <rect x="3" y="6" width="18" height="12" rx="1" />
    <path d="M12 6v12M3 12h18" />
  </>,
);
export const IconSofa = svg(
  <>
    <path d="M4 11V8a2 2 0 012-2h12a2 2 0 012 2v3" />
    <rect x="2" y="11" width="20" height="7" rx="2" />
    <path d="M7 18v2M17 18v2" />
  </>,
);
export const IconRuler = svg(
  <>
    <rect x="2" y="8" width="20" height="8" rx="1.5" />
    <path d="M7 8v3M12 8v4M17 8v3" />
  </>,
);
export const IconMeasure = svg(
  <>
    <path d="M3 12h18M3 9v6M21 9v6" />
  </>,
);
export const IconText = svg(<path d="M5 6h14M12 6v13M9 19h6" />);
export const IconUndo = svg(<path d="M4 10h10a5 5 0 010 10h-3M4 10l4-4M4 10l4 4" />);
export const IconRedo = svg(<path d="M20 10H10a5 5 0 000 10h3M20 10l-4-4M20 10l-4 4" />);
export const IconTrash = svg(
  <>
    <path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2" />
    <path d="M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13" />
  </>,
);
export const IconCopy = svg(
  <>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15V5a2 2 0 012-2h8" />
  </>,
);
export const IconGroup = svg(
  <>
    <rect x="3" y="3" width="8" height="8" rx="1" />
    <rect x="13" y="13" width="8" height="8" rx="1" />
    <path d="M11 7h4a2 2 0 012 2v4" strokeDasharray="2 2" />
  </>,
);
export const IconLock = svg(
  <>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 018 0v4" />
  </>,
);
export const IconUnlock = svg(
  <>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 017-2.5" />
  </>,
);
export const IconEye = svg(
  <>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" />
    <circle cx="12" cy="12" r="3" />
  </>,
);
export const IconEyeOff = svg(
  <>
    <path d="M10.6 6.2A9.9 9.9 0 0112 6c6.4 0 10 6 10 6a17 17 0 01-3.2 3.9M6.5 7.6A17 17 0 002 12s3.6 6 10 6a9.6 9.6 0 004-.8" />
    <path d="M3 3l18 18" />
  </>,
);
export const IconPlus = svg(<path d="M12 5v14M5 12h14" />);
export const IconMinus = svg(<path d="M5 12h14" />);
export const IconFit = svg(
  <>
    <path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4" />
  </>,
);
export const IconTarget = svg(
  <>
    <circle cx="12" cy="12" r="7" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
  </>,
);
export const IconGrid = svg(
  <>
    <rect x="3" y="3" width="18" height="18" rx="1.5" />
    <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
  </>,
);
export const IconMagnet = svg(
  <>
    <path d="M6 4v8a6 6 0 0012 0V4h-4v8a2 2 0 01-4 0V4z" />
    <path d="M6 8h4M14 8h4" />
  </>,
);
export const IconLayers = svg(
  <>
    <path d="M12 3l9 5-9 5-9-5 9-5z" />
    <path d="M3 13l9 5 9-5M3 17l9 5 9-5" />
  </>,
);
export const IconHistory = svg(
  <>
    <path d="M3 12a9 9 0 109-9 9 9 0 00-6.4 2.7L3 8" />
    <path d="M3 4v4h4M12 7v5l3 2" />
  </>,
);
export const IconTable = svg(
  <>
    <rect x="3" y="4" width="18" height="16" rx="1.5" />
    <path d="M3 9h18M3 14.5h18M9.5 9v11" />
  </>,
);
export const IconSearch = svg(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-4-4" />
  </>,
);
export const IconDownload = svg(<path d="M12 3v12m0 0l-4-4m4 4l4-4M4 19h16" />);
export const IconUpload = svg(<path d="M12 17V5m0 0L8 9m4-4l4 4M4 19h16" />);
export const IconPrint = svg(
  <>
    <path d="M7 9V3h10v6" />
    <rect x="3" y="9" width="18" height="8" rx="1.5" />
    <path d="M7 14h10v7H7z" />
  </>,
);
export const IconSettings = svg(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-2.7 1.1v.2a2 2 0 11-4 0v-.1A1.6 1.6 0 007 19.4a1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.6 1.6 0 002.5 14H2a2 2 0 010-4h.1A1.6 1.6 0 004.6 7a1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1A1.6 1.6 0 0010 2.5V2a2 2 0 014 0v.1a1.6 1.6 0 002.7 1.1l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00.3 1.8v.1a1.6 1.6 0 001.4 1H22a2 2 0 010 4h-.1a1.6 1.6 0 00-1.5 1z" />
  </>,
);
export const IconHelp = svg(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.5a2.5 2.5 0 115 .5c0 1.5-2.5 2-2.5 3.5M12 17.5v.01" />
  </>,
);
export const IconFile = svg(
  <>
    <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" />
    <path d="M14 3v5h5" />
  </>,
);
export const IconAlignLeft = svg(<path d="M4 3v18M8 8h8M8 16h5" />);
export const IconAlignCenterH = svg(<path d="M12 3v18M7 8h10M9 16h6" />);
export const IconAlignRight = svg(<path d="M20 3v18M8 8h8M11 16h5" />);
export const IconAlignTop = svg(<path d="M3 4h18M8 8v8M16 8v5" />);
export const IconAlignCenterV = svg(<path d="M3 12h18M8 7v10M16 9v6" />);
export const IconAlignBottom = svg(<path d="M3 20h18M8 8v8M16 11v5" />);
export const IconDistH = svg(<path d="M4 3v18M20 3v18M10 7v10M14 7v10" />);
export const IconDistV = svg(<path d="M3 4h18M3 20h18M7 10h10M7 14h10" />);
export const IconMirrorH = svg(<path d="M12 3v18M8 7L4 12l4 5zM16 7l4 5-4 5z" />);
export const IconMirrorV = svg(<path d="M3 12h18M7 8L12 4l5 4zM7 16l5 4 5-4z" />);
export const IconRotate = svg(
  <>
    <path d="M21 12a9 9 0 11-9-9 9 9 0 016.4 2.7L21 8" />
    <path d="M21 4v4h-4" />
  </>,
);
export const IconFront = svg(
  <>
    <rect x="3" y="3" width="12" height="12" rx="1.5" />
    <rect x="9" y="9" width="12" height="12" rx="1.5" fill="var(--bg-raised)" />
  </>,
);
export const IconBack = svg(
  <>
    <rect x="9" y="9" width="12" height="12" rx="1.5" />
    <rect x="3" y="3" width="12" height="12" rx="1.5" fill="var(--bg-raised)" />
  </>,
);
export const IconChevronUp = svg(<path d="M6 15l6-6 6 6" />);
export const IconChevronDown = svg(<path d="M6 9l6 6 6-6" />);
export const IconChevronLeft = svg(<path d="M15 6l-6 6 6 6" />);
export const IconChevronRight = svg(<path d="M9 6l6 6-6 6" />);
export const IconClose = svg(<path d="M6 6l12 12M18 6L6 18" />);
export const IconSun = svg(
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" />
  </>,
);
export const IconMoon = svg(<path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z" />);
export const IconBlueprint = svg(
  <>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M3 8h18M8 3v18" strokeDasharray="2 2" />
  </>,
);
export const IconSplit = svg(<path d="M3 12h6M15 12h6M12 4v16" strokeDasharray="0" />);
export const IconMerge = svg(<path d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4" />);
export const IconOffset = svg(
  <>
    <path d="M5 4v16" />
    <path d="M11 4v16" strokeDasharray="3 2" />
    <path d="M15 9l4 3-4 3" />
  </>,
);
export const IconLogo = svg(
  <>
    <rect x="2.5" y="3.5" width="19" height="17" rx="2" />
    <path d="M2.5 12h8V3.5M10.5 12v8.5M21.5 12h-4M14.5 3.5v5" />
  </>,
);

export const IconLink = svg(
  <>
    <path d="M10 13a5 5 0 007.5.5l2-2a5 5 0 00-7-7l-1 1" />
    <path d="M14 11a5 5 0 00-7.5-.5l-2 2a5 5 0 007 7l1-1" />
  </>,
);

export const IconPlot = svg(
  <>
    <path d="M3 3h18v18H3z" strokeDasharray="3 2.5" />
    <path d="M3 3h4M3 3v4M21 3h-4M21 3v4M3 21h4M3 21v-4M21 21h-4M21 21v-4" strokeDasharray="0" />
  </>,
);
