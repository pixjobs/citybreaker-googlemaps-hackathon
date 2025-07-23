"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import * as Icons from "lucide-react";
import type { LucideProps } from "lucide-react";

const cityPitchCache: Record<string, { salesPitch?: string; icons?: string[] }> = {};

// --- FIX: This is the complete City interface, matching the parent components ---
// It now correctly includes all required properties.
interface City {
  name: string;
  timezone: string;
  lat: number;
  lng: number;
  salesPitch?: string;
  icons?: string[];
}

type IconCollection = Record<string, React.ComponentType<LucideProps>>;

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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Hydration-safe time updating
  useEffect(() => {
    if (!mounted) return;
    const updateTimes = () => {
      const times: Record<string, string> = {};
      cities.forEach(c => {
        try {
          times[c.name] = new Intl.DateTimeFormat("en-GB", {
            timeZone: c.timezone,
            hour: "2-digit",
            minute: "2-digit",
          }).format(new Date());
        } catch {
          times[c.name] = "--:--";
        }
      });
      setCityTimes(times);
    };
    updateTimes();
    const intervalId = setInterval(updateTimes, 60000);
    return () => clearInterval(intervalId);
  }, [cities, mounted]);

  // Fetch pitch and icons, using cache
  useEffect(() => {
    let isCancelled = false;
    (async () => {
      const results: City[] = await Promise.all(
        cities.map(async city => {
          if (cityPitchCache[city.name]) {
            return { ...city, ...cityPitchCache[city.name] };
          }
          try {
            const res = await fetch("/api/city-pitch", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ city: city.name }),
            });
            if (!res.ok) throw new Error("Network error");
            const { pitch, icons } = await res.json();
            cityPitchCache[city.name] = { salesPitch: pitch, icons };
            return { ...city, salesPitch: pitch, icons };
          } catch {
            cityPitchCache[city.name] = {};
            return city;
          }
        })
      );
      if (!isCancelled) setEnrichedCities(results);
    })();
    return () => { isCancelled = true; };
  }, [cities]);

  // GSAP animation
  useEffect(() => {
    if (!mounted || !boardRef.current) return;
    const letters = boardRef.current.querySelectorAll('.letter');
    gsap.fromTo(
      letters,
      { rotateX: 90, opacity: 0 },
      { rotateX: 0, opacity: 1, duration: 0.3, ease: 'back.out(1.7)', stagger: 0.02 }
    );
  }, [mounted, enrichedCities]);

  return (
    <div
      ref={boardRef}
      className="w-full bg-black border-2 border-yellow-500 rounded-md font-mono text-sm text-white overflow-auto"
    >
      <div className="grid grid-cols-3 text-yellow-400 px-4 py-2 border-b border-yellow-500 uppercase font-bold tracking-wide text-xs">
        <div>Time</div>
        <div>Destination</div>
        <div>Info</div>
      </div>

      {enrichedCities.map((city, idx) => (
        <div
          key={idx}
          className="grid grid-cols-3 px-4 py-2 hover:bg-yellow-500/10 cursor-pointer border-b border-yellow-700 transition-all items-center"
          onClick={() => onSelectCity(city)}
        >
          <div className="letter text-yellow-200">{cityTimes[city.name] ?? '--:--'}</div>
          <div className="letter text-yellow-300 font-bold tracking-widest">
            {city.name.toUpperCase()}
          </div>
          <div className="flex justify-center space-x-2">
            {city.icons && city.icons.length > 0 ? (
              city.icons.map(iconName => {
                const IconComp = (Icons as IconCollection)[iconName];
                return IconComp ? (
                  <IconComp
                    key={iconName}
                    size={18}
                    title={city.salesPitch}
                    className="text-yellow-200 hover:text-yellow-100"
                    onClick={e => e.stopPropagation()}
                  />
                ) : null;
              })
            ) : (
              <span className="text-yellow-700">—</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}