"use client";

import { useRef, useEffect, useCallback } from 'react';
import { City } from './HomePage'; // Assuming you export the City type from HomePage

interface AnimatedHeaderBoardProps {
  cities: City[];
  onSelectCity: (city: City) => void;
  onMenuAction: (action: string) => void;
  onPlaceNavigate: (place: google.maps.places.PlaceResult) => void;
  mapBounds: google.maps.LatLngBounds | null;
  isSatelliteView: boolean;
}

export default function AnimatedHeaderBoard({
  cities,
  onSelectCity,
  onMenuAction,
  onPlaceNavigate,
  mapBounds,
  isSatelliteView,
}: AnimatedHeaderBoardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  useEffect(() => {
    if (!inputRef.current) return;

    // --- THIS IS THE UPGRADED PART ---
    // We tell Autocomplete to fetch the specific fields we need.
    // By including 'geometry', we no longer need a separate PlacesService call.
    const autocompleteOptions = {
      fields: ['place_id', 'name', 'geometry'], // ✅ Request geometry directly
      types: ['(cities)', 'establishment'],
    };

    const autocomplete = new google.maps.places.Autocomplete(
      inputRef.current,
      autocompleteOptions
    );
    autocompleteRef.current = autocomplete;

    const listener = autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();

      // If the place has geometry, we can navigate directly.
      if (place.geometry) {
        onPlaceNavigate(place);
        inputRef.current?.blur(); // Optional: unfocus the input
      } else {
        // This part is a fallback for when a user just hits Enter without selecting a suggestion.
        // It's a good practice to keep, but it's not the source of the deprecation warning.
        console.log("User did not select a prediction from the list.");
      }
    });

    return () => {
      google.maps.event.removeListener(listener);
    };
  }, [onPlaceNavigate]);

  // This effect binds the autocomplete results to the current map view
  useEffect(() => {
    if (autocompleteRef.current && mapBounds) {
      autocompleteRef.current.setBounds(mapBounds);
    }
  }, [mapBounds]);

  // The rest of your component's JSX remains the same...
  return (
    <header className="fixed top-0 left-0 right-0 z-40 p-4">
      <div className="flex items-center justify-between bg-black/80 p-2 rounded-lg shadow-2xl backdrop-blur-sm">
        {/* Your Logo and other UI elements */}
        <div className="flex-1 mx-4">
          <input
            ref={inputRef}
            type="text"
            placeholder="Search for a place..."
            className="w-full bg-transparent text-white placeholder-white/50 focus:outline-none"
          />
        </div>
        {/* Your Menu and other UI elements */}
      </div>
    </header>
  );
}