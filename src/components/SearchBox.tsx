"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Search, MapPin } from "lucide-react";
import gsap from "gsap";
import { motion, AnimatePresence } from "framer-motion";

type Prediction = google.maps.places.Place;

interface SearchBoxProps {
  mapBounds: google.maps.LatLngBounds | null;
  onPlaceNavigate: (place: google.maps.places.Place) => void;
}

// --- COMPONENT ---
export default function SearchBox({ mapBounds, onPlaceNavigate }: SearchBoxProps) {
  const [query, setQuery] = useState("");
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const prevMapBoundsRef = useRef<google.maps.LatLngBounds | null>(null);

  // This is now the SINGLE source of truth for handling searches and location changes.
  useEffect(() => {
    const controller = new AbortController();

    const hasBoundsChanged = mapBounds && prevMapBoundsRef.current && !prevMapBoundsRef.current.equals(mapBounds);

    // We must always update the ref for the next render cycle.
    prevMapBoundsRef.current = mapBounds;

    // CASE 1: The map has moved to a new city.
    // We must clear the old search and STOP, not perform a new one.
    if (hasBoundsChanged) {
        setQuery("");
        setPredictions([]);
        return; // Exit the effect early.
    }

    // CASE 2: The map is stable, but the user has cleared the input.
    // Or, there are no bounds yet. Clear predictions and stop.
    if (!query || !mapBounds) {
        setPredictions([]);
        return;
    }

    // CASE 3: The map is stable and the user is typing.
    // This is the only case where we perform a search.
    const handler = setTimeout(() => {
      (async () => {
        const request: google.maps.places.SearchByTextRequest = {
          textQuery: query,
          fields: ["id", "displayName", "formattedAddress"],
          locationBias: mapBounds,
        };
    
        try {
          const { places } = await google.maps.places.Place.searchByText(request);
          setPredictions(places ?? []);
        } catch (error) {
          console.error("Place search failed:", error);
        }
      })();
    }, 300); // Debounce
      
    return () => {
      clearTimeout(handler);
      controller.abort();
    };
  }, [query, mapBounds]); // The effect correctly depends on both query and mapBounds.


  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(event.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = useCallback(async (placeId: string) => {
    if (!placeId) return;
    const place = new google.maps.places.Place({ id: placeId });
    try {
      await place.fetchFields({
        fields: ["displayName", "id", "location", "viewport"],
      });
      if (place.location) {
        onPlaceNavigate(place);
      }
    } catch (error) {
      console.error("Failed to fetch place details:", error);
    }
    setQuery("");
    setPredictions([]);
    setIsFocused(false);
  }, [onPlaceNavigate]);

  useEffect(() => {
    if (isFocused && predictions.length > 0) {
      gsap.fromTo(".prediction-item", 
        { opacity: 0, y: -10 }, 
        { opacity: 1, y: 0, duration: 0.3, stagger: 0.05, ease: "power2.out" }
      );
    }
  }, [predictions, isFocused]);

  return (
    <div ref={searchBoxRef} className="relative">
      <div className="flex items-center gap-3 bg-white/5 px-4 py-2 rounded-lg border border-transparent focus-within:border-yellow-400 transition-colors">
        <Search size={18} className="text-yellow-500/60" />
        <input
          type="text" value={query} onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)} placeholder="Search within map view..."
          className="w-full bg-transparent text-base text-white placeholder:text-yellow-500/60 focus:outline-none"
        />
      </div>

      <AnimatePresence>
        {isFocused && predictions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: -10 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -10 }} transition={{ duration: 0.2, ease: "easeOut" }}
            className="absolute top-full mt-2 left-1/2 -translate-x-1/2 w-[calc(100%+3rem)] max-w-[600px] 
                       bg-black/90 backdrop-blur-lg border border-yellow-400/50 rounded-lg shadow-2xl z-10 
                       overflow-hidden max-h-[60vh]"
          >
            <ul className="overflow-y-auto">
              {predictions.map((prediction) => (
                <li key={prediction.id} className="prediction-item border-b border-white/10 last:border-b-0">
                  <button
                    onClick={() => handleSelect(prediction.id!)}
                    className="w-full flex items-start gap-4 px-5 py-4 text-left hover:bg-yellow-600/20 transition-colors"
                  >
                    <div className="mt-1 flex-shrink-0"><MapPin size={20} className="text-yellow-400" /></div>
                    <div>
                      <p className="text-base font-semibold text-white">{prediction.displayName}</p>
                      <p className="text-sm text-white/70">{prediction.formattedAddress}</p>
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