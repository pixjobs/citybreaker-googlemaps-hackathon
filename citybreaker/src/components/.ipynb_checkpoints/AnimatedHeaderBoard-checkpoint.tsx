"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import SplitFlapBoard from "@/components/SplitFlapBoard";
import CityBreakerLogo from "@/components/CityBreakerLogo";
import { motion, AnimatePresence } from "framer-motion";
import {
  Globe,
  Compass,
  Landmark,
  Utensils,
  MapPinned,
  Menu,
  X,
} from "lucide-react";

interface City {
  name: string;
  timezone: string;
  lat: number;
  lng: number;
}

const menuItems = [
  { label: "Surprise Me", icon: <Compass size={18} />, action: "surprise-me" },
  { label: "Itinerary", icon: <MapPinned size={18} />, action: "itinerary" },
  { label: "Satellite", icon: <Globe size={18} />, action: "toggle-satellite" },
  { label: "Landmarks", icon: <Landmark size={18} />, action: "toggle-landmarks" },
  { label: "Restaurants", icon: <Utensils size={18} />, action: "toggle-restaurants" },
];

export default function AnimatedHeaderBoard({
  cities,
  onSelectCity,
}: {
  cities: City[];
  onSelectCity: (city: City) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (containerRef.current) {
      gsap.fromTo(
        containerRef.current,
        { y: -100, opacity: 0 },
        { y: 0, opacity: 1, duration: 1, ease: "power4.out" }
      );
    }
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [menuOpen]);

  const toggleBoard = () => {
    const isCurrentlyExpanded = !expanded;
    setExpanded(isCurrentlyExpanded);

    if (boardRef.current) {
      gsap.to(boardRef.current, {
        height: isCurrentlyExpanded ? "auto" : 0,
        opacity: isCurrentlyExpanded ? 1 : 0,
        duration: 0.5,
        ease: "power2.out",
        onStart: () => {
          if (isCurrentlyExpanded) boardRef.current!.style.display = "block";
        },
        onComplete: () => {
          if (!isCurrentlyExpanded) boardRef.current!.style.display = "none";
        },
      });
    }
  };

  const handleCitySelectAndClose = (city: City) => {
    onSelectCity(city);
    if (expanded) {
      toggleBoard();
    }
  };

  const handleItemClick = (action: string) => {
    switch (action) {
      case "toggle-satellite":
        window.dispatchEvent(new Event("toggle-satellite"));
        break;
      case "toggle-landmarks":
        window.dispatchEvent(new Event("show-landmarks-menu"));
        break;
      case "toggle-restaurants":
        window.dispatchEvent(new Event("show-restaurants-menu"));
        break;
      case "surprise-me":
        console.log("🎯 surprise-me triggered (Gemini to hook here)");
        break;
      case "itinerary":
        console.log("📍 itinerary triggered (hook up later)");
        break;
    }
    setMenuOpen(false);
  };

  return (
    <header
      ref={containerRef}
      className="fixed top-0 left-0 w-full z-50 bg-black/80 backdrop-blur border-b border-yellow-500 text-yellow-300"
    >
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-3">
          <CityBreakerLogo />
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={toggleBoard}
            className="text-xs sm:text-sm border border-yellow-400 px-3 py-1 rounded hover:bg-yellow-600/20 transition-colors"
          >
            {expanded ? "Hide Cities ▲" : "Show Cities ▼"}
          </button>

          <div ref={menuRef} className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="border border-yellow-400 p-1 rounded hover:bg-yellow-600/20 transition-colors"
            >
              {menuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>

            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="absolute right-0 mt-2 bg-black border border-yellow-400 text-yellow-200 rounded shadow-lg z-50 min-w-[180px] overflow-hidden"
                >
                  {menuItems.map((item) => (
                    <button
                      key={item.label}
                      onClick={() => handleItemClick(item.action)}
                      className="w-full flex items-center gap-2 px-4 py-2 hover:bg-yellow-600/20 text-left transition-colors"
                    >
                      {item.icon}
                      <span className="text-sm">{item.label}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div
        ref={boardRef}
        style={{ height: 0, overflow: "hidden", display: "none", opacity: 0 }}
        className="px-4 pb-3"
      >
        <SplitFlapBoard
          cities={cities}
          onSelectCity={handleCitySelectAndClose}
        />
      </div>
    </header>
  );
}