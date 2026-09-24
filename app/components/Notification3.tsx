import type { SVGProps } from "react";

export interface Notification3Props extends SVGProps<SVGSVGElement> {
  size?: number;
}

export function Notification3({ size = 20, className, ...props }: Notification3Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {/* Curved bell body with flared bottom rim */}
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      {/* Bell clapper / ringer */}
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      {/* Notification badge dot on upper right of bell */}
      <circle cx="18" cy="4" r="2.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export default Notification3;
