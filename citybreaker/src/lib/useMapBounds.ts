import { useState, useCallback, useEffect } from "react";

export function useMapBounds() {
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [mapBounds, setMapBounds] = useState<google.maps.LatLngBounds | null>(null);
  const [hasInitialized, setHasInitialized] = useState(false);

  const handleMapLoad = useCallback((mapInstance: google.maps.Map) => {
    setMap(mapInstance);
    setTimeout(() => {
      const bounds = mapInstance.getBounds();
      if (bounds) {
        setMapBounds(bounds);
        setHasInitialized(true);
        console.log("✅ Map loaded with bounds:", bounds.toJSON());
      } else {
        console.warn("⚠️ map.getBounds() returned null on load");
      }
    }, 100); // Allow one tick for the map to settle
  }, []);

  const handleMapIdle = useCallback(() => {
    if (map) {
      const bounds = map.getBounds();
      if (bounds) {
        setMapBounds(bounds);
        console.log("📍 Map idle - updated bounds:", bounds.toJSON());
      }
    }
  }, [map]);

  return {
    map,
    mapBounds,
    hasInitialized,
    handleMapLoad,
    handleMapIdle,
  };
}
