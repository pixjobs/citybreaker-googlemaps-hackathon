// components/StreetViewOverlay.tsx

"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useMaps } from "./providers/MapsProvider";

interface StreetViewOverlayProps {
  location: { lat: number; lng: number };
  map: google.maps.Map | null;
  onClose: () => void;
}

export default function StreetViewOverlay({ location, map, onClose }: StreetViewOverlayProps) {
  const { isLoaded } = useMaps();
  const streetViewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isLoaded || !streetViewRef.current || !map) return;

    const streetViewService = new google.maps.StreetViewService();
    const panorama = map.getStreetView();

    // Find the nearest panorama within a 50-meter radius of the marker's location.
    streetViewService.getPanorama({ location, radius: 50 }, (data, status) => {
      if (status === "OK" && data) {
        // If a panorama is found, set its location and make it visible.
        panorama.setPosition(data.location!.latLng);
        panorama.setPov({ heading: 270, pitch: 0 }); // Point it in a default direction
        panorama.setVisible(true);
      } else {
        // If no panorama is found, close the overlay.
        console.warn("Street View data not found for this location.");
        onClose();
      }
    });

    // Google's panorama has its own close button. We need to listen for when the user
    // clicks it so we can sync our state and truly close the overlay.
    const visibleListener = panorama.addListener("visible_changed", () => {
      if (!panorama.getVisible()) {
        onClose();
      }
    });

    // Cleanup function to run when the component unmounts
    return () => {
      // Hide the panorama and remove the listener to prevent memory leaks.
      if (panorama) {
        panorama.setVisible(false);
      }
      google.maps.event.removeListener(visibleListener);
    };
  }, [isLoaded, location, map, onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center">
      {/* This div is a placeholder for the Google Maps Street View UI */}
      <div ref={streetViewRef} className="w-full h-full" />
      
      {/* We add our own close button as a fallback and for style consistency */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-[60] bg-black/50 p-2 rounded-full text-white hover:bg-black"
        aria-label="Close Street View"
      >
        <X size={24} />
      </button>
    </div>
  );
}