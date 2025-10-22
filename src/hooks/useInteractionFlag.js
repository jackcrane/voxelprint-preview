import { useCallback, useEffect, useRef, useState } from "react";

export const useInteractionFlag = (delay = 220) => {
  const [isInteracting, setIsInteracting] = useState(false);
  const timeoutRef = useRef(null);

  const clearTimer = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const markInteracting = useCallback(() => {
    setIsInteracting(true);
    clearTimer();
    timeoutRef.current = setTimeout(() => {
      setIsInteracting(false);
      timeoutRef.current = null;
    }, delay);
  }, [delay]);

  useEffect(() => clearTimer, []);

  return { isInteracting, markInteracting };
};
