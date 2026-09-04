import type { CSSProperties, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { style?: CSSProperties };

export function ChevronDown(props: IconProps) {
  return (
    <svg width={10} height={10} viewBox="0 0 10 10" fill="none" {...props}>
      <path
        d="M2.5 3.75 L5 6.25 L7.5 3.75"
        stroke="currentColor"
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ChevronUp(props: IconProps) {
  return (
    <svg width={10} height={10} viewBox="0 0 10 10" fill="none" {...props}>
      <path
        d="M2.5 6.25 L5 3.75 L7.5 6.25"
        stroke="currentColor"
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function FolderIcon(props: IconProps) {
  return (
    <svg width={14} height={14} viewBox="0 0 14 14" fill="none" {...props}>
      <path
        d="M1.5 4 V11 H12.5 V5 H7 L5.5 3.5 H1.5 V4Z"
        stroke="currentColor"
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function GearIcon(props: IconProps) {
  return (
    <svg width={14} height={14} viewBox="0 0 14 14" fill="none" {...props}>
      <path
        d="M3 4 H11 M3 7 H11 M3 10 H11"
        stroke="currentColor"
        strokeWidth={1.3}
        strokeLinecap="round"
      />
      <circle
        cx={5.5}
        cy={4}
        r={1.4}
        fill="var(--win-bg, #fff)"
        stroke="currentColor"
        strokeWidth={1.3}
      />
      <circle
        cx={9}
        cy={7}
        r={1.4}
        fill="var(--win-bg, #fff)"
        stroke="currentColor"
        strokeWidth={1.3}
      />
      <circle
        cx={6}
        cy={10}
        r={1.4}
        fill="var(--win-bg, #fff)"
        stroke="currentColor"
        strokeWidth={1.3}
      />
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <svg width={12} height={12} viewBox="0 0 12 12" fill="none" {...props}>
      <path
        d="M6 2 V10 M2 6 H10"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function MinusIcon(props: IconProps) {
  return (
    <svg width={12} height={12} viewBox="0 0 12 12" fill="none" {...props}>
      <path
        d="M2 6 H10"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg width={12} height={12} viewBox="0 0 12 12" fill="none" {...props}>
      <path
        d="M3 3 L9 9 M9 3 L3 9"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <svg width={14} height={14} viewBox="0 0 14 14" fill="none" {...props}>
      <path
        d="M11.5 4 A4.5 4.5 0 1 0 12 8"
        stroke="currentColor"
        strokeWidth={1.3}
        strokeLinecap="round"
      />
      <path
        d="M11.5 1.5 V4 H9"
        stroke="currentColor"
        strokeWidth={1.3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BoltIcon(props: IconProps) {
  return (
    <svg width={12} height={14} viewBox="0 0 12 14" fill="none" {...props}>
      <path
        d="M7 1 L2 8 H6 L5 13 L10 6 H6 Z"
        stroke="currentColor"
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <svg width={12} height={12} viewBox="0 0 12 12" fill="none" {...props}>
      <path
        d="M2.5 3.5 H9.5 L9 10 H3 L2.5 3.5Z M4.5 3.5 V2.5 H7.5 V3.5 M1.5 3.5 H10.5"
        stroke="currentColor"
        strokeWidth={1.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function FitIcon(props: IconProps) {
  return (
    <svg width={13} height={13} viewBox="0 0 13 13" fill="none" {...props}>
      <path
        d="M1.5 4.5 V1.5 H4.5 M8.5 1.5 H11.5 V4.5 M11.5 8.5 V11.5 H8.5 M4.5 11.5 H1.5 V8.5"
        stroke="currentColor"
        strokeWidth={1.3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SunIcon(props: IconProps) {
  return (
    <svg width={14} height={14} viewBox="0 0 14 14" fill="none" {...props}>
      <circle cx={7} cy={7} r={3} stroke="currentColor" strokeWidth={1.3} />
      <path
        d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.5 2.5l1 1M10.5 10.5l1 1M2.5 11.5l1-1M10.5 3.5l1-1"
        stroke="currentColor"
        strokeWidth={1.3}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <svg width={14} height={14} viewBox="0 0 14 14" fill="none" {...props}>
      <path
        d="M11.5 8.2A4.8 4.8 0 1 1 5.8 2.5 5 5 0 0 0 11.5 8.2Z"
        stroke="currentColor"
        strokeWidth={1.3}
        strokeLinejoin="round"
      />
    </svg>
  );
}
