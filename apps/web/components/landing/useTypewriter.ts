'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Typewriter per the Mainframe reference: after startDelay, reveal one
 * character every `speed` ms. Returns the visible text and whether it's done.
 */
export function useTypewriter(text: string, speed = 38, startDelay = 600) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);
  const saved = useRef(text);
  saved.current = text;

  useEffect(() => {
    setDisplayed('');
    setDone(false);
    let interval: ReturnType<typeof setInterval> | undefined;
    const timeout = setTimeout(() => {
      let i = 0;
      interval = setInterval(() => {
        i += 1;
        setDisplayed(saved.current.slice(0, i));
        if (i >= saved.current.length) {
          if (interval) clearInterval(interval);
          setDone(true);
        }
      }, speed);
    }, startDelay);
    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, [text, speed, startDelay]);

  return { displayed, done };
}
