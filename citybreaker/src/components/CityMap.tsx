"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { FaMapMarkedAlt, FaTimes } from "react-icons/fa";

// Local Component Imports
import ItineraryPanel from "./ItineraryPanel";
import LocationMenuPopup from "./LocationMenuPopup";
import { useMaps } from "./providers/MapsProvider"; // Using our central provider

// --- Data Structures & Helper Functions ---

// Defines the shape of data our LocationMenuPopup component expects.
interface PlaceDetail {
  name: string;
  address: string;
  website?: string;
  photoUrl?: string;
  description?: string;
}

// Converts the raw data from Google's API into the clean `PlaceDetail` format.
// This acts as an "adapter" and keeps our components decoupled.
function convertPlaceResultToPlaceDetail(place: google.maps.places.PlaceResult): PlaceDetail {
  return {
    name: place.name || "Unnamed Place",
    address: place.vicinity || "Address not available",
    website: place.website,
    photoUrl: place.photos?.[0]?.getUrl({ maxWidth: 800, maxHeight: 600 }),
    description: place.types?.map(t => t.replace(/_/g, ' ')).join(', '),
  };
}

// Defines the props for the main CityMap component.
interface CityMapProps {
  center: {
    lat: number;
    lng: number;
    zoom: number;
    name: string;
  };
  tripLength?: number;
}

// Defines the shape of data needed for the ItineraryPanel's photo list.
interface PlacePhotoInfo {
  name: string;
  photoUrl?: string;
}

// A custom hook to manage the GSAP animation for the side panel.
function useAnimatedPanel(panelRef: React.RefObject<HTMLDivElement>, isOpen: boolean) {
  useEffect(() => {
    if (!panelRef.current) return;
    const isMobile = window.innerWidth < 768;
    gsap.to(panelRef.current, {
      y: isOpen ? "0" : isMobile ? "100%" : "0",
      x: isOpen ? "0" : isMobile ? "0" : "100%",
      autoAlpha: isOpen ? 1 : 0,
      duration: 0.5,
      ease: "power3.inOut",
      onStart: () => {
        if (panelRef.current) {
          panelRef.current.style.pointerEvents = isOpen ? "auto" : "none";
        }
      },
    });
  }, [isOpen, panelRef]);
}


// --- Main CityMap Component ---

export default function CityMap({ center, tripLength = 3 }: CityMapProps) {
  // Get the map loading status from our central provider.
  const { isLoaded } = useMaps();

  // Refs to hold mutable objects that persist across renders.
  const mapRef = useRef<google.maps.Map | null>(null);
  const panelContainerRef = useRef<HTMLDivElement>(null);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);

  // State for the Itinerary Panel
  const [itinerary, setItinerary] = useState<string | null>(null);
  const [placePhotos, setPlacePhotos] = useState<PlacePhotoInfo[]>([]);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  
  // State for the Location Menu Popup (the modal)
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<google.maps.places.PlaceResult | null>(null);
  const [allPlaces, setAllPlaces] = useState<google.maps.places.PlaceResult[]>([]);
  const [activeTab, setActiveTab] = useState<"info" | "nearby">("info");

  // General state
  const [isLoading, setIsLoading] = useState(false);
  const cityKey = `${center.lat}-${center.lng}-${tripLength}`;

  // Initialize the panel animation hook.
  useAnimatedPanel(panelContainerRef, isPanelOpen);

  // Effect to pan the map when the center prop changes.
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.panTo(center);
      mapRef.current.setZoom(center.zoom);
    }
  }, [center]);

  // The main effect for initializing the map and fetching data.
  useEffect(() => {
    // This is a critical guard clause. It prevents any map code from running until
    // the Google script is fully loaded AND the Map object is available on the window.
    // This solves the "Map is not a constructor" error.
    if (!isLoaded || !window.google || !window.google.maps || !window.google.maps.Map) {
      return;
    }

    const initAndFetch = async () => {
      setIsLoading(true);
      setItinerary(null);
      setPlacePhotos([]);
      setAllPlaces([]);

      // Initialize the map only once.
      if (!mapRef.current && document.getElementById("map")) {
        mapRef.current = new window.google.maps.Map(document.getElementById("map") as HTMLElement, {
          center,
          zoom: center.zoom,
          disableDefaultUI: true,
          styles: [ /* Your map styles... */ ],
        });
      }

      const service = new window.google.maps.places.PlacesService(mapRef.current!);

      service.nearbySearch(
        {
          location: new window.google.maps.LatLng(center.lat, center.lng),
          radius: 20000,
          type: "tourist_attraction",
        },
        async (results, status) => {
          if (status !== window.google.maps.places.PlacesServiceStatus.OK || !results) {
            console.error("PlacesService failed with status:", status);
            setIsLoading(false);
            return;
          }

          setAllPlaces(results);

          // Clear old markers and lines from the map before adding new ones.
          markersRef.current.forEach(m => m.setMap(null));
          markersRef.current = [];
          polylineRef.current?.setMap(null);

          const photoInfo: PlacePhotoInfo[] = [];
          const pathCoords: google.maps.LatLngLiteral[] = [];

          results.forEach(place => {
            if (!place.geometry?.location || !place.name) return;
            pathCoords.push(place.geometry.location.toJSON());

            const marker = new window.google.maps.Marker({
              position: place.geometry.location,
              map: mapRef.current!,
              title: place.name,
            });
            markersRef.current.push(marker);

            // --- THIS IS THE TRIGGER ---
            // An event listener is attached to each marker. When clicked, it updates
            // the state to open the LocationMenuPopup with the correct place data.
            marker.addListener('click', () => {
              setSelectedPlace(place);
              setIsPopupOpen(true);
              setActiveTab("info");
            });

            photoInfo.push({ name: place.name, photoUrl: place.photos?.[0]?.getUrl() });
          });

          setPlacePhotos(photoInfo);

          polylineRef.current = new window.google.maps.Polyline({
            path: pathCoords,
            geodesic: true,
            strokeColor: '#00ff90',
            strokeOpacity: 0.8,
            strokeWeight: 4,
            map: mapRef.current!,
          });

          // Fetch the itinerary from the backend API.
          try {
            const res = await fetch("/api/gemini-recommendations", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ places: photoInfo, tripLength }),
            });
            if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
            const data = await res.json();
            setItinerary(data.itinerary);
            // NOTE: We intentionally DO NOT open the panel automatically.
            // The user will open it with the button.
          } catch (err) {
            console.error("Itinerary generation failed:", err);
            setItinerary(`Error: Could not generate itinerary for ${center.name}.`);
          } finally {
            setIsLoading(false);
          }
        }
      );
    };

    initAndFetch();
  }, [isLoaded, cityKey, center]);

  return (
    <>
      <div id="map" className="absolute inset-0 z-0" />

      {/* The Landmark/Restaurant Modal Popup */}
      <LocationMenuPopup
        isOpen={isPopupOpen}
        onClose={() => setIsPopupOpen(false)}
        type="landmark"
        place={selectedPlace ? convertPlaceResultToPlaceDetail(selectedPlace) : undefined}
        nearby={allPlaces
          .filter(p => p.place_id !== selectedPlace?.place_id)
          .map(convertPlaceResultToPlaceDetail)
        }
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      {/* The Floating Action Button to toggle the Itinerary Panel */}
      <button
        onClick={() => setIsPanelOpen(!isPanelOpen)}
        className="fixed bottom-6 right-6 md:bottom-10 md:right-10 z-30 bg-yellow-500 text-black p-4 rounded-full shadow-lg hover:bg-yellow-400 active:scale-95 transition-all"
        aria-label={isPanelOpen ? "Hide Itinerary" : "Show Itinerary"}
      >
        {isPanelOpen ? <FaTimes size={24} /> : <FaMapMarkedAlt size={24} />}
      </button>

      {/* The Itinerary Panel that slides in from the side */}
      <div
        ref={panelContainerRef}
        className="fixed inset-0 z-20 opacity-0 pointer-events-none"
        style={{ transform: 'translateY(100%) translateX(100%)' }}
      >
        {(isLoading || itinerary) && (
          <ItineraryPanel
            cityName={center.name}
            itineraryMarkdown={itinerary}
            isLoading={isLoading}
            placePhotos={placePhotos}
            onClose={() => setIsPanelOpen(false)}
          />
        )}
      </div>
    </>
  );
}