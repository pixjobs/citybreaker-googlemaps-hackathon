"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import gsap from "gsap";
import ItineraryPanel from "./ItineraryPanel";
import LocationMenuPopup, {
  RichPlaceDetails,
  YouTubeVideo,
} from "./LocationMenuPopup";
import { useMaps } from "./providers/MapsProvider";

// --- Terminal Retro-Dark Theme ---
const retroDarkStyle: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#1d1d1d" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#000000" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#facc15" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#444444" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#facc15" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#003300" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#333333" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#facc15" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#222222" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#000033" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#facc15" }] },
];

// --- Types ---
interface BasicPlaceInfo {
  name: string;
  address: string;
  photoUrl?: string;
}
interface PlacePhotoInfo {
  name: string;
  photoUrl?: string;
}
interface CityMapProps {
  center: { lat: number; lng: number; zoom: number; name: string };
  tripLength?: number;
  onPlacesLoaded?: (photoUrls: string[]) => void;
  selectedPlaceId?: string | null;
  isItineraryOpen: boolean;
  onCloseItinerary: () => void;
}

// --- Animated Panel ---
function useAnimatedPanel(
  panelRef: React.RefObject<HTMLDivElement>,
  isOpen: boolean
) {
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
        panelRef.current!.style.pointerEvents = isOpen ? "auto" : "none";
      },
    });
  }, [isOpen, panelRef]);
}

// --- Main Component ---
export default function CityMap({
  center,
  tripLength = 3,
  onPlacesLoaded,
  selectedPlaceId,
  isItineraryOpen,
  onCloseItinerary,
}: CityMapProps) {
  const { isLoaded } = useMaps();
  const mapRef = useRef<google.maps.Map | null>(null);
  const panelContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);

  const [itinerary, setItinerary] = useState<string | null>(null);
  const [placePhotos, setPlacePhotos] = useState<PlacePhotoInfo[]>([]);
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [isDetailsLoading, setIsDetailsLoading] = useState(false);
  const [isVideosLoading, setIsVideosLoading] = useState(false);
  const [selectedPlaceBasic, setSelectedPlaceBasic] = useState<BasicPlaceInfo>();
  const [selectedPlaceDetails, setSelectedPlaceDetails] = useState<RichPlaceDetails>();
  const [youtubeVideos, setYoutubeVideos] = useState<YouTubeVideo[]>([]);
  const [activeTab, setActiveTab] = useState<"info" | "reviews" | "videos">("info");
  const [isLoading, setIsLoading] = useState(false);

  useAnimatedPanel(panelContainerRef, isItineraryOpen);

  // Zoom to city
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.panTo({ lat: center.lat, lng: center.lng });
      mapRef.current.setZoom(center.zoom);
    }
  }, [center]);

  const fetchAndShowPlaceDetails = useCallback(
    async (placeId: string) => {
      if (!isLoaded || !mapRef.current) return;

      setIsDetailsLoading(true);
      setIsVideosLoading(true);
      setIsPopupOpen(true);
      setSelectedPlaceBasic(undefined);
      setSelectedPlaceDetails(undefined);
      setYoutubeVideos([]);
      setActiveTab("info");

      const service = new google.maps.places.PlacesService(mapRef.current);
      const request: google.maps.places.PlaceDetailsRequest = {
        placeId,
        fields: ["name", "geometry", "photos", "formatted_address", "website", "rating", "reviews"],
      };

      service.getDetails(request, async (place, status) => {
        if (status !== google.maps.places.PlacesServiceStatus.OK || !place) {
          console.error("Failed to get place details", status);
          setIsPopupOpen(false);
          setIsDetailsLoading(false);
          setIsVideosLoading(false);
          return;
        }

        if (place.geometry?.location) {
          mapRef.current?.panTo(place.geometry.location);
        }

        setSelectedPlaceBasic({
          name: place.name || "Unnamed Place",
          address: place.formatted_address || "No address available",
          photoUrl: place.photos?.[0]?.getUrl({ maxWidth: 1920, maxHeight: 1080 }),
        });

        setSelectedPlaceDetails({
          website: place.website,
          rating: place.rating,
          reviews: place.reviews,
          editorial_summary: (place as any).editorial_summary,
        });

        try {
          const res = await fetch("/api/youtube-search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: place.name }),
          });
          const data = await res.json();
          setYoutubeVideos(data.videos || []);
        } catch (err) {
          console.error("YouTube fetch error", err);
        } finally {
          setIsVideosLoading(false);
        }

        setIsDetailsLoading(false);
      });
    },
    [isLoaded]
  );

  // Load city map
  useEffect(() => {
    if (!isLoaded || !window.google?.maps?.Map) return;

    setIsLoading(true);
    setItinerary(null);
    setPlacePhotos([]);

    if (!mapRef.current && document.getElementById("map")) {
      mapRef.current = new google.maps.Map(document.getElementById("map") as HTMLElement, {
        center: { lat: center.lat, lng: center.lng },
        zoom: center.zoom,
        disableDefaultUI: true,
        styles: retroDarkStyle,
      });

      mapRef.current.addListener("click", (e: any) => {
        if (e.placeId) {
          e.stop();
          fetchAndShowPlaceDetails(e.placeId);
        }
      });
    }

    const service = new google.maps.places.PlacesService(mapRef.current!);
    service.nearbySearch(
      {
        location: new google.maps.LatLng(center.lat, center.lng),
        radius: 20000,
        type: "tourist_attraction",
      },
      (results, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && results) {
          markersRef.current.forEach((m) => m.setMap(null));
          markersRef.current = [];

          const photos = results.map((p) => ({
            name: p.name || "",
            photoUrl: p.photos?.[0]?.getUrl({ maxWidth: 1920, maxHeight: 1080 }),
          }));

          setPlacePhotos(photos.filter(p => p.name));
          onPlacesLoaded?.(photos.map(p => p.photoUrl!).filter(Boolean));

          results.forEach((p) => {
            if (!p.geometry?.location || !p.name || !p.place_id) return;
            const marker = new google.maps.Marker({
              position: p.geometry.location,
              map: mapRef.current!,
              title: p.name,
            });
            markersRef.current.push(marker);
            marker.addListener("click", () => fetchAndShowPlaceDetails(p.place_id!));
          });

          fetch("/api/gemini-recommendations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ places: photos, tripLength }),
          })
            .then((r) => r.json())
            .then((data) => setItinerary(data.itinerary))
            .catch((err) => {
              console.error("Itinerary generation failed:", err);
              setItinerary(`Error generating itinerary for ${center.name}`);
            })
            .finally(() => setIsLoading(false));
        } else {
          console.error("NearbySearch failed:", status);
          setIsLoading(false);
        }
      }
    );
  }, [isLoaded, center.lat, center.lng, center.zoom, center.name, tripLength, fetchAndShowPlaceDetails, onPlacesLoaded]);

  useEffect(() => {
    if (selectedPlaceId) {
      fetchAndShowPlaceDetails(selectedPlaceId);
    }
  }, [selectedPlaceId, fetchAndShowPlaceDetails]);

  return (
    <>
      <div id="map" className="absolute inset-0 z-0" />

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
            onClose={onCloseItinerary}
          />
        )}
      </div>
    </>
  );
}
