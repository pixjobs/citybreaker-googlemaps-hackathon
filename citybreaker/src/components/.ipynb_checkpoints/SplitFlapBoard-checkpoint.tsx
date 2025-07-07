"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";

interface City {
  name: string;
  timezone: string;
  lat: number;
  lng: number;
}

export default function SplitFlapBoard({
  cities,
  onSelectCity,
}: {
  cities: City[];
  onSelectCity: (city: City) => void;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [cityTimes, setCityTimes] = useState<Record<string, string>>({});

  useEffect(() => {
    const updateTimes = () => {
      const updated: Record<string, string> = {};
      cities.forEach((c) => {
        try {
          updated[c.name] = new Intl.DateTimeFormat("en-GB", {
            timeZone: c.timezone,
            hour: "2-digit",
            minute: "2-digit",
          }).format(new Date());
        } catch {
          updated[c.name] = "--:--";
        }
      });
      setCityTimes(updated);
    };
    updateTimes();
    const interval = setInterval(updateTimes, 60_000);
    return () => clearInterval(interval);
  }, [cities]);

  useEffect(() => {
    if (boardRef.current) {
      const allLetters = boardRef.current.querySelectorAll(".letter");
      gsap.fromTo(
        allLetters,
        { rotateX: 90, opacity: 0 },
        {
          rotateX: 0,
          opacity: 1,
          duration: 0.6,
          ease: "back.out(2)",
          stagger: {
            amount: 1,
            each: 0.05,
          },
        }
      );
    }
  }, [cities]);

  return (
    <div
      ref={boardRef}
      className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-black/90 border border-yellow-400 p-4 rounded text-yellow-300 font-mono uppercase text-sm sm:text-base"
    >
      {cities.map((city, idx) => (
        <div
          key={`city-${idx}`}
          className="flex flex-col cursor-pointer hover:bg-yellow-600/20 transition px-2 py-3 rounded"
          onClick={() => onSelectCity(city)}
        >
          <div className="flex gap-1 flex-wrap mb-1">
            {city.name.split("").map((c, i) => (
              <span
                key={i}
                className="letter inline-block px-1 py-0.5 rounded shadow border border-yellow-500"
              >
                {c}
              </span>
            ))}
          </div>
          <span className="text-xs sm:text-sm text-yellow-200">
            {cityTimes[city.name] ?? "--:--"}
          </span>
        </div>
      ))}
    </div>
  );
}
