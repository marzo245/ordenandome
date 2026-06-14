'use client';

import { useEffect, useRef, useState } from 'react';
import Lottie, { type LottieRefCurrentProps } from 'lottie-react';

/**
 * Reproductor Lottie reutilizable. Carga la animación desde `src` (en /public),
 * la anima en loop y la pausa/reanuda según `paused`.
 */
export default function LottiePlayer({
  src,
  paused,
  className,
}: {
  src: string;
  paused: boolean;
  className?: string;
}) {
  const ref = useRef<LottieRefCurrentProps>(null);
  const [data, setData] = useState<object | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(src)
      .then((r) => r.json())
      .then((j) => {
        if (alive) setData(j);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [src]);

  useEffect(() => {
    const l = ref.current;
    if (!l) return;
    if (paused) l.pause();
    else l.play();
  }, [paused, data]);

  if (!data) return null;

  return (
    <Lottie
      lottieRef={ref}
      animationData={data}
      loop
      autoplay
      className={className}
    />
  );
}
