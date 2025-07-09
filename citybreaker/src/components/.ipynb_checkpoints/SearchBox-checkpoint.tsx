"use client";

import { useState, useRef, useEffect } from "react";
import { Search, MapPin } from "lucide-react";
import { useMaps } from "./providers/MapsProvider";
import gsap from "gsap";
import { motion, AnimatePresence } from "framer-motion";

interface AutocompletePrediction {
  description: string;
  place_id: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
}

// --- UPDATED PROPS ---
// We now accept the map's center coordinates and a navigation callback.
interface SearchBoxProps {
  mapCenter: { lat: number; lng: number; };
  onPlaceNavigate: (location: google.maps.LatLng) => void;
}

export default function SearchBox({ mapCenter, onPlaceNavigate }: SearchBoxProps) {
  const { isLoaded } = useMaps();
  const [query, setQuery] = useState("");
  const [predictions, setPredictions] = useState<AutocompletePrediction[]>([]);
  const [isFocused, setIsFocused] = useState(false);

  const autocompleteService = useRef<google.maps.places.AutocompleteService | null>(null);
  const placesService = useRef<google.maps.places.PlacesService | null>(null);
  const searchBoxRef = useRef<HTMLDivElement>(null);

  // Initialize Google services when the script is loaded
  useEffect(() => {
    if (isLoaded && !autocompleteService.current) {
      autocompleteService.current = new window.google.maps.places.AutocompleteService();
      // We need a dummy div to initialize the PlacesService
      const dummyDiv = document.createElement('div');
      placesService.current = new window.google.maps.places.PlacesService(dummyDiv);
    }
  }, [isLoaded]);

  // Fetch predictions, now using a fixed 100km radius
  useEffect(() => {
    if (!query || !autocompleteService.current) {
      setPredictions([]);
      return;
    }

    const handler = setTimeout(() => {
      autocompleteService.current?.getPlacePredictions(
        {
          input: query,
          // --- NEW: Use location and radius for a more reliable search area ---
          location: new window.google.maps.LatLng(mapCenter.lat, mapCenter.lng),
          radius: 100000, // 100km in meters
          strictBounds: false, // Still allow important results slightly outside
        },
        (results) => {
          setPredictions(results || []);
        }
      );
    }, 300); // Debounce input

    return () => clearTimeout(handler);
  }, [query, mapCenter]); // Re-run if the map center changes

  // Handle clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(event.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (placeId: string) => {
    if (!placesService.current) return;

    placesService.current.getDetails({ placeId, fields: ["geometry"] }, (place, status) => {
      if (status === "OK" && place?.geometry?.location) {
        onPlaceNavigate(place.geometry.location);
      }
    });

    setQuery("");
    setPredictions([]);
    setIsFocused(false);
  };

  // GSAP animation for the list items
  useEffect(() => {
    if (isFocused && predictions.length > 0) {
      gsap.fromTo(
        ".prediction-item",
        { opacity: 0, y: -10 },
        {
          opacity: 1,
          y: 0,
          duration: 0.3,
          stagger: 0.05,
          ease: "power2.out",
        }
      );
    }
  }, [predictions, isFocused]);

  return (
    <div ref={searchBoxRef} className="relative flex-grow mx-4">
      <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-lg border border-transparent focus-within:border-yellow-400 transition-colors">
        <Search size={16} className="text-yellow-500/60" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          placeholder="Search within 100km..."
          className="w-full bg-transparent text-sm text-white placeholder:text-yellow-500/60 focus:outline-none"
        />
      </div>

      <AnimatePresence>
        {isFocused && predictions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute top-full mt-2 w-full bg-black/90 backdrop-blur-lg border border-yellow-400/50 rounded-lg shadow-lg z-10 overflow-hidden"
          >
            <ul>
              {predictions.map((prediction) => (
                <li key={prediction.place_id} className="prediction-item">
                  <button
                    onClick={() => handleSelect(prediction.place_id)}
                    className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-yellow-600/20 transition-colors"
                  >
                    <MapPin size={18} className="text-yellow-400 mt-1 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {prediction.structured_formatting.main_text}
                      </p>
                      <p className="text-xs text-white/70">
                        {prediction.structured_formatting.secondary_text}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}