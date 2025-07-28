// lib/useLongPress.ts
import { useCallback, useRef, useState } from "react";

interface LongPressOptions {
  shouldPreventDefault?: boolean;
  delay?: number;
}

type PressEvent = React.MouseEvent | React.TouchEvent;

export const useLongPress = (
  onLongPress: (event: PressEvent) => void,
  onClick: () => void,
  { shouldPreventDefault = true, delay = 500 }: LongPressOptions = {}
) => {
  const [longPressTriggered, setLongPressTriggered] = useState(false);
  const timeout = useRef<NodeJS.Timeout>();
  const target = useRef<EventTarget | null>(null);

  const preventDefault = useCallback((e: Event) => {
    if ("touches" in e && e.touches.length < 2 && e.cancelable) {
      e.preventDefault();
    }
  }, []);

  const start = useCallback(
    (event: PressEvent) => {
      if (shouldPreventDefault && event.target) {
        event.target.addEventListener("touchend", preventDefault, { passive: false });
        target.current = event.target;
      }

      timeout.current = setTimeout(() => {
        onLongPress(event);
        setLongPressTriggered(true);
      }, delay);
    },
    [onLongPress, delay, shouldPreventDefault, preventDefault]
  );

  const clear = useCallback(
    (event: PressEvent, shouldTriggerClick = true) => {
      if (timeout.current) {
        clearTimeout(timeout.current);
      }

      if (shouldTriggerClick && !longPressTriggered) {
        onClick();
      }

      setLongPressTriggered(false);

      if (shouldPreventDefault && target.current) {
        target.current.removeEventListener("touchend", preventDefault);
        target.current = null;
      }
    },
    [onClick, longPressTriggered, shouldPreventDefault, preventDefault]
  );

  return {
    onMouseDown: (e: React.MouseEvent) => start(e),
    onTouchStart: (e: React.TouchEvent) => start(e),
    onMouseUp: (e: React.MouseEvent) => clear(e),
    onMouseLeave: (e: React.MouseEvent) => clear(e, false),
    onTouchEnd: (e: React.TouchEvent) => clear(e),
  };
};
