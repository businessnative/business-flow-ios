// Icon outlines from Lucide (ISC License, https://lucide.dev) — redrawn as react-native-svg paths.
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { C } from './theme';

export type IconName =
  | 'mic' | 'check' | 'x' | 'copy' | 'trash' | 'search' | 'plus' | 'chevron' | 'home' | 'history' | 'book' | 'zap'
  | 'sparkles' | 'sliders' | 'refresh' | 'wand' | 'keyboard' | 'key' | 'square' | 'phone';

export function Icon({ name, size = 20, color = C.text, strokeWidth = 1.75 }: { name: IconName; size?: number; color?: string; strokeWidth?: number }) {
  const p = { stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'mic' && (<><Path {...p} d="M12 19v3" /><Path {...p} d="M19 10v2a7 7 0 0 1-14 0v-2" /><Rect {...p} x={9} y={2} width={6} height={13} rx={3} /></>)}
      {name === 'phone' && <Path {...p} d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />}
      {name === 'check' && <Path {...p} d="M20 6 9 17l-5-5" />}
      {name === 'x' && (<><Path {...p} d="M18 6 6 18" /><Path {...p} d="m6 6 12 12" /></>)}
      {name === 'copy' && (<><Rect {...p} width={14} height={14} x={8} y={8} rx={2} /><Path {...p} d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></>)}
      {name === 'trash' && (<><Path {...p} d="M3 6h18" /><Path {...p} d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><Path {...p} d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></>)}
      {name === 'search' && (<><Circle {...p} cx={11} cy={11} r={8} /><Path {...p} d="m21 21-4.3-4.3" /></>)}
      {name === 'plus' && (<><Path {...p} d="M5 12h14" /><Path {...p} d="M12 5v14" /></>)}
      {name === 'chevron' && <Path {...p} d="m9 18 6-6-6-6" />}
      {name === 'home' && (<><Path {...p} d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" /><Path {...p} d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></>)}
      {name === 'history' && (<><Path {...p} d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><Path {...p} d="M3 3v5h5" /><Path {...p} d="M12 7v5l4 2" /></>)}
      {name === 'book' && <Path {...p} d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />}
      {name === 'zap' && <Path {...p} d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />}
      {name === 'sparkles' && <Path {...p} d="M12 3l1.9 5.8L20 10l-6.1 1.2L12 17l-1.9-5.8L4 10l6.1-1.2z" />}
      {name === 'sliders' && (<><Path {...p} d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4" /></>)}
      {name === 'refresh' && (<><Path {...p} d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><Path {...p} d="M21 3v5h-5" /><Path {...p} d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><Path {...p} d="M8 16H3v5" /></>)}
      {name === 'wand' && (<><Path {...p} d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72" /><Path {...p} d="m14 7 3 3" /></>)}
      {name === 'keyboard' && (<><Rect {...p} width={20} height={16} x={2} y={4} rx={2} /><Path {...p} d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10" /></>)}
      {name === 'key' && (<><Circle {...p} cx={7.5} cy={15.5} r={5.5} /><Path {...p} d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3" /></>)}
      {name === 'square' && <Rect x={6} y={6} width={12} height={12} rx={2} fill={color} />}
    </Svg>
  );
}
