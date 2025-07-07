"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import SplitFlapBoard from "@/components/SplitFlapBoard";
import CityBreakerLogo from "@/components/CityBreakerLogo";

interface City {
  name: string;
  timezone: string;
  lat: number;
  lng: number;
}

export default function AnimatedHeaderBoard({
  cities,
  onSelectCity,
}: {
  cities: City[];
  onSelectCity: (city: City) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const buttonTextRef = useRef<HTMLSpanElement>(null);
  const [expanded, setExpanded] = useState(false);

  // Animate header entrance
  useEffect(() => {
    if (containerRef.current) {
      gsap.fromTo(
        containerRef.current,
        { y: -80, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.6,
          ease: "power3.out",
        }
      );
    }
  }, []);

  // Expand/collapse SplitFlapBoard
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;

    if (expanded) {
      el.style.display = "block";
      gsap.fromTo(
        el,
        { height: 0, opacity: 0 },
        {
          height: "auto",
          opacity: 1,
          duration: 0.35,
          ease: "power2.out",
          clearProps: "height",
        }
      );
    } else {
      gsap.to(el, {
        height: 0,
        opacity: 0,
        duration: 0.3,
        ease: "power2.in",
        onComplete: () => {
          el.style.display = "none";
        },
      });
    }

    // Animate the button label
    if (buttonTextRef.current) {
      gsap.fromTo(
        buttonTextRef.current,
        { y: -10, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.3,
          ease: "back.out(1.7)",
        }
      );
    }
  }, [expanded]);

  // Handler for when a city is selected
  const handleCitySelect = (city: City) => {
    // Collapse the board
    setExpanded(false);
    // Notify parent
    onSelectCity(city);
  };

  return (
    <header
      ref={containerRef}
      className="fixed top-0 left-0 w-full z-40 bg-black/70 backdrop-blur-md border-b border-yellow-500 shadow-md"
    >
      <div className="flex items-center justify-between px-4 py-2">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <CityBreakerLogo />
          <span className="text-yellow-400 font-bold tracking-wider text-lg hidden sm:inline">
          </span>
        </div>

        {/* Toggle Button */}
        <button
          onClick={() => setExpanded((prev) => !prev)}
          className="text-yellow-300 hover:text-yellow-100 text-sm border border-yellow-400 px-3 py-1 rounded transition"
        >
          <span ref={buttonTextRef}>
            {expanded ? "Hide Cities ▲" : "Show Cities ▼"}
          </span>
        </button>
      </div>

      {/* City Board (with auto-collapse animation) */}
      <div
        ref={boardRef}
        style={{ height: 0, display: "none", opacity: 0, overflow: "hidden" }}
        className="px-4 pb-2 will-change-[height,opacity]"
      >
        <SplitFlapBoard cities={cities} onSelectCity={handleCitySelect} />
      </div>
    </header>
  );
}
