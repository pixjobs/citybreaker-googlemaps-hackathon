"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import gsap from "gsap";

// Local Component Imports
import ItineraryPanel from "./ItineraryPanel";
import LocationMenuPopup, { RichPlaceDetails, YouTubeVideo } from "./LocationMenuPopup";
import { useMaps } from "./providers/MapsProvider";

// --- Retro Dark Style ---
const retroStyle: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#ebe3cd" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#523735" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#f5f1e6" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#c9b2a6" }] },
  { featureType: "administrative.land_parcel", elementType: "geometry.stroke", stylers: [{ color: "#dcd2be" }] },
  { featureType: "administrative.land_parcel", elementType: "labels.text.fill", stylers: [{ color: "#ae9e90" }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#dfd2ae" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#dfd2ae" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#93817c" }] },
  { featureType: "poi.park", elementType: "geometry.fill", stylers: [{ color: "#a5b076" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#447530" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#f5f1e6" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#fdfcf8" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#f8c967" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#e9bc62" }] },
  { featureType: "road.highway.controlled_access", elementType: "geometry", stylers: [{ color: "#e98d58" }] },
  { featureType: "road.highway.controlled_access", elementType: "geometry.stroke", stylers: [{ color: "#db8555" }] },
  { featureType: "road.local", elementType: "labels.text.fill", stylers: [{ color: "#806b63" }] },
  { featureType: "transit.line", elementType: "geometry", stylers: [{ color: "#dfd2ae" }] },
  { featureType: "transit.line", elementType: "labels.text.fill", stylers: [{ color: "#8f7d77" }] },
  { featureType: "transit.line", elementType: "labels.text.stroke", stylers: [{ color: "#ebe3cd" }] },
  { featureType: "transit.station", elementType: "geometry", stylers: [{ color: "#dfd2ae" }] },
  { featureType: "water", elementType: "geometry.fill", stylers: [{ color: "#b9d3c2" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#92998d" }] },
];

// --- Data Structures & Helpers ---
interface BasicPlaceInfo {
  name: string;
  address: string;
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
interface PlacePhotoInfo {
  name: string;
  photoUrl?: string;
}
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
        if (panelRef.current) {
          panelRef.current.style.pointerEvents = isOpen ? "auto" : "none";
        }
      },
    });
  }, [isOpen, panelRef]);
}

// --- Main CityMap Component ---
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
  const [selectedPlaceBasic, setSelectedPlaceBasic] = useState<BasicPlaceInfo | undefined>();
  const [selectedPlaceDetails, setSelectedPlaceDetails] = useState<RichPlaceDetails | undefined>();
  const [youtubeVideos, setYoutubeVideos] = useState<YouTubeVideo[]>([]);
  const [activeTab, setActiveTab] = useState<"info" | "reviews" | "videos">("info");

  const [isLoading, setIsLoading] = useState(false);
  const cityKey = `${center.lat}-${center.lng}-${tripLength}`;

  useAnimatedPanel(panelContainerRef, isItineraryOpen);

  // Pan & zoom effect
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.panTo({ lat: center.lat, lng: center.lng });
      mapRef.current.setZoom(center.zoom);
    }
  }, [center.lat, center.lng, center.zoom]);

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

      const service = new window.google.maps.places.PlacesService(mapRef.current);
      const request: google.maps.places.PlaceDetailsRequest = {
        placeId,
        fields: ["name", "geometry", "photos", "formatted_address", "website", "rating", "reviews"],
      };

      service.getDetails(request, async (place, status) => {
        if (status !== window.google.maps.places.PlacesServiceStatus.OK || !place) {
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
          address: place.formatted_address || "Address not available",
          photoUrl: place.photos?.[0]?.getUrl({ maxWidth: 1920, maxHeight: 1080 }),
        });

        setSelectedPlaceDetails({
          website: place.website,
          rating: place.rating,
          reviews: place.reviews,
          editorial_summary: (place as any).editorial_summary,
        });

        try {
          const queryName = place.name;
          const res = await fetch("/api/youtube-search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: queryName }),
          });
          if (!res.ok) throw new Error("YouTube search failed");
          const data = await res.json();
          setYoutubeVideos(data.videos);
        } catch (error) {
          console.error("YouTube fetch error:", error);
          setYoutubeVideos([]);
        } finally {
          setIsVideosLoading(false);
        }

        setIsDetailsLoading(false);
      });
    },
    [isLoaded]
  );

  // Fetch places & itinerary
  useEffect(() => {
    if (!isLoaded || !window.google?.maps?.Map) return;

    setIsLoading(true);
    setItinerary(null);
    setPlacePhotos([]);

    if (!mapRef.current && document.getElementById("map")) {
      mapRef.current = new window.google.maps.Map(
        document.getElementById("map") as HTMLElement,
        {
          center: { lat: center.lat, lng: center.lng },
          zoom: center.zoom,
          disableDefaultUI: true,
          styles: retroStyle,
        }
      );

      mapRef.current.addListener("click", (e: any) => {
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
      (results, status) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK && results) {
          markersRef.current.forEach((m) => m.setMap(null));
          markersRef.current = [];

          const photoInfoForItinerary = results
            .map((p) => ({
              name: p.name || "",
              photoUrl: p.photos?.[0]?.getUrl({ maxWidth: 1920, maxHeight: 1080 }),
            }))
            .filter((p) => p.name);

          setPlacePhotos(photoInfoForItinerary);

          const urls = photoInfoForItinerary.map((p) => p.photoUrl!).filter(Boolean);
          onPlacesLoaded?.(urls);

          results.forEach((p) => {
            if (!p.geometry?.location || !p.name || !p.place_id) return;
            const marker = new window.google.maps.Marker({
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
            body: JSON.stringify({ places: photoInfoForItinerary, tripLength }),
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
