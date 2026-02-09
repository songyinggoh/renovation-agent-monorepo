'use client';

import { useState, useRef, useCallback } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

interface BeforeAfterSliderProps {
  beforeImageUrl: string;
  afterImageUrl: string;
  beforeLabel?: string;
  afterLabel?: string;
  className?: string;
}

export function BeforeAfterSlider({
  beforeImageUrl,
  afterImageUrl,
  beforeLabel = 'Before',
  afterLabel = 'After',
  className,
}: BeforeAfterSliderProps) {
  const [position, setPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const updatePosition = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    setPosition((x / rect.width) * 100);
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isDragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updatePosition(e.clientX);
  }, [updatePosition]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    updatePosition(e.clientX);
  }, [updatePosition]);

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn('relative select-none overflow-hidden rounded-lg', className)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* After image (full width) */}
      <Image src={afterImageUrl} alt={afterLabel} width={800} height={600} className="block w-full" draggable={false} />

      {/* Before image (clipped) */}
      <div
        className="absolute inset-0"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      >
        <Image src={beforeImageUrl} alt={beforeLabel} width={800} height={600} className="block w-full h-full object-cover" draggable={false} />
      </div>

      {/* Labels */}
      <span className="absolute top-3 left-3 rounded bg-background/80 px-2 py-0.5 text-xs font-medium backdrop-blur-sm">
        {beforeLabel}
      </span>
      <span className="absolute top-3 right-3 rounded bg-background/80 px-2 py-0.5 text-xs font-medium backdrop-blur-sm">
        {afterLabel}
      </span>

      {/* Slider handle */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg"
        style={{ left: `${position}%` }}
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-md">
          <svg width="12" height="12" viewBox="0 0 12 12" className="text-foreground">
            <path d="M3 6L0 3v6l3-3zm6 0l3-3v6l-3-3z" fill="currentColor" />
          </svg>
        </div>
      </div>
    </div>
  );
}
