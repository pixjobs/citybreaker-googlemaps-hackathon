"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export default function ProgressBar() {
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bar = progressRef.current;

    gsap.to(bar, {
      scaleX: 1,
      transformOrigin: "left center",
      ease: "none",
      scrollTrigger: {
        trigger: "body",
        start: "top top",
        end: "bottom bottom",
        scrub: 0.2,
        onUpdate: (self) => {
          if (self.isActive) {
            gsap.to(bar, { opacity: 1, duration: 0.2 });
          }
        },
        onScrubComplete: () => {
          gsap.to(bar, { opacity: 0, duration: 0.5 });
        },
      },
    });
  }, []);

  return (
    <div className="fixed top-0 left-0 w-full h-1 z-50 bg-gray-700/50 overflow-hidden">
      <div
        ref={progressRef}
        className="h-full bg-retro-neonGreen opacity-0 scale-x-0"
      ></div>
    </div>
  );
}
