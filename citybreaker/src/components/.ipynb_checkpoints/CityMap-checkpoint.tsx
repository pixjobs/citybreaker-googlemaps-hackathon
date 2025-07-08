"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { FaMapMarkedAlt, FaTimes } from "react-icons/fa";

// Local Component Imports
import ItineraryPanel from "./ItineraryPanel";
import LocationMenuPopup, { RichPlaceDetails, YouTubeVideo } from "./LocationMenuPopup"; // Import YouTubeVideo type
import { useMaps } from "./providers/MapsProvider";

// --- Data Structures & Helpers ---
interface BasicPlaceInfo {
  name: string;
  address: string;
  photoUrl?: string;
}
interface CityMapProps {
  center: { lat: number; lng: number; zoom: number; name: string; };
  tripLength?: number;
}
interface PlacePhotoInfo {
  name: string;
  photoUrl?: string;
}
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
  const { isLoaded } = useMaps();
  const mapRef = useRef<google.maps.Map | null>(null);
  const panelContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  
  // State for Itinerary Panel
  const [itinerary, setItinerary] = useState<string | null>(null);
  const [placePhotos, setPlacePhotos] = useState<PlacePhotoInfo[]>([]);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  
  // --- UPDATED: State for Location Popup now includes videos ---
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [isDetailsLoading, setIsDetailsLoading] = useState(false);
  const [isVideosLoading, setIsVideosLoading] = useState(false); // New loading state for videos
  const [selectedPlaceBasic, setSelectedPlaceBasic] = useState<BasicPlaceInfo | undefined>();
  const [selectedPlaceDetails, setSelectedPlaceDetails] = useState<RichPlaceDetails | undefined>();
  const [youtubeVideos, setYoutubeVideos] = useState<YouTubeVideo[]>([]); // New state for videos
  const [activeTab, setActiveTab] = useState<"info" | "reviews" | "videos">("info");

  const [isLoading, setIsLoading] = useState(false);
  const cityKey = `${center.lat}-${center.lng}-${tripLength}`;

  useAnimatedPanel(panelContainerRef, isPanelOpen);

  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.panTo(center);
      mapRef.current.setZoom(center.zoom);
    }
  }, [center]);

  const fetchAndShowPlaceDetails = (placeId: string) => {
    if (!mapRef.current) return;

    // Reset all states for the new popup
    setIsDetailsLoading(true);
    setIsVideosLoading(true); // Start both loading states
    setIsPopupOpen(true);
    setSelectedPlaceBasic(undefined);
    setSelectedPlaceDetails(undefined);
    setYoutubeVideos([]);
    setActiveTab("info");

    const placesService = new window.google.maps.places.PlacesService(mapRef.current!);
    
    // --- Step 1: Fetch Google Place Details ---
    placesService.getDetails(
      {
        placeId: placeId,
        fields: ["name", "vicinity", "photos", "website", "rating", "reviews", "editorial_summary"],
      },
      async (placeDetails, status) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK && placeDetails) {
          setSelectedPlaceBasic({
            name: placeDetails.name || "Unnamed Place",
            address: placeDetails.vicinity || "Address not available",
            photoUrl: placeDetails.photos?.[0]?.getUrl({ maxWidth: 800, maxHeight: 600 }),
          });
          setSelectedPlaceDetails({
            website: placeDetails.website,
            rating: placeDetails.rating,
            reviews: placeDetails.reviews,
            editorial_summary: placeDetails.editorial_summary,
          });
          setIsDetailsLoading(false); // Main details are loaded

          // --- Step 2: NOW, FETCH YOUTUBE VIDEOS using our new API route ---
          try {
            const res = await fetch('/api/youtube-search', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ query: placeDetails.name }),
            });
            if (!res.ok) throw new Error('YouTube search failed');
            const data = await res.json();
            setYoutubeVideos(data.videos);
          } catch (error) {
            console.error(error);
            setYoutubeVideos([]); // Ensure it's an empty array on failure
          } finally {
            setIsVideosLoading(false); // Videos are loaded (or have failed)
          }

        } else {
          console.error("Place Details request failed with status:", status);
          setIsPopupOpen(false);
          setIsDetailsLoading(false);
          setIsVideosLoading(false);
        }
      }
    );
  };

  useEffect(() => {
    // This useEffect for map initialization and nearbySearch is UNCHANGED.
    // It correctly sets up the map and the triggers.
    if (!isLoaded || !window.google || !window.google.maps || !window.google.maps.Map) {
      return;
    }

    const initAndFetch = async () => {
      setIsLoading(true);
      setItinerary(null);
      setPlacePhotos([]);

      if (!mapRef.current && document.getElementById("map")) {
        mapRef.current = new window.google.maps.Map(document.getElementById("map") as HTMLElement, {
          center,
          zoom: center.zoom,
          disableDefaultUI: true,
          styles: [
            { elementType: "geometry", stylers: [{ color: "#1d2c4d" }] },
            { elementType: "labels.text.fill", stylers: [{ color: "#8ec3b9" }] },
            { elementType: "labels.text.stroke", stylers: [{ color: "#1a3646" }] },
            { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#14546a" }] },
            { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#023e58" }] },
            { featureType: "poi", elementType: "geometry", stylers: [{ color: "#0c4152" }] },
            { featureType: "road", elementType: "geometry", stylers: [{ color: "#00ff90" }] },
            { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#ffffff" }] },
            { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1626" }] },
          ],
        });

        mapRef.current.addListener('click', (e: google.maps.MapMouseEvent) => {
          if (e.placeId) {
            e.stop();
            fetchAndShowPlaceDetails(e.placeId);
          }
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

          markersRef.current.forEach(m => m.setMap(null));
          markersRef.current = [];
          
          const photoInfoForItinerary: PlacePhotoInfo[] = results
            .map(place => ({
              name: place.name || '',
              photoUrl: place.photos?.[0]?.getUrl(),
            }))
            .filter(p => p.name);
          
          setPlacePhotos(photoInfoForItinerary);

          results.forEach(place => {
            if (!place.geometry?.location || !place.name || !place.place_id) return;

            const marker = new window.google.maps.Marker({
              position: place.geometry.location,
              map: mapRef.current!,
              title: place.name,
            });
            markersRef.current.push(marker);

            const placeId = place.place_id;
            marker.addListener('click', () => fetchAndShowPlaceDetails(placeId));
          });

          try {
            const res = await fetch("/api/gemini-recommendations", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ places: photoInfoForItinerary, tripLength }),
            });
            if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
            const data = await res.json();
            setItinerary(data.itinerary);
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

      {/* --- UPDATED: Pass the new video props to the popup --- */}
      <LocationMenuPopup
        isOpen={isPopupOpen}
        onClose={() => setIsPopupOpen(false)}
        place={selectedPlaceBasic}
        details={selectedPlaceDetails}
        youtubeVideos={youtubeVideos}
        isLoading={isDetailsLoading}
        isVideosLoading={isVideosLoading}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      <button
        onClick={() => setIsPanelOpen(!isPanelOpen)}
        className="fixed bottom-6 right-6 md:bottom-10 md:right-10 z-30 bg-yellow-500 text-black p-4 rounded-full shadow-lg hover:bg-yellow-400 active:scale-95 transition-all"
        aria-label={isPanelOpen ? "Hide Itinerary" : "Show Itinerary"}
      >
        {isPanelOpen ? <FaTimes size={24} /> : <FaMapMarkedAlt size={24} />}
      </button>

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