"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { FaSpinner, FaPlus } from 'react-icons/fa';

// --- TYPE DEFINITIONS ---
interface MapCenter {
  lat: number;
  lng: number;
  zoom: number;
}

interface PlaceDetail {
  placeId: string;
  name: string;
  address: string;
  photoUrl?: string;
  rating?: number;
  types?: string[];
}

// --- CUSTOM HOOK for loading Google Maps script ---
function useGoogleMapsScript(apiKey: string, libraries: string[], onLoad: () => void) {
  useEffect(() => {
    const existingScript = document.getElementById("google-maps-script");
    if (!existingScript) {
      const script = document.createElement("script");
      script.id = "google-maps-script";
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=${libraries.join(',')}`;
      script.async = true;
      script.defer = true;
      script.onload = onLoad;
      document.head.appendChild(script);
    } else if ((window as any).google) {
      onLoad();
    } else {
      existingScript.addEventListener("load", onLoad);
    }
    return () => {
      if (existingScript) existingScript.removeEventListener("load", onLoad);
    };
  }, [apiKey, libraries, onLoad]);
}

// --- THE COMPONENT ---
export default function CityMap({ center }: { center: MapCenter }) {
  // --- REFS for Google Maps objects ---
  const mapRef = useRef<google.maps.Map | null>(null);
  const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  // --- STATE MANAGEMENT ---
  const [mapReady, setMapReady] = useState(false);
  const [itinerary, setItinerary] = useState<PlaceDetail[]>([]);
  const [nearbyPlaces, setNearbyPlaces] = useState<PlaceDetail[]>([]);
  const [geminiRecommendations, setGeminiRecommendations] = useState<string | null>(null);
  const [loadingPlaces, setLoadingPlaces] = useState(false);
  const [loadingGemini, setLoadingGemini] = useState(false);

  // --- MAP INITIALIZATION ---
  const initMap = useCallback(() => {
    const google = (window as any).google;
    if (!google || mapRef.current) return;

    const mapInstance = new google.maps.Map(document.getElementById("map") as HTMLElement, {
      center: { lat: center.lat, lng: center.lng },
      zoom: center.zoom,
      disableDefaultUI: true,
      styles: [
        { elementType: "geometry", stylers: [{ color: "#1d2c4d" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#8ec3b9" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#1a3646" }] },
        { featureType: "road", elementType: "geometry", stylers: [{ color: "#2a3646" }] },
        { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1626" }] },
        { featureType: "poi", stylers: [{ visibility: "off" }] },
      ],
    });

    mapRef.current = mapInstance;
    placesServiceRef.current = new google.maps.places.PlacesService(mapInstance);
    infoWindowRef.current = new google.maps.InfoWindow();
    setMapReady(true);
  }, [center.lat, center.lng, center.zoom]);

  useGoogleMapsScript(
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY as string,
    ["places"],
    initMap
  );

  // --- EFFECT to update map when city changes ---
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.panTo({ lat: center.lat, lng: center.lng });
      mapRef.current.setZoom(center.zoom);
      
      // Clean up data from the previous city
      setNearbyPlaces([]);
      setGeminiRecommendations(null);
      setItinerary([]); // Resets itinerary for the new city
      clearMarkers();
    }
  }, [center]);

  // --- DATA FETCHING & ACTIONS ---
  const handleDiscoverClick = () => {
    if (!placesServiceRef.current || !mapRef.current) return;
    setLoadingPlaces(true);
    setGeminiRecommendations(null);
    clearMarkers();

    const request: google.maps.places.PlaceSearchRequest = {
      location: mapRef.current.getCenter(),
      radius: 3000,
      type: 'tourist_attraction',
    };

    placesServiceRef.current.nearbySearch(request, (results, status) => {
      if (status === google.maps.places.PlacesServiceStatus.OK && results) {
        const mappedResults: PlaceDetail[] = results.map(p => ({
          placeId: p.place_id || '',
          name: p.name || 'No Name',
          address: p.vicinity || 'No Address',
          types: p.types,
          rating: p.rating,
          photoUrl: p.photos?.[0]?.getUrl({ maxWidth: 400 }),
        }));
        setNearbyPlaces(mappedResults);
        displayPlaceMarkers(mappedResults);
        getGeminiRecommendations(mappedResults);
      }
      setLoadingPlaces(false);
    });
  };

  const getGeminiRecommendations = useCallback(async (places: PlaceDetail[]) => {
    setLoadingGemini(true);
    try {
      const response = await fetch('/api/gemini-recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ places: places.map(p => ({ name: p.name, types: p.types, rating: p.rating })) })
      });
      const data = await response.json();
      setGeminiRecommendations(data.recommendation);
    } catch (err) {
      console.error("Gemini AI error:", err);
      setGeminiRecommendations("Could not fetch AI recommendations.");
    } finally {
      setLoadingGemini(false);
    }
  }, []);
  
  const addToItinerary = (place: PlaceDetail) => {
    if (!itinerary.some(p => p.placeId === place.placeId)) {
      setItinerary(prev => [...prev, place]);
      infoWindowRef.current?.close();
    }
  };

  // --- MAP MARKER UTILITIES ---
  const clearMarkers = () => {
    markersRef.current.forEach(marker => marker.setMap(null));
    markersRef.current = [];
  };

  const displayPlaceMarkers = (places: PlaceDetail[]) => {
    const google = (window as any).google;
    if (!mapRef.current || !infoWindowRef.current || !google) return;
    
    places.forEach(place => {
      const placeRequest: google.maps.places.PlaceDetailsRequest = {
        placeId: place.placeId,
        fields: ['name', 'geometry']
      }
      placesServiceRef.current?.getDetails(placeRequest, (placeResult, status) => {
        if(status === google.maps.places.PlacesServiceStatus.OK && placeResult?.geometry?.location){
          const marker = new google.maps.Marker({
            map: mapRef.current,
            position: placeResult.geometry.location,
            title: place.name,
            animation: google.maps.Animation.DROP,
          });

          marker.addListener('click', () => {
            const content = `
              <div style="color: #333;">
                <h4 style="margin: 0 0 5px 0; font-weight: bold;">${place.name}</h4>
                <p style="margin: 0 0 10px 0; font-size: 12px;">${place.address}</p>
                <button id="add-to-itinerary-btn" class="bg-yellow-500 text-black px-2 py-1 rounded text-xs">Add to Itinerary</button>
              </div>`;
            infoWindowRef.current?.setContent(content);
            infoWindowRef.current?.open(mapRef.current, marker);

            // Add listener to the button inside the InfoWindow
            google.maps.event.addListenerOnce(infoWindowRef.current, 'domready', () => {
              document.getElementById('add-to-itinerary-btn')?.addEventListener('click', () => addToItinerary(place));
            });
          });
          markersRef.current.push(marker);
        }
      });
    });
  };

  // --- RENDER ---
  return (
    <>
      <div id="map" className="absolute inset-0 z-0" />

      {/* --- Itinerary Panel (Right) --- */}
      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-80 h-[80vh] max-h-[700px] bg-black/80 backdrop-blur-sm text-yellow-200 p-4 overflow-y-auto z-10 rounded-l-lg border-l border-t border-b border-yellow-500/50">
        <h2 className="text-xl font-bold mb-4 text-yellow-300">Your Itinerary</h2>
        {itinerary.length === 0 ? (
          <p className="text-gray-400 italic">Click a marker's button to add places.</p>
        ) : (
          <ul>
            {itinerary.map((p) => (
              <li key={p.placeId} className="mb-3 border-b border-yellow-700/50 pb-2">
                <h3 className="font-semibold text-yellow-300">{p.name}</h3>
                <p className="text-sm text-yellow-100/80">{p.address}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* --- Controls Panel (Left) --- */}
      <div className="absolute left-4 top-24 z-10 space-y-3">
        <button
          onClick={handleDiscoverClick}
          disabled={loadingPlaces || !mapReady}
          className="bg-yellow-500 text-black px-4 py-2 rounded-md hover:bg-yellow-400 disabled:bg-gray-500 disabled:cursor-not-allowed transition-all flex items-center gap-2 shadow-lg"
        >
          {loadingPlaces ? <FaSpinner className="animate-spin" /> : 'Discover Nearby Attractions'}
        </button>

        {(loadingGemini || geminiRecommendations) && (
          <div className="bg-black/80 backdrop-blur-sm p-4 mt-2 rounded-md max-w-sm border border-yellow-500/50 text-white shadow-lg">
            <h4 className="font-bold text-yellow-300 mb-2">AI Suggestions:</h4>
            {loadingGemini ? (
               <p className="text-yellow-200/80 italic flex items-center gap-2"><FaSpinner className="animate-spin" /> Thinking...</p>
            ) : (
               <p className="text-sm leading-relaxed">{geminiRecommendations}</p>
            )}
          </div>
        )}
      </div>
    </>
  );
}