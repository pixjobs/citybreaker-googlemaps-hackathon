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
  // New props to handle actions from the header
  isSatelliteView: boolean;
  showLandmarks: boolean;
  showRestaurants: boolean;
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
        panelRef.current!.style.pointerEvents = isOpen ? "auto" : "none";
      },
    });
  }, [isOpen, panelRef]);
}

export default function CityMap({
  center,
  tripLength = 3,
  onPlacesLoaded,
  selectedPlaceId,
  isItineraryOpen,
  onCloseItinerary,
  isSatelliteView,
  showLandmarks,
  showRestaurants,
}: CityMapProps) {
  const { isLoaded } = useMaps();
  const mapRef = useRef<google.maps.Map | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  
  // Refs for different categories of markers
  const attractionMarkersRef = useRef<google.maps.Marker[]>([]);
  const landmarkMarkersRef = useRef<google.maps.Marker[]>([]);
  const restaurantMarkersRef = useRef<google.maps.Marker[]>([]);

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

  useAnimatedPanel(panelRef, isItineraryOpen);

  const clearMarkers = (markers: React.MutableRefObject<google.maps.Marker[]>) => {
    markers.current.forEach(m => m.setMap(null));
    markers.current = [];
  };

  const fetchAndShowPlaceDetails = useCallback(async (placeId: string) => {
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
      if (place.geometry?.location) mapRef.current?.panTo(place.geometry.location);

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
  }, [isLoaded]);
  
  // Effect to initialize map and handle base layer of tourist attractions
  useEffect(() => {
    if (!isLoaded || !window.google?.maps?.Map) return;

    setIsLoading(true);
    setItinerary(null);
    setPlacePhotos([]);

    // Clear all markers when city changes
    clearMarkers(attractionMarkersRef);
    clearMarkers(landmarkMarkersRef);
    clearMarkers(restaurantMarkersRef);

    if (!mapRef.current) {
      mapRef.current = new window.google.maps.Map(document.getElementById("map") as HTMLElement, {
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
    } else {
        mapRef.current.panTo({ lat: center.lat, lng: center.lng });
        mapRef.current.setZoom(center.zoom);
    }
    
    const service = new window.google.maps.places.PlacesService(mapRef.current!);
    service.nearbySearch(
      { location: new window.google.maps.LatLng(center.lat, center.lng), radius: 20000, type: "tourist_attraction" },
      async (results, status) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK && results) {
          const photos = results.map(p => ({ name: p.name || "", photoUrl: p.photos?.[0]?.getUrl({ maxWidth: 1920, maxHeight: 1080 }) }));
          setPlacePhotos(photos.filter(p => p.name));
          onPlacesLoaded?.(photos.map(p => p.photoUrl!).filter(Boolean));

          results.forEach(p => {
            if (!p.geometry?.location || !p.name || !p.place_id) return;
            const marker = new window.google.maps.Marker({
              position: p.geometry.location,
              map: mapRef.current!,
              title: p.name,
              icon: { url: "/marker.png", scaledSize: new google.maps.Size(40, 40) },
            });
            attractionMarkersRef.current.push(marker);
            marker.addListener("click", () => fetchAndShowPlaceDetails(p.place_id!));
          });

          try {
            const res = await fetch("/api/gemini-recommendations/json", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ places: photos, tripLength }),
            });
            const data = await res.json();
            setItinerary(data.itinerary);
          } catch (err) {
            console.error("Itinerary generation failed:", err);
            setItinerary(`Error generating itinerary for ${center.name}`);
          } finally {
            setIsLoading(false);
          }
        } else {
          console.error("NearbySearch for attractions failed:", status);
          setIsLoading(false);
        }
      }
    );
  }, [isLoaded, center, tripLength, fetchAndShowPlaceDetails, onPlacesLoaded]);
  
  // Effect to handle satellite view toggle
  useEffect(() => {
    if (!mapRef.current) return;
    const isCurrentlySatellite = mapRef.current.getMapTypeId() === 'satellite';
    if (isSatelliteView && !isCurrentlySatellite) {
      mapRef.current.setMapTypeId('satellite');
    } else if (!isSatelliteView && isCurrentlySatellite) {
      mapRef.current.setMapTypeId('roadmap');
      mapRef.current.setOptions({ styles: retroDarkStyle });
    }
  }, [isSatelliteView]);

  // Reusable function to search for and display different types of places
  const searchAndDisplayPlaces = useCallback((
    placeType: string, 
    markersRef: React.MutableRefObject<google.maps.Marker[]>, 
    iconUrl: string
  ) => {
    if (!isLoaded || !mapRef.current) return;
    
    clearMarkers(markersRef);

    const service = new window.google.maps.places.PlacesService(mapRef.current);
    service.nearbySearch({
      location: new window.google.maps.LatLng(center.lat, center.lng),
      radius: 15000, // Slightly smaller radius for more specific results
      type: placeType,
    }, (results, status) => {
      if (status === window.google.maps.places.PlacesServiceStatus.OK && results) {
        results.forEach(p => {
          if (!p.geometry?.location || !p.name || !p.place_id) return;
          const marker = new window.google.maps.Marker({
            position: p.geometry.location,
            map: mapRef.current,
            title: p.name,
            icon: { url: iconUrl, scaledSize: new google.maps.Size(32, 32) }
          });
          markersRef.current.push(marker);
          marker.addListener('click', () => fetchAndShowPlaceDetails(p.place_id!));
        });
      }
    });
  }, [isLoaded, center, fetchAndShowPlaceDetails]);

  // Effect for landmarks
  useEffect(() => {
    if (showLandmarks) {
      searchAndDisplayPlaces('landmark', landmarkMarkersRef, '/landmark-marker.png');
    } else {
      clearMarkers(landmarkMarkersRef);
    }
  }, [showLandmarks, searchAndDisplayPlaces]);
  
  // Effect for restaurants
  useEffect(() => {
    if (showRestaurants) {
      searchAndDisplayPlaces('restaurant', restaurantMarkersRef, '/restaurant-marker.png');
    } else {
      clearMarkers(restaurantMarkersRef);
    }
  }, [showRestaurants, searchAndDisplayPlaces]);


  useEffect(() => {
    if (selectedPlaceId) fetchAndShowPlaceDetails(selectedPlaceId);
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
      <div ref={panelRef} className="fixed inset-0 z-20 opacity-0 pointer-events-none" style={{ transform: "translateY(100%) translateX(100%)" }}>
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