// src/lib/useMapBounds.ts

import { useState, useCallback, useRef } from "react";

export function useMapBounds() {
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [mapBounds, setMapBounds] = useState<google.maps.LatLngBounds | null>(null);
  const [hasInitialized, setHasInitialized] = useState(false);

  // This ref is the key to solving the race condition.
  const isManualUpdate = useRef(false);

  const handleMapLoad = useCallback((mapInstance: google.maps.Map) => {
    setMap(mapInstance);
    setTimeout(() => {
      const bounds = mapInstance.getBounds();
      if (bounds) {
        const newBounds = new google.maps.LatLngBounds(bounds.getSouthWest(), bounds.getNorthEast());
        setMapBounds(newBounds);
        setHasInitialized(true);
      }
    }, 100);
  }, []);

  const handleMapIdle = useCallback(() => {
    // If a manual update is in progress, ignore this idle event.
    if (isManualUpdate.current) {
      isManualUpdate.current = false; // Reset the flag and exit.
      return;
    }
    if (map) {
      const bounds = map.getBounds();
      if (bounds) {
        const newBounds = new google.maps.LatLngBounds(bounds.getSouthWest(), bounds.getNorthEast());
        setMapBounds(newBounds);
      }
    }
  }, [map]);

  // The city selection logic now lives inside the hook.
  const selectCity = useCallback((city: { lat: number, lng: number }) => {
    if (!map) return;

    // Set a flag to ignore the next onIdle event.
    isManualUpdate.current = true;

    const newCenter = { lat: city.lat, lng: city.lng };
    map.panTo(newCenter);
    map.setZoom(14);

    // Immediately update the bounds manually.
    const SW = new google.maps.LatLng(city.lat - 0.1, city.lng - 0.1);
    const NE = new google.maps.LatLng(city.lat + 0.1, city.lng + 0.1);
    const newBounds = new google.maps.LatLngBounds(SW, NE);
    setMapBounds(newBounds);

  }, [map]);

  return {
    map,
    mapBounds,
    hasInitialized,
    handleMapLoad,
    handleMapIdle,
    selectCity, // Export the new, safe function.
  };
}