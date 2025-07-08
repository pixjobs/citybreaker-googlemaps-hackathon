"use client";

import { useState, useEffect, useRef } from "react";
import gsap from "gsap";
import CityMap from "@/components/CityMap";
import TravelText from "@/components/TravelText";
import ProgressBar from "@/components/ProgressBar";
import SplitFlap from "@/components/SplitFlap";
import AnimatedHeaderBoard from "@/components/AnimatedHeaderBoard";

// It's good practice to define types outside the component
interface City {
  name: string;
  timezone: string;
  lat: number;
  lng: number;
}

export default function HomePage() {
  // --- Data Configuration ---
  const cities: City[] = [
    { name: "London", timezone: "Europe/London", lat: 51.5074, lng: -0.1278 },
    { name: "Paris", timezone: "Europe/Paris", lat: 48.8566, lng: 2.3522 },
    { name: "Berlin", timezone: "Europe/Berlin", lat: 52.52, lng: 13.405 },
    { name: "Prague", timezone: "Europe/Prague", lat: 50.0755, lng: 14.4378 },
    { name: "Dubai", timezone: "Asia/Dubai", lat: 25.2048, lng: 55.2708 }, // Dubai Added
    { name: "Beijing", timezone: "Asia/Shanghai", lat: 39.9042, lng: 116.4074 },
    { name: "Tokyo", timezone: "Asia/Tokyo", lat: 35.6895, lng: 139.6917 },
    { name: "Seoul", timezone: "Asia/Seoul", lat: 37.5665, lng: 126.978 },
    { name: "New York", timezone: "America/New_York", lat: 40.7128, lng: -74.006 },
    { name: "San Francisco", timezone: "America/Los_Angeles", lat: 37.7749, lng: -122.4194 },
  ];

  const countryColors: Record<string, string> = {
    London: "#ff0000",
    Paris: "#0055A4",
    Berlin: "#000000",
    Prague: "#D7141A",
    Dubai: "#FFC300", // Dubai Color Added
    Beijing: "#ffde00",
    Seoul: "#003478",
    Tokyo: "#bc002d",
    "San Francisco": "#b22222",
    "New York": "#3c3b6e",
  };

  // --- State Management ---
  const [started, setStarted] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  const [showTravelText, setShowTravelText] = useState(false);
  // This is the single source of truth for the selected city
  const [selectedCity, setSelectedCity] = useState<City>(cities[0]);
  const introRef = useRef<HTMLDivElement>(null);

  // --- Helper Functions ---
  const getCityTime = (timezone: string) => {
    try {
      return new Intl.DateTimeFormat("en-GB", {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date());
    } catch {
      return "--:--";
    }
  };

  // --- Effects ---
  // Effect to handle the intro animation
  useEffect(() => {
    if (showIntro && introRef.current) {
      gsap.fromTo(
        introRef.current,
        { opacity: 0, y: 50 },
        {
          opacity: 1,
          y: 0,
          duration: 1.2,
          ease: "power4.out",
          onComplete: () => {
            setTimeout(() => {
              gsap.to(introRef.current, {
                opacity: 0,
                y: -50,
                duration: 1,
                ease: "power2.inOut",
                onComplete: () => {
                  setShowIntro(false);
                  setStarted(true);
                },
              });
            }, 4500);
          },
        }
      );
    }
  }, [showIntro]);

  // Effect to trigger the travel text animation when the city changes
  useEffect(() => {
    // We only want to trigger this after the intro is done
    if (started) {
      setShowTravelText(true);
    }
  }, [selectedCity, started]);

  return (
    <div className="relative w-full h-screen overflow-hidden">
      {/* The map now receives the selected city's data directly as props.
          The zoom level is hardcoded to 14 for a good city-level view. */}
      <CityMap
        center={{
          lat: selectedCity.lat,
          lng: selectedCity.lng,
          zoom: 14, // This ensures the map is zoomed in on the city
          name: selectedCity.name
        }}
      />

      {showIntro && (
        <div
          ref={introRef}
          className="absolute inset-0 flex items-center justify-center bg-black/95 text-white z-50 px-4"
        >
          <TravelText
            active={true}
            destination="CityBreaker is your interactive travel dashboard. Explore cities, see local times, and dive into immersive flight-style transitions."
            onComplete={() => {}}
          />
        </div>
      )}

      {started && (
        <>
          {/* onSelectCity now directly updates the state in this component.
              This is the correct "React way" to handle child-to-parent communication. */}
          <AnimatedHeaderBoard
            cities={cities}
            onSelectCity={setSelectedCity}
          />

          <ProgressBar />

          {/* This component is now driven by the selectedCity state */}
          <TravelText
            active={showTravelText}
            destination={selectedCity.name}
            onComplete={() => setShowTravelText(false)}
          />

          {/* This component is now also driven by the selectedCity state */}
          <div
            className="fixed bottom-6 left-6 z-30 hidden md:flex flex-col bg-black/80 px-4 py-2 rounded shadow"
            style={{
              border: "2px solid white",
              color: countryColors[selectedCity.name] || "#00ff00",
            }}
          >
            <div className="flex items-center gap-2">
              <SplitFlap text={selectedCity.name} />
            </div>
            <span className="text-xs mt-1 text-white">
              {getCityTime(selectedCity.timezone)}
            </span>
          </div>
        </>
      )}
    </div>
  );
}