"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

export default function TravelText({
  active,
  destination,
  onComplete,
}: {
  active: boolean;
  destination: string;
  onComplete: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const cityFacts: Record<string, string> = {
    London: "London boasts over 170 museums, including the British Museum and Tate Modern.",
    Paris: "Paris welcomes 30 million visitors a year, featuring the Eiffel Tower and Louvre.",
    Berlin: "Berlin has more bridges than Venice, a thriving arts scene, and the Berlin Wall memorial.",
    Prague: "Prague Castle is the largest ancient castle in the world, dating to the 9th century.",
    Beijing: "Beijing’s Forbidden City, once closed to commoners, has 980 buildings.",
    Seoul: "Seoul is a tech capital with 14 UNESCO sites and the world’s fastest internet.",
    Tokyo: "Tokyo has the most Michelin-starred restaurants in the world and neon wonderlands.",
    "San Francisco": "San Francisco’s Golden Gate Bridge opened in 1937 and is world-renowned.",
    "New York": "New York has the world’s largest subway system, moving 5 million daily riders.",
  };

  useEffect(() => {
    if (active && ref.current) {
      const el = ref.current;

      const fact = cityFacts[destination] || `Welcome to ${destination}!`;

      el.innerHTML = fact
        .split("")
        .map((c) => `<span class="letter">${c}</span>`)
        .join("");

      const letterSpans = el.querySelectorAll<HTMLSpanElement>(".letter");

      const tl = gsap.timeline();

      tl.set(el, { opacity: 0, scale: 0.8, rotateY: -30, display: "block" })
        .to(el, {
          opacity: 1,
          scale: 1,
          rotateY: 0,
          duration: 1,
          ease: "elastic.out(1, 0.5)",
        })
        .fromTo(
          letterSpans,
          { opacity: 0, y: 50, rotateX: 180 },
          {
            opacity: 1,
            y: 0,
            rotateX: 0,
            duration: 0.8,
            ease: "back.out(1.7)",
            stagger: {
              amount: 1,
              each: 0.05,
              from: "start",
            },
          },
          "<"
        )
        .add(() => {
          // simulate random flicker effect
          letterSpans.forEach((span) => {
            gsap.to(span, {
              opacity: 0.3,
              duration: 0.05,
              repeat: 3,
              yoyo: true,
              delay: Math.random() * 2,
              ease: "sine.inOut",
            });
          });
        })
        .to({}, { duration: 5 }) // hold for reading
        .to(letterSpans, {
          opacity: 0,
          y: -30,
          rotateX: 90,
          duration: 0.6,
          ease: "power2.in",
          stagger: 0.02,
        })
        .to(
          el,
          {
            opacity: 0,
            scale: 0.8,
            rotateY: 30,
            duration: 0.5,
            ease: "power4.in",
            onComplete: () => {
              onComplete();
              gsap.set(el, { display: "none" });
            },
          },
          "<+0.3"
        );
    }
  }, [active, destination, onComplete]);

  return (
    <div
      ref={ref}
      className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-black/95 text-yellow-300 font-mono text-center text-xl z-50 pointer-events-none px-6 py-4 rounded border-2 border-yellow-400 max-w-2xl"
      style={{ display: "none", lineHeight: "1.4" }}
    ></div>
  );
}
