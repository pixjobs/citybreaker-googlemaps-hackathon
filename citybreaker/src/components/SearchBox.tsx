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

interface SearchBoxProps {
  mapCenter: { lat: number; lng: number; }; // Expects an object with lat and lng
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
      const dummyDiv = document.createElement('div');
      placesService.current = new window.google.maps.places.PlacesService(dummyDiv);
    }
  }, [isLoaded]);

  // Fetch predictions, now with a robust guard clause
  useEffect(() => {
    // --- THIS IS THE CRITICAL FIX (Already implemented, but re-confirming its presence) ---
    // This guard clause ensures that `mapCenter` is defined and Google Maps services are ready
    // before attempting to use `mapCenter.lat` or `autocompleteService.current`.
    if (!query || !autocompleteService.current || !mapCenter || mapCenter.lat === undefined || mapCenter.lng === undefined) {
      setPredictions([]);
      return;
    }

    const handler = setTimeout(() => {
      autocompleteService.current?.getPlacePredictions(
        {
          input: query,
          location: new window.google.maps.LatLng(mapCenter.lat, mapCenter.lng), // `mapCenter` is guaranteed to be defined here
          radius: 100000, // 100km in meters
          strictBounds: false,
        },
        (results, status) => {
          if (status === window.google.maps.places.PlacesServiceStatus.OK) {
            setPredictions(results || []);
          } else {
            console.error(`Autocomplete search failed with status: ${status}`);
            setPredictions([]);
          }
        }
      );
    }, 300); // Debounce input

    return () => clearTimeout(handler);
  }, [query, mapCenter]); // The dependency array is correct.

  // Handle clicking outside to close the results dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(event.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Handle selecting a place from the dropdown
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