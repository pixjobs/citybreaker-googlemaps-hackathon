"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import gsap from "gsap";
import CityMap from "@/components/CityMap";
import ProgressBar from "@/components/ProgressBar";
import SplitFlap from "@/components/SplitFlap";
import AnimatedHeaderBoard from "@/components/AnimatedHeaderBoard";
import type { RichWelcomeData } from "@/types";

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

  const countryColors: Record<string, string> = {
    London: "#ff0000",
    Paris: "#0055A4",
    Berlin: "#000000",
    Prague: "#D7141A",
    Dubai: "#FFC300",
    Beijing: "#ffde00",
    Tokyo: "#bc002d",
    Seoul: "#003478",
    "New York": "#3c3b6e",
    "San Francisco": "#b22222",
  };

  const [selectedCity, setSelectedCity] = useState<City>(cities[0]);
  const [placePhotos, setPlacePhotos] = useState<string[]>([]);
  const [searchedPlaceId, setSearchedPlaceId] = useState<string | null>(null);
  const [isItineraryOpen, setIsItineraryOpen] = useState(false);
  const [mapType, setMapType] = useState<'roadmap' | 'satellite'>('roadmap');
  const [richData, setRichData] = useState<RichWelcomeData | null>(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [mounted, setMounted] = useState(false);
  const bannerRef = useRef<HTMLDivElement>(null);

  const center = useMemo(
    () => ({ lat: selectedCity.lat, lng: selectedCity.lng, zoom: 14, name: selectedCity.name }),
    [selectedCity]
  );

  // Flag for client render
  useEffect(() => setMounted(true), []);

  // Fetch dynamic tips
  useEffect(() => {
    async function fetchRich() {
      try {
        const res = await fetch('/api/travel-tips', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ destination: selectedCity.name }),
        });
        if (!res.ok) throw new Error();
        setRichData(await res.json());
      } catch {
        setRichData({ intro: `Welcome to ${selectedCity.name}!`, vibeKeywords: [], mustDo: '', hiddenGem: '', foodieTip: '' });
      }
    }
    fetchRich();
  }, [selectedCity]);

  // Slideshow interval slower (5s)
  useEffect(() => {
    if (!placePhotos.length) return;
    setCurrentSlide(0);
    const interval = setInterval(() => setCurrentSlide(i => (i + 1) % placePhotos.length), 5000);
    return () => clearInterval(interval);
  }, [placePhotos]);

  // GSAP banner entry/exit
  useEffect(() => {
    if (!mounted || !richData) return;
    const banner = bannerRef.current!;
    const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });
    tl.fromTo(banner, { y: -30, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.4 })
      .to({}, { duration: 10 })
      .to(banner, { y: 30, autoAlpha: 0, duration: 0.4 });
    return () => tl.kill();
  }, [mounted, richData]);

  const handleSelectCity = useCallback((city: City) => {
    setPlacePhotos([]); setSearchedPlaceId(null); setSelectedCity(city);
  }, []);
  const handlePlacesLoaded = useCallback((photos: string[]) => setPlacePhotos(photos.slice(0, 5)), []);
  const handlePlaceSelect = useCallback((id: string) => setSearchedPlaceId(id), []);
  const handleMenuAction = useCallback((action: string) => {
    if (action === 'toggle-satellite') setMapType(m => m === 'roadmap' ? 'satellite' : 'roadmap');
    else if (action === 'itinerary') setIsItineraryOpen(true);
  }, []);
  const getCityTime = (tz: string) => {
    try { return new Intl.DateTimeFormat('en-GB',{timeZone:tz,hour:'2-digit',minute:'2-digit'}).format(new Date()); }
    catch { return '--:--'; }
  };

  return (
    <div className="relative w-full h-screen overflow-hidden">
      <CityMap center={center} onPlacesLoaded={handlePlacesLoaded} selectedPlaceId={searchedPlaceId}
        isItineraryOpen={isItineraryOpen} onCloseItinerary={() => setIsItineraryOpen(false)} mapType={mapType} />

      {mounted && richData && (
        <div ref={bannerRef} className="absolute inset-0 flex items-center justify-center z-50 p-4 sm:p-0 pointer-events-none">
          <div className="relative w-full max-w-md bg-gradient-to-t from-black/90 to-black/60 backdrop-blur-md rounded-xl overflow-hidden">
            {placePhotos[currentSlide] && (
              <img src={placePhotos[currentSlide]} alt="slide" className="w-full h-48 object-cover" />
            )}
            <div className="p-4 text-yellow-200">
              <p className="font-mono text-base sm:text-lg tracking-wide mb-2">{richData.intro}</p>
              <div className="flex flex-wrap gap-1 mb-2">
                {richData.vibeKeywords.map(kw => <span key={kw} className="text-xs px-2 py-1 bg-yellow-800/50 rounded">{kw}</span>)}
              </div>
              <ul className="text-xs space-y-1">
                {richData.mustDo && <li>⚡ {richData.mustDo}</li>}
                {richData.hiddenGem && <li>💎 {richData.hiddenGem}</li>}
                {richData.foodieTip && <li>🍴 {richData.foodieTip}</li>}
              </ul>
            </div>
          </div>
        </div>
      )}

      <AnimatedHeaderBoard cities={cities} onSelectCity={handleSelectCity}
        onMenuAction={handleMenuAction} onPlaceSelect={handlePlaceSelect} />
      <ProgressBar />
      <div className="fixed bottom-6 left-6 z-30 hidden md:flex flex-col bg-black/80 px-4 py-2 rounded shadow"
        style={{ border:'2px solid white', color:countryColors[selectedCity.name] }}>
        <div className="flex items-center gap-2"><SplitFlap text={selectedCity.name} /></div>
        <span className="text-xs mt-1 text-white">{getCityTime(selectedCity.timezone)}</span>
      </div>
    </div>
  );
}
