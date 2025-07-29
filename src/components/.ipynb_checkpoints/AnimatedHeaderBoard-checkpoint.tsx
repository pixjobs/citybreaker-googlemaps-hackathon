"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
} from "react";
import gsap from "gsap";
import { motion, AnimatePresence } from "framer-motion";

// Component Imports
import SplitFlapBoard from "@/components/SplitFlapBoard";
import CityBreakerLogo from "@/components/CityBreakerLogo";
import SearchBox from "./SearchBox";

// Icon Imports
import {
  Globe,
  Compass,
  MapPinned,
  Menu,
  X,
  Check,
} from "lucide-react";

// --- TYPE DEFINITIONS ---
interface City {
  name: string;
  timezone: string;
  lat: number;
  lng: number;
}

interface AnimatedHeaderBoardProps {
  cities: City[];
  onSelectCity: (city: City) => void;
  onMenuAction: (action: string) => void;
  onPlaceNavigate: (place: google.maps.places.Place) => void;
  mapBounds: google.maps.LatLngBounds | null;
  isSatelliteView: boolean;
}

// --- MAIN COMPONENT ---
export default function AnimatedHeaderBoard({
  cities,
  onSelectCity,
  onMenuAction,
  onPlaceNavigate,
  mapBounds,
  isSatelliteView,
}: AnimatedHeaderBoardProps) {
  // --- REFS ---
  const containerRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // --- STATE ---
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [boardTop, setBoardTop] = useState(0);

  const menuItems = useMemo(
    () => [
      {
        label: "Surprise Me",
        icon: <Compass size={18} />,
        action: "surprise-me",
        active: false,
        isToggle: false,
      },
      {
        label: "Itinerary",
        icon: <MapPinned size={18} />,
        action: "itinerary",
        active: false,
        isToggle: false,
      },
      {
        label: isSatelliteView ? "Map View" : "Satellite View",
        icon: <Globe size={18} />,
        action: "toggle-satellite",
        active: isSatelliteView,
        isToggle: true,
      },
    ],
    [isSatelliteView]
  );

  // --- EFFECTS ---

  useEffect(() => {
    if (containerRef.current) {
      gsap.fromTo(
        containerRef.current,
        { y: -100, opacity: 0 },
        { y: 0, opacity: 1, duration: 1, ease: "power4.out" }
      );
    }
  }, []);

  useLayoutEffect(() => {
    function updateTop() {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const gap = window.innerWidth < 640 ? 16 : 8;
        setBoardTop(rect.bottom + gap);
      }
    }
    updateTop();
    window.addEventListener("resize", updateTop);
    return () => window.removeEventListener("resize", updateTop);
  }, []);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener("mousedown", onClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
    };
  }, [menuOpen]);

  // --- CALLBACKS ---

  const toggleBoard = useCallback(() => {
    setExpanded((prev) => {
      const isOpen = !prev;
      if (!boardRef.current) return isOpen;
      gsap.to(boardRef.current, {
        height: isOpen ? "auto" : 0,
        opacity: isOpen ? 1 : 0,
        duration: 0.5,
        ease: "power2.out",
        onStart: () => {
          if (isOpen) boardRef.current!.style.display = "block";
        },
        onComplete: () => {
          if (!isOpen) boardRef.current!.style.display = "none";
        },
      });
      return isOpen;
    });
  }, []);

  const handleCitySelectAndClose = useCallback(
    (city: City) => {
      onSelectCity(city);
      if (expanded) {
        toggleBoard();
      }
    },
    [expanded, onSelectCity, toggleBoard]
  );

  const handleItemClick = useCallback(
    (action: string) => {
      onMenuAction(action);
      setMenuOpen(false);
    },
    [onMenuAction]
  );

  return (
    <>
      <header
        ref={containerRef}
        className="fixed top-4 left-1/2 -translate-x-1/2 w-11/12 max-w-4xl z-30 bg-black/60 backdrop-blur-lg border border-yellow-500/50 text-yellow-300 rounded-xl shadow-lg"
      >
        <div className="flex items-center justify-between w-full px-3 sm:px-4 py-2 gap-3 sm:gap-4">
          <div className="flex-shrink-0 hidden sm:block">
            <CityBreakerLogo className="h-7 w-auto sm:h-8" />
          </div>

          <div className="flex-grow min-w-0">
            {mapBounds ? (
              <SearchBox
                onPlaceNavigate={onPlaceNavigate}
                mapBounds={mapBounds}
              />
            ) : (
              <div
                className="h-[42px] w-full bg-white/5 rounded-lg animate-pulse"
                aria-hidden="true"
              />
            )}
          </div>

          <div className="flex-shrink-0 flex items-center gap-2">
            <button
              onClick={toggleBoard}
              className="text-xs sm:text-sm border border-yellow-400 px-3 py-1.5 rounded-lg hover:bg-yellow-600/20 transition-colors whitespace-nowrap"
              aria-expanded={expanded}
              aria-controls="city-selector-board"
            >
              {expanded ? "Hide ▲" : "Cities ▼"}
            </button>
            <div ref={menuRef} className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="border border-yellow-400 p-1.5 rounded-lg hover:bg-yellow-600/20 transition-colors"
                aria-expanded={menuOpen}
                aria-controls="header-menu"
              >
                {menuOpen ? <X size={18} /> : <Menu size={18} />}
              </button>
              <AnimatePresence>
                {menuOpen && (
                  <motion.div
                    id="header-menu"
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="absolute right-0 mt-2 bg-black/90 backdrop-blur-xl border border-yellow-500/50 text-yellow-200 rounded-lg shadow-2xl z-50 min-w-[220px] overflow-hidden"
                  >
                    <ul>
                      {menuItems.map((item) => (
                        <li
                          key={item.label}
                          className="border-b border-white/10 last:border-b-0"
                        >
                          <button
                            onClick={() => handleItemClick(item.action)}
                            className={`w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-yellow-600/20 text-left transition-colors ${
                              item.active ? "bg-yellow-500/20" : ""
                            }`}
                            aria-pressed={item.isToggle ? item.active : undefined}
                          >
                            <div className="flex items-center gap-3">
                              {item.icon}
                              <span
                                className={`text-sm ${
                                  item.active ? "font-semibold" : ""
                                }`}
                              >
                                {item.label}
                              </span>
                            </div>
                            {item.active && (
                              <Check size={16} className="text-yellow-400" />
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </header>

      <div
        id="city-selector-board"
        ref={boardRef}
        className="fixed left-1/2 -translate-x-1/2 w-11/12 max-w-4xl z-20 bg-black/60 backdrop-blur-lg border border-yellow-500/50 border-t-0 rounded-b-xl shadow-lg overflow-hidden"
        style={{ top: boardTop, height: 0, opacity: 0, display: "none" }}
      >
        {expanded && (
          <SplitFlapBoard
            cities={cities}
            onSelectCity={handleCitySelectAndClose}
          />
        )}
      </div>
    </>
  );
}