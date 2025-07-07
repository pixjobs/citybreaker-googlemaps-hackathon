"use client";

import { useState, useEffect } from "react";
import CityMap from "@/components/CityMap";
import TravelText from "@/components/TravelText";
import FABMenu from "@/components/FABMenu";
import ProgressBar from "@/components/ProgressBar";
import CitySelector from "@/components/CitySelector";
import SplitFlap from "@/components/SplitFlap";

export default function HomePage() {
  const [started, setStarted] = useState(false);
  const [currentCityName, setCurrentCityName] = useState<string>("London");
  const [showTravelText, setShowTravelText] = useState(false);

  const countryColors: Record<string, string> = {
    London: "#ff0000", // UK
    Paris: "#0055A4",
    Berlin: "#000000",
    Prague: "#D7141A",
    Beijing: "#ffde00",
    Seoul: "#003478",
    Tokyo: "#bc002d",
    "San Francisco": "#b22222",
    "New York": "#3c3b6e",
  };

  const cityTimezones: Record<string, string> = {
    London: "Europe/London",
    Paris: "Europe/Paris",
    Berlin: "Europe/Berlin",
    Prague: "Europe/Prague",
    Beijing: "Asia/Shanghai",
    Seoul: "Asia/Seoul",
    Tokyo: "Asia/Tokyo",
    "San Francisco": "America/Los_Angeles",
    "New York": "America/New_York",
  };

  const getCityTime = (name: string) => {
    try {
      return new Intl.DateTimeFormat("en-GB", {
        timeZone: cityTimezones[name] || "UTC",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date());
    } catch {
      return "";
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
          <CitySelector />
          <FABMenu />
          <ProgressBar />

          {/* TravelText animation on arrival */}
          <TravelText
            active={showTravelText}
            destination={currentCityName}
            onComplete={() => setShowTravelText(false)}
          />

          {/* Always‐visible current city name */}
          <div
            className="fixed bottom-6 left-6 z-30 hidden md:flex flex-col bg-black/80 px-4 py-2 rounded shadow"
            style={{
              border: "2px solid white",
              color: countryColors[currentCityName] || "#00ff00",
            }}
          >
            <div className="flex items-center gap-2">
              <SplitFlap text={currentCityName} />
              <span className="text-xl">✈️ 🌍 🗺️</span>
            </div>
            <span className="text-xs mt-1 text-white">
              {getCityTime(currentCityName)}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
