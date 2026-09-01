import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function IconBase({ children, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {children}
    </svg>
  );
}

export const ClusterIcon = (props: IconProps) => <IconBase {...props}><rect x="3" y="4" width="18" height="6" rx="2" /><rect x="3" y="14" width="18" height="6" rx="2" /><path d="M7 7h.01M7 17h.01M11 7h7M11 17h7" /></IconBase>;
export const BoxIcon = (props: IconProps) => <IconBase {...props}><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="m4.5 7.8 7.5 4.3 7.5-4.3M12 12.1V21" /></IconBase>;
export const LayersIcon = (props: IconProps) => <IconBase {...props}><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></IconBase>;
export const PlusIcon = (props: IconProps) => <IconBase {...props}><path d="M12 5v14M5 12h14" /></IconBase>;
export const ArrowIcon = (props: IconProps) => <IconBase {...props}><path d="M5 12h14M14 7l5 5-5 5" /></IconBase>;
export const TrashIcon = (props: IconProps) => <IconBase {...props}><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" /></IconBase>;
export const EditIcon = (props: IconProps) => <IconBase {...props}><path d="m4 20 4.2-1 10.7-10.7a2.1 2.1 0 0 0-3-3L5.2 16 4 20ZM14.5 6.5l3 3" /></IconBase>;
export const RefreshIcon = (props: IconProps) => <IconBase {...props}><path d="M20 7v5h-5M4 17v-5h5" /><path d="M18.5 9A7 7 0 0 0 6 6.5L4 9M5.5 15A7 7 0 0 0 18 17.5l2-2.5" /></IconBase>;
export const ChevronIcon = (props: IconProps) => <IconBase {...props}><path d="m9 18 6-6-6-6" /></IconBase>;
export const LogoutIcon = (props: IconProps) => <IconBase {...props}><path d="M10 17l5-5-5-5M15 12H3M14 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5" /></IconBase>;
export const AlertIcon = (props: IconProps) => <IconBase {...props}><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.8 2.8 17a2 2 0 0 0 1.8 3h14.8a2 2 0 0 0 1.8-3L13.7 3.8a2 2 0 0 0-3.4 0Z" /></IconBase>;
