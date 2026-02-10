'use client';

import { useEffect, useState, type RefObject } from 'react';

interface UseIntersectionObserverOptions {
  threshold?: number;
  rootMargin?: string;
  once?: boolean;
}

export function useIntersectionObserver(
  ref: RefObject<HTMLElement | null>,
  options: UseIntersectionObserverOptions = {}
): boolean {
  const { threshold = 0, rootMargin = '0px', once = false } = options;
  const [isIntersecting, setIsIntersecting] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry) {
          setIsIntersecting(entry.isIntersecting);
          if (entry.isIntersecting && once) {
            observer.unobserve(element);
          }
        }
      },
      { threshold, rootMargin }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, threshold, rootMargin, once]);

  return isIntersecting;
}
