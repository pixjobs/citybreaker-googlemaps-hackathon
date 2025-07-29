"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Loader } from '@googlemaps/js-api-loader';

interface MapsContextType {
  isLoaded: boolean;
  loadError?: Error;
}

const MapsContext = createContext<MapsContextType>({ isLoaded: false });

export const useMaps = () => useContext(MapsContext);

export function MapsProvider({ children }: { children: ReactNode }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<Error | undefined>();

  useEffect(() => {
    // This effect should only run once, so the empty dependency array is correct.
    const getApiKeyAndLoad = async () => {
      try {
        // 1. Fetch the API key from the secure server-side route.
        const response = await fetch('/api/maps-key');
        if (!response.ok) {
          throw new Error(`Server responded with ${response.status} while fetching API key.`);
        }
        const { apiKey } = await response.json();

        if (typeof apiKey !== 'string' || !apiKey) {
          throw new Error("API key was not found or is invalid in the server response.");
        }

        // 2. Initialize the loader with the correct libraries for modern components.
        const loader = new Loader({
          apiKey: apiKey,
          version: 'weekly',
          // ✅ REFINED: Load 'places' for the Places API and 'marker' for AdvancedMarkerElement.
          // 'maps' and 'core' are loaded by default and are not needed here.
          libraries: ['places', 'marker'], 
        });

        // 3. Load the Google Maps script.
        await loader.load();
        setIsLoaded(true);
        console.log("Google Maps script and required libraries loaded successfully.");

      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        setLoadError(error);
        console.error("Failed to load Google Maps script:", error.message);
      }
    };
    
    // Check if the script is already in the process of loading to avoid double-fetching.
    if (!window.google) {
        getApiKeyAndLoad();
    }
      
  }, []); // The empty dependency array is correct.

  return (
    <MapsContext.Provider value={{ isLoaded, loadError }}>
      {children}
    </MapsContext.Provider>
  );
}