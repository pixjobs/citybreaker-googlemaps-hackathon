"use client";

import { useEffect, useRef, useState } from "react";
import { Loader } from "@googlemaps/js-api-loader";
import ItineraryPanel from "./ItineraryPanel";
import { FaMapMarkedAlt, FaTimes } from "react-icons/fa";
import gsap from "gsap";

interface CityMapProps {
  center: {
    lat: number;
    lng: number;
    zoom: number;
    name: string;
  };
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

export default function CityMap({ center, tripLength = 3 }: CityMapProps) {
  const mapRef = useRef<google.maps.Map | null>(null);
  const panelContainerRef = useRef<HTMLDivElement>(null);
  const polylineRef = useRef<google.maps.Polyline | null>(null);

  const [itinerary, setItinerary] = useState<string | null>(null);
  const [placePhotos, setPlacePhotos] = useState<PlacePhotoInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const cityKey = `${center.lat}-${center.lng}-${tripLength}`;

  useAnimatedPanel(panelContainerRef, isPanelOpen);

  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.panTo(center);
      mapRef.current.setZoom(center.zoom);
    }
  }, [center]);

  useEffect(() => {
    const initAndFetch = async () => {
      setIsLoading(true);
      setItinerary(null);
      setPlacePhotos([]);

      const loader = new Loader({
        apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
        version: "weekly",
      });

      const [{ Map }, { PlacesService }, { LatLng }] = await Promise.all([
        loader.importLibrary("maps"),
        loader.importLibrary("places"),
        loader.importLibrary("core"),
      ]);

      if (!mapRef.current && document.getElementById("map")) {
        mapRef.current = new Map(document.getElementById("map") as HTMLElement, {
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
      }

      const service = new google.maps.places.PlacesService(
        document.createElement("div")
      );

      service.nearbySearch(
        {
          location: new LatLng(center.lat, center.lng),
          radius: 20000,
          type: "tourist_attraction",
        },
        async (results, status) => {
          if (status !== google.maps.places.PlacesServiceStatus.OK || !results) {
            console.error("PlacesService failed");
            setIsLoading(false);
            return;
          }

          // Remove old markers & polyline
          if (mapRef.current) {
            mapRef.current.getMarkers?.()?.forEach(m => m.setMap(null));
            polylineRef.current?.setMap(null);
          }

          const photoInfo: PlacePhotoInfo[] = [];
          const pathCoords: google.maps.LatLngLiteral[] = [];

          results.forEach(p => {
            if (!p.geometry?.location) return;
            const loc = p.geometry.location;
            // Collect path coords in sequence
            pathCoords.push({ lat: loc.lat(), lng: loc.lng() });

            const marker = new google.maps.Marker({
              position: loc,
              map: mapRef.current!,
              title: p.name,
            });

            const photoUrl = p.photos?.[0]?.getUrl();
            photoInfo.push({ name: p.name, photoUrl });

            const content = `
  <div style="background: rgba(0,0,0,0.9); color: #F1C40F; padding: 12px; border-radius: 8px; max-width: 220px; font-family: sans-serif; line-height: 1.4;">
    ${photoUrl ? `<img src=\"${photoUrl}\" style=\"width:100%; height:auto; border-radius:4px; margin-bottom:8px;\" />` : ''}
    <h3 style="margin:0 0 4px; font-size:1.1rem; color:#ffffff;">${p.name}</h3>
    <p style="margin:0 0 6px; font-size:0.9rem; color:#BDC3C7;">${p.vicinity || ''}</p>
    <p style="margin:0 0 8px; font-size:0.85rem; color:#ECECEC;">${p.types?.join(', ') || 'Attraction'}</p>
    <a href=\"https://www.google.com/maps/place/?q=place_id:${p.place_id}\" target=\"_blank\" style=\"display:inline-block; color:#7DF9FF; font-size:0.9rem; text-decoration:underline; margin-top:4px;\">View on Google Maps</a>
  </div>`;

            const infoWindow = new google.maps.InfoWindow({ content });
            marker.addListener('click', () => infoWindow.open({ map: mapRef.current, anchor: marker }));
          });

          setPlacePhotos(photoInfo);

          // Draw itinerary path
          polylineRef.current = new google.maps.Polyline({
            path: pathCoords,
            geodesic: true,
            strokeColor: '#00ff90',
            strokeOpacity: 0.8,
            strokeWeight: 4,
            map: mapRef.current!,
          });

          try {
            const res = await fetch("/api/gemini-recommendations", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ places: photoInfo, tripLength }),
            });

            if (!res.ok) throw new Error(`API Error: ${res.statusText}`);

            const data = await res.json();
            setItinerary(data.itinerary);
            setIsPanelOpen(true);
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
  }, [cityKey]);

  return (
    <>
      <div id="map" className="absolute inset-0 z-0" />

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
