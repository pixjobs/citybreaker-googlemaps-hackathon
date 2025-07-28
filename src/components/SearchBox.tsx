"use client";

import { useState, useRef, useEffect } from "react";
import { Search, MapPin } from "lucide-react";
import { useMaps } from "./providers/MapsProvider";
import gsap from "gsap";
import { motion, AnimatePresence } from "framer-motion";

// --- INTERFACE DEFINITIONS ---
interface AutocompletePrediction {
  description: string;
  place_id: string;
  structured_formatting: { main_text: string; secondary_text: string };
}

interface SearchBoxProps {
  mapBounds: google.maps.LatLngBounds | null;
  onPlaceNavigate: (place: google.maps.places.PlaceResult) => void;
}


// --- COMPONENT ---
export default function SearchBox({ mapBounds, onPlaceNavigate }: SearchBoxProps) {
  const { isLoaded } = useMaps();
  const [query, setQuery] = useState("");
  const [predictions, setPredictions] = useState<AutocompletePrediction[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const autocompleteService = useRef<google.maps.places.AutocompleteService | null>(null);
  const placesService = useRef<google.maps.places.PlacesService | null>(null);
  const searchBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isLoaded && !autocompleteService.current) {
      autocompleteService.current = new window.google.maps.places.AutocompleteService();
      const dummyDiv = document.createElement('div');
      placesService.current = new window.google.maps.places.PlacesService(dummyDiv);
    }
  }, [isLoaded]);

  // This effect handles fetching predictions from the Google API
  useEffect(() => {
    if (!query || !autocompleteService.current || !mapBounds) {
      setPredictions([]);
      return;
    }

    const handler = setTimeout(() => {
      console.log("🔍 SearchBox: Searching with locationRestriction...", mapBounds.toJSON());

      // ✅ THE MODERN API: Using locationRestriction instead of the deprecated `bounds` and `strictBounds`.
      const request: google.maps.places.AutocompletionRequest = {
        input: query,
        locationRestriction: mapBounds, // This enforces that results MUST be within the map bounds.
        types: ['geocode', 'establishment'], // Tells the API we're interested in addresses and businesses.
      };

      autocompleteService.current?.getPlacePredictions(request, (results, status) => {
          if (status === window.google.maps.places.PlacesServiceStatus.OK && results) {
            console.log(`✅ SearchBox: Found ${results.length} results within restriction.`);
            setPredictions(results);
          } else {
            // This is expected if no results are found within the bounds.
            console.log(`ℹ️ SearchBox: No results found or status: ${status}`);
            setPredictions([]);
          }
        }
      );
    }, 300); // Debounce API calls

    return () => clearTimeout(handler);
  }, [query, mapBounds]);

  // Effect to handle clicks outside the search box to close the dropdown
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
    
    const request = {
      placeId,
      fields: ["name", "geometry", "place_id"], 
    };

    placesService.current.getDetails(request, (place, status) => {
      if (status === "OK" && place?.geometry) {
        onPlaceNavigate(place);
      }
    });

    setQuery("");
    setPredictions([]);
    setIsFocused(false);
  };
  
  // GSAP animation for list items appearing
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
                <li key={prediction.place_id} className="prediction-item border-b border-white/10 last:border-b-0">
                  <button
                    onClick={() => handleSelect(prediction.place_id)}
                    className="w-full flex items-start gap-4 px-5 py-4 text-left hover:bg-yellow-600/20 transition-colors"
                  >
                    <div className="mt-1 flex-shrink-0"><MapPin size={20} className="text-yellow-400" /></div>
                    <div>
                      <p className="text-base font-semibold text-white">{prediction.structured_formatting.main_text}</p>
                      <p className="text-sm text-white/70">{prediction.structured_formatting.secondary_text}</p>
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