'use client';

import LottiePlayer from './LottiePlayer';

/**
 * Botón flotante "Nueva tarea con IA" con animación Lottie.
 * - Anima en loop y levita mientras `paused` es false.
 * - Al hacer click (o cuando `paused` pasa a true) se detiene/congela;
 *   el modal del planner se abre al frente. Al cerrar el modal vuelve a animarse.
 */
export default function AiLottieButton({
  onClick,
  paused,
  title = 'Nueva tarea con IA',
}: {
  onClick: () => void;
  paused: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`fixed bottom-6 right-44 z-40 w-16 h-16 rounded-full bg-white border border-[var(--border)] shadow-lg hover:shadow-xl transition-shadow flex items-center justify-center overflow-hidden ${
        paused ? '' : 'animate-[levitate_3s_ease-in-out_infinite]'
      }`}
    >
      <LottiePlayer src="/guito.json" paused={paused} className="w-full h-full" />
    </button>
  );
}
