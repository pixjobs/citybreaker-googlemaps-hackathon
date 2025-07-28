"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

export default function SplitFlap({ text }: { text?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  const safeText = typeof text === "string" ? text : "";

  // Initial entrance animation
  useEffect(() => {
    if (containerRef.current) {
      const letters = containerRef.current.querySelectorAll(".letter");

      gsap.fromTo(
        letters,
        { rotateX: 90, opacity: 0 },
        {
          rotateX: 0,
          opacity: 1,
          duration: 0.6,
          ease: "back.out(2)",
          stagger: {
            each: 0.05,
          },
        }
      );
    }
  }, [safeText]);

  // Simulate chatter flips every 12s
  useEffect(() => {
    const interval = setInterval(() => {
      if (containerRef.current) {
        const letters = containerRef.current.querySelectorAll(".letter");

        // Simulate flipping away and back in
        gsap.to(letters, {
          rotateX: 90,
          opacity: 0.5,
          duration: 0.3,
          ease: "power2.in",
          stagger: {
            each: 0.02,
          },
          onComplete: () => {
            gsap.to(letters, {
              rotateX: 0,
              opacity: 1,
              duration: 0.3,
              ease: "back.out(2)",
              stagger: {
                each: 0.02,
              },
            });
          },
        });
      }
    }, 12000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div
      ref={containerRef}
      className="flex gap-1 text-yellow-300 font-mono text-4xl uppercase tracking-tight"
    >
      {safeText.split("").map((char, idx) => (
        <span
          key={idx}
          className="letter inline-block bg-black px-1 py-1 rounded shadow border border-yellow-500"
        >
          {char}
        </span>
      ))}
    </div>
  );
}
