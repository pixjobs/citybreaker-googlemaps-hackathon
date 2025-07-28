// src/components/providers/MapsProvider.tsx

"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Loader } from '@googlemaps/js-api-loader';

interface MapsContextType {
  isLoaded: boolean;
}

const MapsContext = createContext<MapsContextType>({ isLoaded: false });

export const useMaps = () => useContext(MapsContext);

export function MapsProvider({ children }: { children: ReactNode }) {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // This effect runs only once when the app starts
    const loader = new Loader({
      apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
      version: 'weekly',
      // This is the key part: list ALL libraries your app will ever need here.
      libraries: ['maps', 'places', 'core'], 
    });

    // We only call .load() once for the entire application
    loader.load()
      .then(() => {
        setIsLoaded(true);
        console.log("Google Maps script loaded successfully.");
      })
      .catch(e => {
        console.error("Failed to load Google Maps script:", e);
      });
      
  }, []); // The empty array [] ensures this effect runs only once.

  return (
    <MapsContext.Provider value={{ isLoaded }}>
      {children}
    </MapsContext.Provider>
  );
}