"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react"; // 1. Import useMemo
import gsap from "gsap";
import CityMap from "@/components/CityMap";
import TravelText from "@/components/TravelText";
import ProgressBar from "@/components/ProgressBar";
import SplitFlap from "@/components/SplitFlap";
import AnimatedHeaderBoard from "@/components/AnimatedHeaderBoard";

interface City {
  name: string;
  timezone: string;
  lat: number;
  lng: number;
}

export default function HomePage() {
  const cities: City[] = [
    { name: "London", timezone: "Europe/London", lat: 51.5074, lng: -0.1278 },
    { name: "Paris", timezone: "Europe/Paris", lat: 48.8566, lng: 2.3522 },
    { name: "Berlin", timezone: "Europe/Berlin", lat: 52.52, lng: 13.405 },
    { name: "Prague", timezone: "Europe/Prague", lat: 50.0755, lng: 14.4378 },
    { name: "Dubai", timezone: "Asia/Dubai", lat: 25.2048, lng: 55.2708 },
    { name: "Beijing", timezone: "Asia/Shanghai", lat: 39.9042, lng: 116.4074 },
    { name: "Tokyo", timezone: "Asia/Tokyo", lat: 35.6895, lng: 139.6917 },
    { name: "Seoul", timezone: "Asia/Seoul", lat: 37.5665, lng: 126.978 },
    { name: "New York", timezone: "America/New_York", lat: 40.7128, lng: -74.006 },
    { name: "San Francisco", timezone: "America/Los_Angeles", lat: 37.7749, lng: -122.4194 },
  ];

  const countryColors: Record<string, string> = { /* ... */ };

  const [started, setStarted] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  const [selectedCity, setSelectedCity] = useState<City>(cities[0]);
  const introRef = useRef<HTMLDivElement>(null);

  const [isSequenceReady, setIsSequenceReady] = useState(false);
  const [placePhotos, setPlacePhotos] = useState<string[]>([]);

  const getCityTime = (timezone: string) => { /* ... */ };

  // --- 2. STABILIZE the center object with useMemo ---
  // This object will now only be recreated when `selectedCity` changes.
  const center = useMemo(() => ({
    lat: selectedCity.lat,
    lng: selectedCity.lng,
    zoom: 14,
    name: selectedCity.name
  }), [selectedCity]);

  // --- STABLE HANDLER FUNCTIONS with useCallback ---
  const handleSelectCity = useCallback((city: City) => {
    setIsSequenceReady(false);
    setSelectedCity(city);
  }, []);

  const handlePlacesLoaded = useCallback((photoUrls: string[]) => {
    setPlacePhotos(photoUrls.slice(0, 5));
    setIsSequenceReady(true);
  }, []);

  const handleTravelTextComplete = useCallback(() => {
    setIsSequenceReady(false);
  }, []);

  // Effect for the initial app intro animation
  useEffect(() => {
    if (showIntro && introRef.current) {
      gsap.fromTo(
        introRef.current,
        { opacity: 0, y: 50 },
        {
          opacity: 1, y: 0, duration: 1.2, ease: "power4.out",
          onComplete: () => {
            setTimeout(() => {
              gsap.to(introRef.current, {
                opacity: 0, y: -50, duration: 1, ease: "power2.inOut",
                onComplete: () => {
                  setShowIntro(false);
                  setStarted(true);
                  // For the very first load, we don't need photos, just trigger the sequence.
                  setIsSequenceReady(true);
                },
              });
            }, 4500);
          },
        }
      );
    }
  }, [showIntro]);

  return (
    <div className="relative w-full h-screen overflow-hidden">
      <CityMap
        center={center} // 3. Pass the STABLE memoized object
        onPlacesLoaded={handlePlacesLoaded}
      />

      {showIntro && (
        <div ref={introRef} className="absolute inset-0 flex items-center justify-center bg-black/95 text-white z-50 px-4">
          <TravelText
            active={true}
            destination="CityBreaker is your interactive travel dashboard. Explore cities, see local times, and dive into immersive flight-style transitions."
            imageUrls={[]}
            onComplete={() => {}}
          />
        </div>
      )}

      {started && (
        <>
          <AnimatedHeaderBoard cities={cities} onSelectCity={handleSelectCity} />
          <ProgressBar />
          <TravelText
            active={isSequenceReady}
            destination={selectedCity.name}
            imageUrls={placePhotos}
            onComplete={handleTravelTextComplete}
          />
          <div className="fixed bottom-6 left-6 z-30 hidden md:flex flex-col bg-black/80 px-4 py-2 rounded shadow" style={{ /* ... */ }}>
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