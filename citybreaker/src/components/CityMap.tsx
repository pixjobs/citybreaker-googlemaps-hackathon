// components/CityMap.tsx

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import ReactMarkdown from 'react-markdown';
import { FaSpinner, FaMapMarkedAlt, FaTimes } from 'react-icons/fa';
import gsap from "gsap";

// --- TYPE DEFINITIONS ---
interface MapCenter {
  lat: number;
  lng: number;
  zoom: number;
  name: string;
}

// --- HOOKS ---
function useGoogleMapsScript(apiKey: string, libraries: string[], onLoad: () => void) {
  useEffect(() => {
    const existingScript = document.getElementById("google-maps-script");
    if (!existingScript) {
      const script = document.createElement("script");
      script.id = "google-maps-script";
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=${libraries.join(',')}`;
      script.async = true; script.defer = true; script.onload = onLoad;
      document.head.appendChild(script);
    } else if ((window as any).google) { onLoad(); }
    else { existingScript.addEventListener("load", onLoad); }
    return () => { if (existingScript) existingScript.removeEventListener("load", onLoad); };
  }, [apiKey, libraries, onLoad]);
}

// --- THE COMPONENT ---
export default function CityMap({ center }: { center: MapCenter }) {
  const mapRef = useRef<google.maps.Map | null>(null);
  const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const [mapReady, setMapReady] = useState(false);
  const [itinerary, setItinerary] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false); // A single loading state for the whole process
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  // --- ANIMATION LOGIC (GSAP) ---
  const animatePanel = useCallback((isOpen: boolean) => {
    if (!panelRef.current) return;
    const isMobile = window.innerWidth < 768;
    gsap.to(panelRef.current, {
      y: isOpen ? 0 : (isMobile ? '100%' : '0%'),
      x: isOpen ? 0 : (isMobile ? '0%' : '100%'),
      opacity: isOpen ? 1 : 0,
      duration: 0.5,
      ease: 'power3.inOut',
      onStart: () => { if(isOpen) panelRef.current!.style.display = 'block'; },
      onComplete: () => { if(!isOpen) panelRef.current!.style.display = 'none'; }
    });
  }, []);

  useEffect(() => { animatePanel(isPanelOpen); }, [isPanelOpen, animatePanel]);

  // --- MAP INITIALIZATION & UPDATE ---
  const initMap = useCallback(() => {
    const google = (window as any).google;
    if (!google || mapRef.current) return;
    mapRef.current = new google.maps.Map(document.getElementById("map") as HTMLElement, {
      center: { lat: center.lat, lng: center.lng },
      zoom: center.zoom,
      disableDefaultUI: true,
      styles: [
        { elementType: "geometry", stylers: [{ color: "#1d2c4d" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#8ec3b9" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#1a3646" }] },
        { featureType: "road", elementType: "geometry", stylers: [{ color: "#579e00" }] },
        { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1626" }] },
        { featureType: "poi", stylers: [{ visibility: "off" }] },
      ],
    });
    placesServiceRef.current = new google.maps.places.PlacesService(mapRef.current);
    setMapReady(true);
  }, [center.lat, center.lng, center.zoom]);

  useGoogleMapsScript(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY as string, ["places"], initMap);

  // This is the main effect that triggers when the city changes
  useEffect(() => {
    if (mapRef.current && mapReady) {
      mapRef.current.panTo({ lat: center.lat, lng: center.lng });
      mapRef.current.setZoom(center.zoom);
      generateItineraryForCity(center.name); // This is our main function
      setIsPanelOpen(true);
    }
  }, [center, mapReady]);

  // --- THE NEW 2-STEP DATA FETCHING LOGIC ---
  const generateItineraryForCity = useCallback(async (cityName: string) => {
    if (!placesServiceRef.current) return;

    setIsLoading(true);
    setItinerary(null);

    // STEP 1: Get places from Google Maps Places API
    const request: google.maps.places.TextSearchRequest = {
      query: `top tourist attractions in ${cityName}`,
      type: 'tourist_attraction',
    };

    placesServiceRef.current.textSearch(request, async (results, status) => {
      if (status === google.maps.places.PlacesServiceStatus.OK && results) {
        // Map results to the format your backend needs
        const placesForGemini = results.map(p => ({
          name: p.name,
          types: p.types,
          rating: p.rating,
        }));

        // STEP 2: Send the places to your Gemini backend
        try {
          const response = await fetch('/api/gemini-recommendations', { // <-- Using YOUR route
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ places: placesForGemini, tripLength: 3 })
          });

          if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
          
          const data = await response.json();
          setItinerary(data.itinerary);
        } catch (err) {
          console.error("Gemini API call failed:", err);
          setItinerary("Sorry, I couldn't generate an itinerary right now.");
        } finally {
          setIsLoading(false);
        }
      } else {
        // Handle cases where Google Places finds nothing
        console.error("Google Places search failed:", status);
        setItinerary(`Could not find top attractions for ${cityName}. Please try another city.`);
        setIsLoading(false);
      }
    });
  }, []);

  return (
    <>
      <div id="map" className="absolute inset-0 z-0" />

      <button
        onClick={() => setIsPanelOpen(!isPanelOpen)}
        className="fixed bottom-6 right-6 md:bottom-10 md:right-10 z-30 bg-yellow-500 text-black p-4 rounded-full shadow-lg hover:bg-yellow-400 transition-all"
        aria-label={isPanelOpen ? "Hide Itinerary" : "Show Itinerary"}
      >
        {isPanelOpen ? <FaTimes size={24} /> : <FaMapMarkedAlt size={24} />}
      </button>

      <div
        ref={panelRef}
        style={{ display: 'none' }}
        className="fixed z-20 bg-black/80 backdrop-blur-sm text-yellow-200 border-yellow-500/50 bottom-0 left-0 w-full h-[70vh] rounded-t-lg border-t md:top-1/2 md:-translate-y-1/2 md:right-0 md:left-auto md:w-[400px] md:h-[85vh] md:max-h-[800px] md:rounded-l-lg md:rounded-t-none md:border-l md:border-t md:border-b"
      >
        <div className="p-4 flex justify-between items-center border-b border-yellow-700/50">
          <h2 className="text-xl font-bold text-yellow-300">Your {center.name} Adventure</h2>
        </div>
        <div className="p-4 h-[calc(100%-65px)] overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full text-yellow-300">
              <FaSpinner className="animate-spin text-4xl mb-4" />
              <p>Consulting the travel experts...</p>
            </div>
          ) : (
            <div className="prose prose-sm prose-invert prose-headings:text-yellow-300 prose-strong:text-yellow-100 max-w-none">
              <ReactMarkdown>{itinerary || ""}</ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </>
  );
}