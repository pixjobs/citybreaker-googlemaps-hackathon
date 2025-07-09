"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";

interface City {
  name: string;
  timezone: string;
  time?: string;
  salesPitch?: string;
  remark?: string;
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
  const [enrichedCities, setEnrichedCities] = useState<City[]>(cities);

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
    const enrichWithPitches = async () => {
      const results = await Promise.all(
        cities.map(async (city) => {
          try {
            const res = await fetch("/api/city-pitch", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ city: city.name }),
            });
            if (!res.ok) throw new Error("Request failed");
            const data = await res.json();
            return { ...city, salesPitch: data.pitch };
          } catch {
            return city;
          }
        })
      );
      setEnrichedCities(results);
    };
    enrichWithPitches();
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
          duration: 0.5,
          ease: "back.out(1.7)",
          stagger: {
            amount: 0.5,
            each: 0.02,
          },
        }
      );
    }
  }, [enrichedCities]);

  return (
    <div
      ref={boardRef}
      className="w-full bg-black border-2 border-yellow-500 rounded-md font-mono text-sm text-white overflow-auto"
    >
      <div className="grid grid-cols-3 text-yellow-400 px-4 py-2 border-b border-yellow-500 uppercase font-bold tracking-wide text-xs sm:text-sm">
        <div>Time</div>
        <div>Destination</div>
        <div>Pitch</div>
      </div>

      {enrichedCities.map((city, idx) => (
        <div
          key={`city-${idx}`}
          className="grid grid-cols-3 px-4 py-2 hover:bg-yellow-500/10 cursor-pointer text-white border-b border-yellow-700 transition-all"
          onClick={() => onSelectCity(city)}
        >
          <div className="letter text-yellow-200">
            {cityTimes[city.name] ?? "--:--"}
          </div>
          <div className="letter text-yellow-300 font-bold tracking-widest">
            {city.name.toUpperCase()}
          </div>
          <div className="letter text-yellow-100 italic">
            {city.salesPitch || "—"}
          </div>
        </div>
      ))}
    </div>
  );
}
