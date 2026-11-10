import { ReactNode } from 'react'

export const Svg = ({ children, size = 22, className }: { children: ReactNode; size?: number; className?: string }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
)
type P = { size?: number }

export const IHome = (p: P) => <Svg {...p}><path d="M3 11l9-8 9 8" /><path d="M5 10v10h5v-6h4v6h5V10" /></Svg>
export const IUsers = (p: P) => <Svg {...p}><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.5 2.7-5.5 6-5.5s6 2 6 5.5" /><circle cx="17" cy="9" r="2.4" /><path d="M16.5 14.5c2.700 0 4.500 1.700 4.500 4.500" /></Svg>
export const ICalCheck = (p: P) => <Svg {...p}><rect x="3.5" y="5" width="17" height="15.5" rx="3" /><path d="M8 3v4M16 3v4" /><path d="M8.5 13l2.5 2.5 4.500-5" /></Svg>
export const ICal = (p: P) => <Svg {...p}><rect x="3.5" y="5" width="17" height="15.5" rx="3" /><path d="M8 3v4M16 3v4M3.500 10h17" /></Svg>
export const ICalPlus = (p: P) => <Svg {...p}><rect x="3.5" y="5" width="17" height="15.5" rx="3" /><path d="M8 3v4M16 3v4M12 11v6M9 14h6" /></Svg>
export const ICheckSq = (p: P) => <Svg {...p}><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8" /><path d="M8.500 11.500l3 3L20 6" /></Svg>
export const ICheckCircle = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M7.500 12.500l3 3 6-7" /></Svg>
export const IBars = (p: P) => <Svg {...p}><path d="M4 20h16" /><rect x="5" y="11" width="3.500" height="7" rx="1" /><rect x="10.250" y="6" width="3.500" height="12" rx="1" /><rect x="15.500" y="3" width="3.500" height="15" rx="1" /></Svg>
export const IPin = (p: P) => <Svg {...p}><path d="M12 21s7-6.200 7-11.500A7 7 0 0 0 5 9.500C5 14.800 12 21 12 21z" /><circle cx="12" cy="9.500" r="2.500" /></Svg>
export const IDevice = (p: P) => <Svg {...p}><rect x="4" y="4" width="16" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></Svg>
export const IWallet = (p: P) => <Svg {...p}><rect x="3" y="6" width="18" height="13" rx="3" /><path d="M3 10h18" /><circle cx="16.500" cy="14.500" r="1.200" /></Svg>
export const IGear = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M12 2.500v2.500M12 19v2.500M4.500 12H2M22 12h-2.500M5.500 5.500l1.800 1.800M16.700 16.700l1.800 1.800M5.500 18.500l1.800-1.800M16.700 7.300l1.800-1.800" /></Svg>
export const IBell = (p: P) => <Svg {...p}><path d="M6 17V11a6 6 0 0 1 12 0v6l1.500 2h-15z" /><path d="M10 21h4" /></Svg>
export const ISearch = (p: P) => <Svg {...p}><circle cx="11" cy="11" r="6.500" /><path d="M20 20l-4.200-4.200" /></Svg>
export const IUserPlus = (p: P) => <Svg {...p}><circle cx="10" cy="8" r="3.500" /><path d="M3 20c0-3.800 3-6 7-6s7 2.200 7 6" /><path d="M19 7v6M16 10h6" /></Svg>
export const IAlert = (p: P) => <Svg {...p}><path d="M12 3.500l10 17H2z" /><path d="M12 10v5M12 18v.2" /></Svg>
export const IUmbrella = (p: P) => <Svg {...p}><path d="M3 12a9 9 0 0 1 18 0z" /><path d="M12 12v6.500a2 2 0 0 0 4 0" /></Svg>
export const IFinger = (p: P) => <Svg {...p}><path d="M12 3a7 7 0 0 0-7 7v3M12 7a3 3 0 0 0-3 3v7M12 7a3 3 0 0 1 3 3v2c0 3-.5 5-1.500 8M19 12v-2a7 7 0 0 0-3-5.700M8 21c.8-2 1-4 1-6" /></Svg>
export const IChevR = (p: P) => <Svg {...p}><path d="M9 5l7 7-7 7" /></Svg>
export const IChevD = (p: P) => <Svg {...p}><path d="M5 9l7 7 7-7" /></Svg>
export const IBack = (p: P) => <Svg {...p}><path d="M15 5l-7 7 7 7" /></Svg>
export const IArrowR = (p: P) => <Svg {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Svg>
export const IDoc = (p: P) => <Svg {...p}><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5M10 13h6M10 17h6" /></Svg>
export const ILock = (p: P) => <Svg {...p}><rect x="5" y="11" width="14" height="10" rx="2.500" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Svg>
export const IUser = (p: P) => <Svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.600-6 8-6s8 2 8 6" /></Svg>
export const IPhone = (p: P) => <Svg {...p}><rect x="7" y="2.500" width="10" height="19" rx="2.500" /><path d="M11 18.500h2" /></Svg>
export const IMenu = (p: P) => <Svg {...p}><path d="M4 7h16M4 12h16M4 17h16" /></Svg>
export const IFace = (p: P) => <Svg {...p}><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" /><path d="M9 10v1M15 10v1M9.500 15c.7.7 1.500 1 2.500 1s1.800-.3 2.500-1" /></Svg>
export const IClock = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Svg>
export const IEdit = (p: P) => <Svg {...p}><path d="M4 20h4L19 9l-4-4L4 16z" /></Svg>

/** Leafy corner decoration used on the green screens. */
export function Leaves({ className }: { className?: string }) {
  const leaf = 'M0 0C20-26 66-30 92 0C66 30 20 26 0 0Z'
  const L = [[4, 4, 40, 1], [26, 22, -10, .95], [40, 40, 68, .9], [60, 62, 14, .85], [70, 88, 84, .8], [86, 116, 24, .7]]
  return (
    <svg className={className} viewBox="0 0 200 200" aria-hidden="true">
      <defs>
        <linearGradient id="lvA" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8fcf3c" /><stop offset="1" stopColor="#3d8b1d" /></linearGradient>
        <linearGradient id="lvB" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#b6dc57" /><stop offset="1" stopColor="#4c9a25" /></linearGradient>
      </defs>
      <path d="M-6 -6C40 40 80 90 100 190" stroke="#6c8a3a" strokeWidth="3.500" fill="none" strokeLinecap="round" />
      {L.map(([x, y, r, s], i) => (
        <g key={i} transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
          <path d={leaf} fill={i % 2 ? 'url(#lvB)' : 'url(#lvA)'} />
          <path d="M4 0C30 -2 62 -1 86 0" stroke="rgba(255,255,255,.5)" strokeWidth="1.800" fill="none" strokeLinecap="round" />
        </g>
      ))}
    </svg>
  )
}
