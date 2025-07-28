"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import gsap from "gsap";
import ItineraryPanel from "./ItineraryPanel";
import LocationMenuPopup, {
  RichPlaceDetails,
  YouTubeVideo,
} from "./LocationMenuPopup";
import { useMaps } from "./providers/MapsProvider";

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

interface PlaceEditorialSummary {
  language?: string;
  overview?: string;
}

interface PlaceResultWithSummary extends google.maps.places.PlaceResult {
  editorial_summary?: PlaceEditorialSummary;
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

function useAnimatedPanel(
  panelRef: React.RefObject<HTMLDivElement | null>,
  isOpen: boolean,
) {
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
      onStart: () => {
        if (panelRef.current) {
          panelRef.current.style.pointerEvents = isOpen ? "auto" : "none";
        }
      },
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
  const attractionMarkersRef = useRef<google.maps.Marker[]>([]);
  const highlightMarkerRef = useRef<google.maps.Marker | null>(null);

  const [placePhotos, setPlacePhotos] = useState<PlacePhotoInfo[]>([]);
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [isDetailsLoading, setIsDetailsLoading] = useState(false);
  const [isVideosLoading, setIsVideosLoading] = useState(false);
  const [selectedPlaceBasic, setSelectedPlaceBasic] = useState<BasicPlaceInfo>();
  const [selectedPlaceDetails, setSelectedPlaceDetails] = useState<RichPlaceDetails>();
  const [youtubeVideos, setYoutubeVideos] = useState<YouTubeVideo[]>([]);
  const [activeTab, setActiveTab] = useState<"info" | "reviews" | "videos">("info");

  const shouldOpenItinerary = isItineraryOpen && placePhotos.length > 0;
  useAnimatedPanel(panelRef, shouldOpenItinerary);

  const clearMarkers = useCallback(
    (markers: React.MutableRefObject<google.maps.Marker[]>) => {
      markers.current.forEach((m) => m.setMap(null));
      markers.current = [];
    },
    [],
  );

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
      service.getDetails(
        {
          placeId,
          fields: [
            "name",
            "geometry",
            "photos",
            "formatted_address",
            "website",
            "rating",
            "reviews",
            "editorial_summary",
          ],
        },
        async (place, status) => {
          if (
            status !== window.google.maps.places.PlacesServiceStatus.OK ||
            !place
          ) {
            setIsPopupOpen(false);
            setIsDetailsLoading(false);
            setIsVideosLoading(false);
            return;
          }

          if (place.geometry?.location) {
            mapRef.current?.panTo(place.geometry.location);
          }

          const validReviews = place.reviews?.filter(
            (r): r is google.maps.places.PlaceReview & { rating: number } =>
              typeof r.rating === "number",
          );

          setSelectedPlaceBasic({
            name: place.name || "Unnamed Place",
            address: place.formatted_address || "No address available",
            photoUrl: place.photos?.[0]?.getUrl({
              maxWidth: 1920,
              maxHeight: 1080,
            }),
          });

          setSelectedPlaceDetails({
            website: place.website,
            rating: place.rating,
            reviews: validReviews,
            editorial_summary: (place as PlaceResultWithSummary)
              .editorial_summary,
          });

          try {
            const res = await fetch("/api/youtube-search", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ query: place.name }),
            });
            const data = await res.json();
            setYoutubeVideos(data.videos || []);
          } catch {
            console.error("YouTube fetch failed");
          } finally {
            setIsVideosLoading(false);
            setIsDetailsLoading(false);
          }
        },
      );
    },
    [isLoaded],
  );

  const handleZoomToLocation = useCallback(
    (location: { lat: number; lng: number }) => {
      if (!mapRef.current) return;
      mapRef.current.panTo(location);
      mapRef.current.setZoom(16);
      onCloseItinerary();
    },
    [onCloseItinerary],
  );

  useEffect(() => {
    if (!isLoaded) return;

    if (!mapRef.current) {
      const map = new window.google.maps.Map(
        document.getElementById("map") as HTMLElement,
        {
          center: { lat: center.lat, lng: center.lng },
          zoom: center.zoom,
          disableDefaultUI: true,
          styles: retroDarkStyle,
        },
      );
      mapRef.current = map;
      onMapLoad?.(map);
      map.addListener("idle", () => onMapIdle?.());
      map.addListener("click", (e: google.maps.IconMouseEvent) => {
        if (e.placeId) {
          e.stop();
          fetchAndShowPlaceDetails(e.placeId);
        }
      });
    } else {
      mapRef.current.panTo({ lat: center.lat, lng: center.lng });
      mapRef.current.setZoom(center.zoom);
    }
  }, [
    isLoaded,
    center.lat,
    center.lng,
    center.zoom,
    onMapLoad,
    onMapIdle,
    fetchAndShowPlaceDetails,
  ]);

  useEffect(() => {
    if (!isLoaded || !mapRef.current) return;

    setPlacePhotos([]);
    clearMarkers(attractionMarkersRef);

    const service = new window.google.maps.places.PlacesService(mapRef.current);
    const request = {
      location: new window.google.maps.LatLng(center.lat, center.lng),
      radius: 20000,
      type: "tourist_attraction",
    };

    service.nearbySearch(request, (results, status) => {
      if (
        status === window.google.maps.places.PlacesServiceStatus.OK &&
        results
      ) {
        const photos = results.map((p) => ({
          name: p.name || "",
          photoUrl: p.photos?.[0]?.getUrl({ maxWidth: 1920, maxHeight: 1080 }),
        }));
        setPlacePhotos(photos.filter((p) => p.name));
        onPlacesLoaded?.(photos.map((p) => p.photoUrl!).filter(Boolean));
        results.forEach((p) => {
          if (!p.geometry?.location || !p.name || !p.place_id) return;
          const marker = new window.google.maps.Marker({
            position: p.geometry.location,
            map: mapRef.current!,
            title: p.name,
            icon: {
              url: "/marker.png",
              scaledSize: new google.maps.Size(40, 40),
            },
          });
          attractionMarkersRef.current.push(marker);
          marker.addListener("click", () =>
            fetchAndShowPlaceDetails(p.place_id!),
          );
        });
      }
    });
  }, [
    isLoaded,
    center.name,
    onPlacesLoaded,
    clearMarkers,
    fetchAndShowPlaceDetails,
    center.lat,
    center.lng,
  ]);

  useEffect(() => {
    if (!mapRef.current) return;
    const isSat = mapRef.current.getMapTypeId() === "satellite";
    if (isSatelliteView && !isSat) {
      mapRef.current.setMapTypeId("satellite");
    } else if (!isSatelliteView && isSat) {
      mapRef.current.setMapTypeId("roadmap");
      mapRef.current.setOptions({ styles: retroDarkStyle });
    }
  }, [isSatelliteView]);

  useEffect(() => {
    if (!mapRef.current || !isLoaded) return;

    if (highlightMarkerRef.current) {
      highlightMarkerRef.current.setMap(null);
      highlightMarkerRef.current = null;
    }

    if (highlightedLocation) {
      const service = new window.google.maps.places.PlacesService(mapRef.current);
      const request = { location: highlightedLocation, radius: 50 };

      service.nearbySearch(request, (results, status) => {
        if (
          status === window.google.maps.places.PlacesServiceStatus.OK &&
          results &&
          results[0]
        ) {
          const topResult = results[0];
          const marker = new window.google.maps.Marker({
            position: highlightedLocation,
            map: mapRef.current,
            icon: {
              url: "/highlight-marker.png",
              scaledSize: new google.maps.Size(60, 60),
              anchor: new google.maps.Point(30, 60),
            },
            animation: window.google.maps.Animation.DROP,
            zIndex: 999,
          });

          if (topResult.place_id) {
            marker.addListener("click", () =>
              fetchAndShowPlaceDetails(topResult.place_id!),
            );
          }

          highlightMarkerRef.current = marker;
        }
      });
    }
  }, [highlightedLocation, isLoaded, fetchAndShowPlaceDetails]);

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
        ref={panelRef}
        className="fixed inset-0 z-20 opacity-0 pointer-events-none"
        style={{ transform: "translateY(100%)" }}
      >
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
