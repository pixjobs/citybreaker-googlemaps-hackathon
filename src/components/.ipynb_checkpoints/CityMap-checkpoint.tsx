"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import gsap from "gsap";
import ItineraryPanel from "./ItineraryPanel";
import LocationMenuPopup, {
  RichPlaceDetails,
  YouTubeVideo,
  Review,
} from "./LocationMenuPopup";
import { useMaps } from "./providers/MapsProvider";

// --- CONSTANTS AND TYPES (Unchanged) ---

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

interface BasicPlaceInfo {
  name: string;
  address: string;
}

interface PlacePhotoInfo {
  name: string;
  photoUrl?: string;
}

interface CityMapProps {
  center: { lat: number; lng: number; zoom: number; name: string };
  selectedCityName: string;
  onPlacesLoaded?: (photoUrls: string[]) => void;
  isItineraryOpen: boolean;
  onCloseItinerary: () => void;
  isSatelliteView: boolean;
  highlightedLocation?: { lat: number; lng: number } | null;
  onMapLoad?: (map: google.maps.Map) => void;
  onMapIdle?: () => void;
  onZoomToLocation: (location: { lat: number; lng: number }) => void;
}

interface CustomMarker extends google.maps.Marker {
  placeId?: string;
}

function useAnimatedPanel(panelRef: React.RefObject<HTMLDivElement | null>, isOpen: boolean) {
    const [isMobile, setIsMobile] = useState(false);
    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener("resize", checkMobile);
        return () => window.removeEventListener("resize", checkMobile);
    }, []);
    useEffect(() => {
        if (!panelRef.current) return;
        gsap.to(panelRef.current, {
            y: isOpen ? "0" : isMobile ? "100%" : "0",
            x: isOpen ? "0" : isMobile ? "0" : "100%",
            autoAlpha: isOpen ? 1 : 0,
            duration: 0.5,
            ease: "power3.inOut",
            onStart: () => { if (panelRef.current) panelRef.current.style.pointerEvents = isOpen ? "auto" : "none"; },
        });
    }, [isOpen, panelRef, isMobile]);
}


export default function CityMap({
  center,
  selectedCityName,
  onPlacesLoaded,
  isItineraryOpen,
  onCloseItinerary,
  isSatelliteView,
  highlightedLocation,
  onMapLoad,
  onMapIdle,
}: CityMapProps) {
  const { isLoaded } = useMaps();
  const mapRef = useRef<google.maps.Map | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const attractionMarkersRef = useRef<CustomMarker[]>([]);
  const highlightMarkerRef = useRef<google.maps.Marker | null>(null);

  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [selectedPlaceBasic, setSelectedPlaceBasic] = useState<BasicPlaceInfo>();
  const [selectedPlaceDetails, setSelectedPlaceDetails] = useState<RichPlaceDetails>();
  const [youtubeVideos, setYoutubeVideos] = useState<YouTubeVideo[]>([]);
  const [placePhotos, setPlacePhotos] = useState<PlacePhotoInfo[]>([]);
  
  const [isDetailsLoading, setIsDetailsLoading] = useState(false);
  const [isReviewsLoading, setIsReviewsLoading] = useState(false);
  const [isVideosLoading, setIsVideosLoading] = useState(false);
  
  const [activeTab, setActiveTab] = useState<"info" | "reviews" | "videos">("info");

  const shouldOpenItinerary = isItineraryOpen && placePhotos.length > 0;
  useAnimatedPanel(panelRef, shouldOpenItinerary);

  const clearMarkers = useCallback(() => {
    attractionMarkersRef.current.forEach((m) => m.setMap(null));
    attractionMarkersRef.current = [];
  }, []);

  const handleMarkerClick = useCallback(async (placeId: string) => {
    if (!isLoaded || !mapRef.current) return;

    setIsDetailsLoading(true);
    setIsPopupOpen(true);
    setSelectedPlaceBasic(undefined);
    setSelectedPlaceDetails(undefined);
    setYoutubeVideos([]);
    setActiveTab("info");
    
    try {
      const place = new google.maps.places.Place({ id: placeId });
      const fieldsToFetch: (keyof google.maps.places.Place)[] = ["id", "displayName", "formattedAddress", "websiteURI", "rating", "location", "editorialSummary"];
      await place.fetchFields({ fields: fieldsToFetch });

      if (place.location) mapRef.current?.panTo(place.location);
      
      setSelectedPlaceBasic({
        name: place.displayName || "Unnamed Place",
        address: place.formattedAddress || "No address available",
      });
      
      // --- FIX: This block safely handles the editorialSummary type mismatch ---
      // The API can return a string, an object, null, or undefined. We handle all cases.
      const summaryObject =
        place.editorialSummary && typeof place.editorialSummary === 'object'
          ? (place.editorialSummary as { overview?: string }) // It's already the object we want
          : typeof place.editorialSummary === 'string'
          ? { overview: place.editorialSummary } // It's a string, so we wrap it in an object
          : undefined; // It's null or undefined, so we set it to undefined

      setSelectedPlaceDetails({
        place_id: place.id, 
        website: place.websiteURI?.toString(),
        rating: place.rating ?? undefined,
        reviews: [],
        editorialSummary: summaryObject, // Use the safely-typed object
      });

    } catch (error) {
      console.error("Failed to fetch basic place details:", error);
      setIsPopupOpen(false);
    } finally {
      setIsDetailsLoading(false);
    }
  }, [isLoaded]);

  const fetchReviewsForCurrentPlace = useCallback(async () => {
    if (!isLoaded || !selectedPlaceDetails?.place_id || isReviewsLoading) return;
    
    setIsReviewsLoading(true);
    try {
      const place = new google.maps.places.Place({ id: selectedPlaceDetails.place_id });
      await place.fetchFields({ fields: ["reviews"] });

      const validReviews: Review[] = (place.reviews || [])
        .filter(apiReview => typeof apiReview.rating === "number")
        .map(apiReview => ({
          author_name: apiReview.authorAttribution?.displayName || "Anonymous",
          rating: apiReview.rating!,
          relative_time_description: apiReview.relativePublishTimeDescription || "",
          text: apiReview.text || "",
          profile_photo_url: apiReview.authorAttribution?.photoURI || "/default-avatar.png",
        }));
      
      setSelectedPlaceDetails(prevDetails => prevDetails ? { ...prevDetails, reviews: validReviews } : undefined);

    } catch (error) {
      console.error("Failed to fetch place reviews:", error);
    } finally {
      setIsReviewsLoading(false);
    }
  }, [isLoaded, selectedPlaceDetails, isReviewsLoading]);

  const fetchVideosForCurrentPlace = useCallback(async () => {
    if (!selectedPlaceBasic?.name || isVideosLoading || youtubeVideos.length > 0) return;

    setIsVideosLoading(true);
    try {
      const res = await fetch("/api/youtube-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: selectedPlaceBasic.name }),
      });
      if (!res.ok) throw new Error(`YouTube search failed with status: ${res.status}`);
      const data = await res.json();
      setYoutubeVideos(data.videos || []);
    } catch (error) {
      console.error("Failed to fetch YouTube videos:", error);
    } finally {
      setIsVideosLoading(false);
    }
  }, [selectedPlaceBasic, isVideosLoading, youtubeVideos.length]);

  useEffect(() => {
    if (!isLoaded || mapRef.current) return;
    const map = new window.google.maps.Map(document.getElementById("map") as HTMLElement, {
      center,
      zoom: center.zoom,
      disableDefaultUI: true,
      styles: retroDarkStyle,
    });
    mapRef.current = map;
    onMapLoad?.(map);

    map.addListener("idle", () => onMapIdle?.());
    map.addListener("click", (e: google.maps.MapMouseEvent | google.maps.IconMouseEvent) => {
      if ("placeId" in e && e.placeId) {
        e.stop();
        handleMarkerClick(e.placeId);
      }
    });
  }, [isLoaded, onMapLoad, onMapIdle, handleMarkerClick, center]);
  
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.panTo(center);
      mapRef.current.setZoom(center.zoom);
    }
  }, [center]);

  useEffect(() => {
    if (!isLoaded || !mapRef.current) return;
    const findAndDisplayPlaces = async () => {
      setPlacePhotos([]);
      clearMarkers();
      try {
        const { places } = await google.maps.places.Place.searchNearby({
          includedTypes: ['tourist_attraction'],
          locationRestriction: { center: center, radius: 20000 },
          maxResultCount: 15,
          fields: ["id", "displayName", "location", "photos"],
        });
        
        const photos = places.map(p => ({ name: p.displayName || "", photoUrl: p.photos?.[0]?.getURI() }));
        setPlacePhotos(photos.filter(p => p.name));
        onPlacesLoaded?.(photos.map(p => p.photoUrl!).filter(Boolean));

        for (const place of places) {
          if (!place.location || !place.id) continue;
          const marker: CustomMarker = new google.maps.Marker({
            position: place.location,
            map: mapRef.current,
            title: place.displayName,
            icon: { url: "/marker.png", scaledSize: new google.maps.Size(40, 40) },
          });
          marker.placeId = place.id;
          marker.addListener("click", () => handleMarkerClick(place.id!));
          attractionMarkersRef.current.push(marker);
        }
      } catch (error) {
        console.error("Nearby search failed:", error);
      }
    };
    findAndDisplayPlaces();
  }, [isLoaded, center.name, onPlacesLoaded, clearMarkers, handleMarkerClick, center]);

  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.setMapTypeId(isSatelliteView ? "satellite" : "roadmap");
    }
  }, [isSatelliteView]);

  useEffect(() => {
    if (highlightMarkerRef.current) highlightMarkerRef.current.setMap(null);
    if (!highlightedLocation || !mapRef.current || !isLoaded) return;

    const showHighlightMarker = async () => {
        const marker = new google.maps.Marker({
            position: highlightedLocation,
            map: mapRef.current,
            icon: { url: "/highlight-marker.png", scaledSize: new google.maps.Size(60, 60), anchor: new google.maps.Point(30, 60) },
            animation: window.google.maps.Animation.DROP,
            zIndex: 999,
        });
        highlightMarkerRef.current = marker;

        const existingMarker = attractionMarkersRef.current.find(m => {
          const pos = m.getPosition();
          return pos && Math.abs(pos.lat() - highlightedLocation.lat) < 0.0001 && Math.abs(pos.lng() - highlightedLocation.lng) < 0.0001;
        });

        if (existingMarker?.placeId) {
          marker.addListener("click", () => handleMarkerClick(existingMarker.placeId!));
        } else {
          try {
            const { places } = await google.maps.places.Place.searchNearby({ locationRestriction: { center: highlightedLocation, radius: 50 }, maxResultCount: 1, fields: ["id"] });
            if (places[0]?.id) {
              marker.addListener("click", () => handleMarkerClick(places[0].id!));
            }
          } catch (error) {
            console.log("Could not find a clickable place ID for highlight marker", error);
          }
        }
    };
    showHighlightMarker();
  }, [highlightedLocation, isLoaded, handleMarkerClick]);

  const handleZoomToLocation = useCallback((location: { lat: number; lng: number }) => {
    if (mapRef.current) {
      mapRef.current.panTo(location);
      mapRef.current.setZoom(17);
    }
    onCloseItinerary();
  }, [onCloseItinerary]);

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
        isReviewsLoading={isReviewsLoading}
        isVideosLoading={isVideosLoading}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onFetchReviews={fetchReviewsForCurrentPlace}
        onFetchVideos={fetchVideosForCurrentPlace}
      />
      <div ref={panelRef} className="fixed inset-0 z-20 opacity-0 pointer-events-none" style={{ transform: "translateY(100%)" }}>
        {shouldOpenItinerary && (
            <ItineraryPanel
                cityName={selectedCityName}
                places={placePhotos}
                onClose={onCloseItinerary}
                onZoomToLocation={handleZoomToLocation} 
            />
        )}
      </div>
    </>
  );
}