"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

export default function CitySelector() {
  const panelRef = useRef<HTMLDivElement>(null);

  const cities = [
    { name: "London", lat: 51.5074, lng: -0.1278, zoom: 12 },
    { name: "Paris", lat: 48.8566, lng: 2.3522, zoom: 12 },
    { name: "Berlin", lat: 52.52, lng: 13.405, zoom: 12 },
    { name: "Prague", lat: 50.0755, lng: 14.4378, zoom: 12 },
    { name: "Beijing", lat: 39.9042, lng: 116.4074, zoom: 12 },
    { name: "Seoul", lat: 37.5665, lng: 126.978, zoom: 12 },
    { name: "Tokyo", lat: 35.6895, lng: 139.6917, zoom: 12 },
    { name: "San Francisco", lat: 37.7749, lng: -122.4194, zoom: 12 },
    { name: "New York", lat: 40.7128, lng: -74.006, zoom: 12 },
  ];

  useEffect(() => {
    if (panelRef.current) {
      gsap.fromTo(
        panelRef.current.children,
        { opacity: 0, y: 20 },
        {
          opacity: 1,
          y: 0,
          stagger: 0.1,
          duration: 0.6,
          ease: "back.out(1.7)",
        }
      );
    }
  }, []);

  const handleCityClick = (city: typeof cities[0]) => {
    window.dispatchEvent(new CustomEvent("citySelect", { detail: city }));
  };

  return (
    <div
      ref={panelRef}
      className="fixed top-4 right-4 z-30 bg-black/70 border border-retro-border rounded p-4 flex flex-col gap-2 font-pixel"
    >
      <div className="text-retro-neonGreen text-sm mb-2">Choose your city:</div>
      {cities.map((city) => (
        <button
          key={city.name}
          onClick={() => handleCityClick(city)}
          className="bg-gray-800 text-retro-gray hover:bg-retro-neonPink hover:text-black transition px-3 py-1 rounded"
        >
          {city.name}
        </button>
      ))}
    </div>
  );
}
