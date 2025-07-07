"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

export default function SplitFlap({ text }: { text?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    audioRef.current = new Audio("/sounds/flip.wav");
    audioRef.current.volume = 0.2;

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
            amount: 0.6,
            each: 0.05,
            onStart: () => {
              audioRef.current?.play().catch(() => {});
            },
          },
        }
      );
    }
  }, [text]);

  const safeText = typeof text === "string" ? text : String(text ?? "");

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
