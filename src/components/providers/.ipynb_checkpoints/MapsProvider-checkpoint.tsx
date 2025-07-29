"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Loader } from '@googlemaps/js-api-loader';

interface MapsContextType {
  isLoaded: boolean;
  loadError?: Error; // Optionally expose loading errors
}

const MapsContext = createContext<MapsContextType>({ isLoaded: false });

export const useMaps = () => useContext(MapsContext);

export function MapsProvider({ children }: { children: ReactNode }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<Error | undefined>();

  useEffect(() => {
    // This effect runs only once when the app starts.
    const getApiKeyAndLoad = async () => {
      try {
        // 1. Fetch the API key from our secure server-side route.
        const response = await fetch('/api/maps-key');
        if (!response.ok) {
          throw new Error(`Failed to fetch API key. Status: ${response.status}`);
        }
        const { apiKey } = await response.json();

        if (!apiKey) {
          throw new Error("API key was not found in the response.");
        }

        // 2. Use the fetched key to initialize the loader.
        const loader = new Loader({
          apiKey: apiKey,
          version: 'weekly',
          libraries: ['maps', 'places', 'core'],
        });

        // 3. Load the Google Maps script.
        await loader.load();
        setIsLoaded(true);
        console.log("Google Maps script loaded successfully.");

      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        setLoadError(error); // Store the error state
        console.error("Failed to load Google Maps script:", error);
      }
    };
    
    getApiKeyAndLoad();
      
  }, []); // The empty array [] ensures this effect runs only once.

  return (
    <MapsContext.Provider value={{ isLoaded, loadError }}>
      {children}
    </MapsContext.Provider>
  );
}