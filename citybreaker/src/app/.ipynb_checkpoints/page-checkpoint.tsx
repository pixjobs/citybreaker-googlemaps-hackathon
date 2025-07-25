"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import gsap from "gsap";
import Image from "next/image";

// Component & Hook Imports
import CityMap from "@/components/CityMap";
import ProgressBar from "@/components/ProgressBar";
import SplitFlap from "@/components/SplitFlap";
import AnimatedHeaderBoard from "@/components/AnimatedHeaderBoard";
import SurpriseMe from "@/components/SurpriseMe";
import { useMapBounds } from "@/lib/useMapBounds"; // Using the custom hook for clean state management
import type { RichWelcomeData } from "@/types";

// --- TYPE DEFINITIONS ---
interface City {
  name: string;
  timezone: string;
  lat: number;
  lng: number;
}

// --- CONSTANTS (defined outside component to prevent re-creation) ---
const CITIES: City[] = [
  { name: "London", timezone: "Europe/London", lat: 51.5074, lng: -0.1278 },
  { name: "Paris", timezone: "Europe/Paris", lat: 48.8566, lng: 2.3522 },
  { name: "Berlin", timezone: "Europe/Berlin", lat: 52.52, lng: 13.405 },
  { name: "Mannheim", timezone: "Europe/Berlin", lat: 49.4875, lng: 8.466 },
  { name: "Prague", timezone: "Europe/Prague", lat: 50.0755, lng: 14.4378 },
  { name: "Dubai", timezone: "Asia/Dubai", lat: 25.2048, lng: 55.2708 },
  { name: "Beijing", timezone: "Asia/Shanghai", lat: 39.9042, lng: 116.4074 },
  { name: "Tokyo", timezone: "Asia/Tokyo", lat: 35.6895, lng: 139.6917 },
  { name: "Seoul", timezone: "Asia/Seoul", lat: 37.5665, lng: 126.978 },
  { name: "New York", timezone: "America/New_York", lat: 40.7128, lng: -74.006 },
  { name: "San Francisco", timezone: "America/Los_Angeles", lat: 37.7749, lng: -122.4194 },
];

const COUNTRY_COLORS: Record<string, string> = {
  London: "#ff0000", Paris: "#0055A4", Berlin: "#000000", Mannheim: "#e2001a",
  Prague: "#D7141A", Dubai: "#FFC300", Beijing: "#ffde00", Tokyo: "#bc002d",
  Seoul: "#003478", "New York": "#3c3b6e", "San Francisco": "#b22222",
};

// --- MAIN COMPONENT ---
export default function HomePage() {
  // --- STATE MANAGEMENT ---
  const [selectedCity, setSelectedCity] = useState<City>(CITIES[0]);
  const [placePhotos, setPlacePhotos] = useState<string[]>([]);
  const [isItineraryOpen, setIsItineraryOpen] = useState(false);
  const [isSurpriseMeOpen, setIsSurpriseMeOpen] = useState(false);
  const [richData, setRichData] = useState<RichWelcomeData | null>(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [mounted, setMounted] = useState(false);
  const bannerRef = useRef<HTMLDivElement>(null);
  const [mapCenterOverride, setMapCenterOverride] = useState<{ lat: number; lng: number } | null>(null);
  const [cityTime, setCityTime] = useState("--:--");

  // State for UI toggles, controlled by the main page
  const [isSatelliteView, setIsSatelliteView] = useState(false);
  const [showLandmarks, setShowLandmarks] = useState(false);
  const [showRestaurants, setShowRestaurants] = useState(false);

  // Using the custom hook to cleanly manage all map-related state and handlers.
  const { map, mapBounds, handleMapLoad, handleMapIdle } = useMapBounds();

  // --- DERIVED STATE ---
  const center = useMemo(
    () =>
      mapCenterOverride
        ? { ...mapCenterOverride, zoom: 17, name: "Suggestion" }
        : { lat: selectedCity.lat, lng: selectedCity.lng, zoom: 14, name: selectedCity.name },
    [selectedCity, mapCenterOverride]
  );

  // --- MEMOIZED CALLBACKS ---
  // Using useCallback ensures stable function references are passed as props, preventing unnecessary re-renders.

  const handlePlaceNavigate = useCallback((place: google.maps.places.PlaceResult) => {
      if (!map) return;
      if (place.geometry?.viewport) {
        map.fitBounds(place.geometry.viewport);
      } else if (place.geometry?.location) {
        map.setCenter(place.geometry.location);
        map.setZoom(17);
      }
    }, [map]);

  const handleSelectCity = useCallback((city: City) => {
    setPlacePhotos([]);
    setSelectedCity(city);
    // Reset toggles when changing city for a clean slate
    setShowLandmarks(false);
    setShowRestaurants(false);
    setMapCenterOverride(null);
  }, []);

  const handlePlacesLoaded = useCallback((photos: string[]) => {
    setPlacePhotos(photos.slice(0, 5));
  }, []);

  const handleMenuAction = useCallback((action: string) => {
    switch (action) {
      case "toggle-satellite":
        setIsSatelliteView(prev => !prev);
        break;
      case "toggle-landmarks":
        setShowLandmarks(prev => !prev);
        break;
      case "toggle-restaurants":
        setShowRestaurants(prev => !prev);
        break;
      case "itinerary":
        setIsItineraryOpen(true);
        break;
      case "surprise-me":
        setIsSurpriseMeOpen(true);
        break;
    }
  }, []);

  const handleZoomToLocation = useCallback((location: { lat: number; lng: number }) => {
    setMapCenterOverride(location);
  }, []);

  // --- SIDE EFFECTS ---
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const updateCityTime = () => {
      try {
        const time = new Intl.DateTimeFormat("en-GB", { timeZone: selectedCity.timezone, hour: "2-digit", minute: "2-digit" }).format(new Date());
        setCityTime(time);
      } catch { setCityTime("--:--"); }
    };
    updateCityTime();
    const intervalId = setInterval(updateCityTime, 60000);
    return () => clearInterval(intervalId);
  }, [selectedCity]);

  useEffect(() => {
    async function fetchRich() {
      setRichData(null); // Clear old data immediately for a fresh feel
      try {
        const res = await fetch("/api/travel-tips", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ destination: selectedCity.name }) });
        if (!res.ok) throw new Error("Failed to fetch travel tips");
        setRichData(await res.json());
      } catch (error) {
        console.error(error);
        setRichData({ intro: `Welcome to ${selectedCity.name}!`, vibeKeywords: [], mustDo: "", hiddenGem: "", foodieTip: "" });
      }
    }
    fetchRich();
  }, [selectedCity]);

  useEffect(() => {
    if (!placePhotos.length) return;
    const interval = setInterval(() => setCurrentSlide(i => (i + 1) % placePhotos.length), 5000);
    return () => clearInterval(interval);
  }, [placePhotos]);

  useEffect(() => {
    if (!mounted || !richData) return;
    const banner = bannerRef.current;
    if (!banner) return;
    const tl = gsap.timeline({ defaults: { ease: "power2.out" } });
    tl.fromTo(banner, { y: -30, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.4 })
      .to({}, { duration: 10 })
      .to(banner, { y: 30, autoAlpha: 0, duration: 0.4 });
    return () => tl.kill();
  }, [mounted, richData]);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-black">
      <CityMap
        center={center}
        onPlacesLoaded={handlePlacesLoaded}
        isItineraryOpen={isItineraryOpen}
        onCloseItinerary={() => setIsItineraryOpen(false)}
        isSatelliteView={isSatelliteView}
        showLandmarks={showLandmarks}
        showRestaurants={showRestaurants}
        highlightedLocation={mapCenterOverride}
        onMapLoad={handleMapLoad}
        onMapIdle={handleMapIdle}
      />

      <AnimatedHeaderBoard
        cities={CITIES}
        onSelectCity={handleSelectCity}
        onMenuAction={handleMenuAction}
        onPlaceNavigate={handlePlaceNavigate}
        mapBounds={mapBounds}
        isSatelliteView={isSatelliteView}
        showLandmarks={showLandmarks}
        showRestaurants={showRestaurants}
      />

      {mounted && richData && (
        <div ref={bannerRef} className="absolute inset-0 flex items-center justify-center z-20 p-4 sm:p-0 pointer-events-none">
          <div className="relative w-full max-w-md bg-gradient-to-t from-black/90 to-black/60 backdrop-blur-md rounded-xl overflow-hidden shadow-2xl">
            {placePhotos[currentSlide] && (
              <div className="relative w-full h-48">
                <Image src={placePhotos[currentSlide]} alt="City view" fill className="object-cover" sizes="(max-width: 768px) 100vw, 448px" priority />
              </div>
            )}
            <div className="p-4 text-yellow-200">
              <p className="font-mono text-base sm:text-lg tracking-wide mb-2">{richData.intro}</p>
              <div className="flex flex-wrap gap-1 mb-2">
                {richData.vibeKeywords.map((kw) => (
                  <span key={kw} className="text-xs px-2 py-1 bg-yellow-800/50 rounded-full">{kw}</span>
                ))}
              </div>
              <ul className="text-xs space-y-1 font-sans">
                {richData.mustDo && <li><span className="text-lg leading-none">⚡</span> {richData.mustDo}</li>}
                {richData.hiddenGem && <li><span className="text-lg leading-none">💎</span> {richData.hiddenGem}</li>}
                {richData.foodieTip && <li><span className="text-lg leading-none">🍴</span> {richData.foodieTip}</li>}
              </ul>
            </div>
          </div>
        </div>
      )}

      <SurpriseMe isOpen={isSurpriseMeOpen} onClose={() => setIsSurpriseMeOpen(false)} city={selectedCity} onZoomToLocation={handleZoomToLocation} />

      <ProgressBar />

      <div
        className="fixed bottom-6 left-6 z-30 hidden md:flex flex-col bg-black/80 px-4 py-2 rounded shadow-lg"
        style={{ border: `1px solid ${COUNTRY_COLORS[selectedCity.name] || 'white'}`, color: COUNTRY_COLORS[selectedCity.name] || 'white' }}
      >
        <div className="flex items-center gap-2">
          <SplitFlap text={selectedCity.name} />
        </div>
        <span className="text-xs mt-1 text-white/80">{cityTime}</span>
      </div>
    </div>
  );
}