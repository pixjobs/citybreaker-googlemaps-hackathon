"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import CityMap from "@/components/CityMap";
import ProgressBar from "@/components/ProgressBar";
import SplitFlap from "@/components/SplitFlap";
import AnimatedHeaderBoard from "@/components/AnimatedHeaderBoard";
import SurpriseMe from "@/components/SurpriseMe";
import WelcomePopup from "@/components/WelcomePopup";
import { useMapBounds } from "@/lib/useMapBounds";

interface City {
  name: string;
  timezone: string;
  lat: number;
  lng: number;
}

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
  London: "#ff0000",
  Paris: "#0055A4",
  Berlin: "#000000",
  Mannheim: "#e2001a",
  Prague: "#D7141A",
  Dubai: "#FFC300",
  Beijing: "#ffde00",
  Tokyo: "#bc002d",
  Seoul: "#003478",
  "New York": "#3c3b6e",
  "San Francisco": "#b22222",
};

export default function HomePage() {
  const [selectedCity, setSelectedCity] = useState<City>(CITIES[0]);
  const [isItineraryOpen, setIsItineraryOpen] = useState(false);
  const [isSurpriseMeOpen, setIsSurpriseMeOpen] = useState(false);
  const [mapCenterOverride, setMapCenterOverride] = useState<{ lat: number; lng: number } | null>(null);
  const [cityTime, setCityTime] = useState("--:--");
  const [isSatelliteView, setIsSatelliteView] = useState(false);

  const { map, mapBounds, selectCity, handleMapLoad, handleMapIdle } = useMapBounds();

  const center = useMemo(() => (
    mapCenterOverride
      ? { ...mapCenterOverride, zoom: 17, name: "Suggestion" }
      : { lat: selectedCity.lat, lng: selectedCity.lng, zoom: 14, name: selectedCity.name }
  ), [selectedCity, mapCenterOverride]);

  const handlePlaceNavigate = useCallback((place: google.maps.places.Place) => {
    if (!map) return;
    if (place.viewport) {
      map.fitBounds(place.viewport);
    } else if (place.location) {
      map.setCenter(place.location);
      map.setZoom(19);
    }
  }, [map]);

  const handleSelectCity = useCallback((city: City) => {
    setSelectedCity(city);
    setMapCenterOverride(null);
    if (selectCity) {
      selectCity(city);
    }
  }, [selectCity]);

  const handleMenuAction = useCallback((action: string) => {
    switch (action) {
      case "toggle-satellite":
        setIsSatelliteView((prev) => !prev);
        break;
      case "itinerary":
        setIsItineraryOpen(true);
        break;
      case "surprise-me":
        setIsSurpriseMeOpen(true);
        break;
    }
  }, []);
  
  // ✅ FIX: This function is RESTORED because the SurpriseMe component needs it.
  const handleZoomToLocation = useCallback((loc: { lat: number; lng: number }) => {
    setMapCenterOverride(loc);
  }, []);

  useEffect(() => {
    const updateCityTime = () => {
      try {
        const time = new Intl.DateTimeFormat("en-GB", {
          timeZone: selectedCity.timezone,
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date());
        setCityTime(time);
      } catch {
        setCityTime("--:--");
      }
    };

    updateCityTime();
    const interval = setInterval(updateCityTime, 60000);
    return () => clearInterval(interval);
  }, [selectedCity]);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-black font-geist-sans">
      <WelcomePopup />

      <CityMap
        center={center}
        selectedCityName={selectedCity.name}
        onPlacesLoaded={() => {}}
        isItineraryOpen={isItineraryOpen}
        onCloseItinerary={() => setIsItineraryOpen(false)}
        isSatelliteView={isSatelliteView}
        highlightedLocation={mapCenterOverride}
        onMapLoad={handleMapLoad}
        onMapIdle={handleMapIdle}
        onZoomToLocation={handleZoomToLocation}
      />

      <AnimatedHeaderBoard
        cities={CITIES}
        onSelectCity={handleSelectCity}
        onMenuAction={handleMenuAction}
        onPlaceNavigate={handlePlaceNavigate}
        mapBounds={mapBounds}
        isSatelliteView={isSatelliteView}
      />

      <SurpriseMe
        isOpen={isSurpriseMeOpen}
        onClose={() => setIsSurpriseMeOpen(false)}
        city={selectedCity}
        onZoomToLocation={handleZoomToLocation}
      />

      <ProgressBar />

      <div
        className="fixed bottom-6 left-6 z-30 hidden md:flex flex-col bg-black/80 px-4 py-2 rounded shadow-lg"
        style={{
          border: `1px solid ${COUNTRY_COLORS[selectedCity.name] || "white"}`,
          color: COUNTRY_COLORS[selectedCity.name] || "white",
        }}
      >
        <div className="flex items-center gap-2">
          <SplitFlap text={selectedCity.name} />
        </div>
        <span className="text-xs mt-1 text-white/80">{cityTime}</span>
      </div>
    </div>
  );
}