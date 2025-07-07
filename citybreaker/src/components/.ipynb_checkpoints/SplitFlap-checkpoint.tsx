"use client";

import { useEffect, useState } from "react";
import gsap from "gsap";

export default function SplitFlap({
  text,
}: {
  text: string;
}) {
  const [displayedLetters, setDisplayedLetters] = useState<string[]>([]);

  useEffect(() => {
    const newLetters = text.toUpperCase().split("");
    const oldLetters = displayedLetters.length ? displayedLetters : newLetters;

    // animate each letter from old to new
    newLetters.forEach((letter, idx) => {
      const current = oldLetters[idx] || " ";
      const target = letter;

      if (current !== target) {
        // animate a “flip”
        gsap.to(`.tile-${idx}`, {
          rotateX: 90,
          opacity: 0,
          duration: 0.2,
          ease: "power1.in",
          delay: idx * 0.05,
          onComplete: () => {
            setDisplayedLetters((prev) => {
              const updated = [...prev];
              updated[idx] = target;
              return updated;
            });
            gsap.to(`.tile-${idx}`, {
              rotateX: 0,
              opacity: 1,
              duration: 0.2,
              ease: "power1.out",
            });
          },
        });
      }
    });

    // set missing letters instantly
    if (newLetters.length > oldLetters.length) {
      setDisplayedLetters(newLetters);
    }
  }, [text]);

  return (
    <div className="flex gap-1">
      {displayedLetters.map((letter, idx) => (
        <span
          key={idx}
          className={`tile-${idx} inline-block bg-black text-white text-5xl px-2 py-1 border border-white rounded-sm`}
          style={{ transformStyle: "preserve-3d" }}
        >
          {letter}
        </span>
      ))}
    </div>
  );
}
