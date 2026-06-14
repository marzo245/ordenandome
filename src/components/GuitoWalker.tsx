'use client';

import LottiePlayer from './LottiePlayer';

/**
 * GUITO — la mascota de IA del proyecto. Camina de un lado a otro de una franja,
 * reflejándose (scaleX) al cambiar de sentido. Solo camina cuando `walking` es true
 * (típicamente: el usuario está escribiendo o la IA está pensando).
 */
export default function GuitoWalker({ walking }: { walking: boolean }) {
  const state = walking ? 'running' : 'paused';
  return (
    <div className="relative h-12 border-b border-[var(--border)] overflow-hidden bg-[var(--surface)] shrink-0">
      <div
        className="absolute top-1/2 -translate-y-1/2"
        style={{
          width: 40,
          height: 40,
          left: 0,
          animation: 'walk-x 30s linear infinite',
          animationPlayState: state,
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            animation: 'walk-flip 30s steps(1, end) infinite',
            animationPlayState: state,
          }}
        >
          <LottiePlayer src="/guito.json" paused={!walking} className="w-full h-full" />
        </div>
      </div>
    </div>
  );
}
