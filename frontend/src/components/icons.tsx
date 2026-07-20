type IconProps = {
  className?: string;
};

const baseProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
};

export const TrashIcon = ({ className }: IconProps) => (
  <svg {...baseProps} className={className}>
    <path d="M4 7h16" />
    <path d="M10 11v6M14 11v6" />
    <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
    <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
);

export const PlusIcon = ({ className }: IconProps) => (
  <svg {...baseProps} className={className}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const CloseIcon = ({ className }: IconProps) => (
  <svg {...baseProps} className={className}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const LogoutIcon = ({ className }: IconProps) => (
  <svg {...baseProps} className={className}>
    <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
    <path d="M10 8l-4 4 4 4" />
    <path d="M6 12h10" />
  </svg>
);

export const SendIcon = ({ className }: IconProps) => (
  <svg {...baseProps} className={className}>
    <path d="M5 12l14-7-5 14-2.5-5.5L5 12z" />
  </svg>
);

export const SparkIcon = ({ className }: IconProps) => (
  <svg {...baseProps} className={className}>
    <path d="M12 4l1.7 4.6L18 10l-4.3 1.4L12 16l-1.7-4.6L6 10l4.3-1.4L12 4z" />
    <path d="M18 15l.7 1.8L20.5 17.5l-1.8.7L18 20l-.7-1.8L15.5 17.5l1.8-.7L18 15z" />
  </svg>
);

export const BoardIcon = ({ className }: IconProps) => (
  <svg {...baseProps} className={className}>
    <rect height="16" rx="2" width="18" x="3" y="4" />
    <path d="M9 4v16M15 4v16" />
  </svg>
);
