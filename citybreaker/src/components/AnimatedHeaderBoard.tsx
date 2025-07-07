"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import SplitFlapBoard from "@/components/SplitFlapBoard";
import CityBreakerLogo from "@/components/CityBreakerLogo"; // ✅ make sure this file exists

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
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (containerRef.current) {
      gsap.fromTo(
        containerRef.current,
        { y: -100, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 1,
          ease: "power4.out",
        }
      );
    }
  }, []);

  const toggleBoard = () => {
    setExpanded((prev) => !prev);
    if (boardRef.current) {
      gsap.to(boardRef.current, {
        height: expanded ? 0 : "auto",
        opacity: expanded ? 0 : 1,
        duration: 0.5,
        ease: "power2.out",
        onStart: () => {
          if (!expanded) boardRef.current!.style.display = "block";
        },
        onComplete: () => {
          if (expanded) boardRef.current!.style.display = "none";
        },
      });
    }
  };

  return (
    <header
      ref={containerRef}
      className="fixed top-0 left-0 w-full z-40 bg-black/70 backdrop-blur-md border-b border-yellow-500"
    >
      <div className="flex items-center justify-between px-4 py-2">
        {/* 🔄 Dynamic Logo with GSAP animation */}
        <CityBreakerLogo />

        <button
          onClick={toggleBoard}
          className="text-yellow-300 hover:text-yellow-100 text-sm border border-yellow-400 px-3 py-1 rounded"
        >
          {expanded ? "Hide Cities ▲" : "Show Cities ▼"}
        </button>
      </div>

      <div
        ref={boardRef}
        style={{ height: 0, overflow: "hidden", display: "none", opacity: 0 }}
        className="px-4 pb-2"
      >
        <SplitFlapBoard cities={cities} onSelectCity={onSelectCity} />
      </div>
    </header>
  );
}
