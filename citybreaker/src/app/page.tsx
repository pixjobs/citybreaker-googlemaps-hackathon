"use client";

import { useState, useEffect } from "react";
import CityMap from "@/components/CityMap";
import TravelText from "@/components/TravelText";
import FABMenu from "@/components/FABMenu";
import ProgressBar from "@/components/ProgressBar";
import SplitFlap from "@/components/SplitFlap";
import SplitFlapBoard from "@/components/SplitFlapBoard";

export default function HomePage() {
  const [started, setStarted] = useState(false);
  const [currentCityName, setCurrentCityName] = useState<string>("London");
  const [showTravelText, setShowTravelText] = useState(false);

  const countryColors: Record<string, string> = {
    London: "#ff0000",
    Paris: "#0055A4",
    Berlin: "#000000",
    Prague: "#D7141A",
    Beijing: "#ffde00",
    Seoul: "#003478",
    Tokyo: "#bc002d",
    "San Francisco": "#b22222",
    "New York": "#3c3b6e",
  };

  const cities = [
    { name: "London", timezone: "Europe/London" },
    { name: "Paris", timezone: "Europe/Paris" },
    { name: "Berlin", timezone: "Europe/Berlin" },
    { name: "Prague", timezone: "Europe/Prague" },
    { name: "Beijing", timezone: "Asia/Shanghai" },
    { name: "Seoul", timezone: "Asia/Seoul" },
    { name: "Tokyo", timezone: "Asia/Tokyo" },
    { name: "San Francisco", timezone: "America/Los_Angeles" },
    { name: "New York", timezone: "America/New_York" },
  ];

  const cityTimezones: Record<string, string> = Object.fromEntries(
    cities.map((c) => [c.name, c.timezone])
  );

  const getCityTime = (name: string) => {
    try {
      return new Intl.DateTimeFormat("en-GB", {
        timeZone: cityTimezones[name] || "UTC",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date());
    } catch {
      return "--:--";
    }
  };

  useEffect(() => {
    const handleCitySelect = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.name) {
        setCurrentCityName(detail.name);
        setShowTravelText(true);
      }
    };
    window.addEventListener("citySelect", handleCitySelect);
    return () => window.removeEventListener("citySelect", handleCitySelect);
  }, []);

  return (
    <div className="relative w-full h-screen overflow-hidden">
      <CityMap />

      {!started && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/90 text-white z-50"
          onClick={() => setStarted(true)}
        >
          <h1 className="text-4xl font-bold">Click to Start</h1>
        </div>
      )}

      {started && (
        <>
          <FABMenu />
          <ProgressBar />

          <TravelText
            active={showTravelText}
            destination={currentCityName}
            onComplete={() => setShowTravelText(false)}
          />

          {/* current city splitflap on bottom left */}
          <div
            className="fixed bottom-6 left-6 z-30 hidden md:flex flex-col bg-black/80 px-4 py-2 rounded shadow"
            style={{
              border: "2px solid white",
              color: countryColors[currentCityName] || "#00ff00",
            }}
          >
            <div className="flex items-center gap-2">
              <SplitFlap text={currentCityName} />

            </div>
            <span className="text-xs mt-1 text-white">
              {getCityTime(currentCityName)}
            </span>
          </div>

          {/* interactive airport board */}
          <section className="absolute top-6 right-6 z-30 max-w-lg hidden md:block">
            <SplitFlapBoard
              cities={cities}
              onSelectCity={(city) => {
                window.dispatchEvent(
                  new CustomEvent("citySelect", {
                    detail: {
                      name: city.name,  // fixed here
                      lat: 0,           // coordinate details can be filled later
                      lng: 0,
                      zoom: 12,
                    },
                  })
                );
              }}
            />
          </section>
        </>
      )}
    </div>
  );
}
