"use client";

import { useEffect, useState, useRef } from "react";
import LocationMenuPopup from "@/components/LocationMenuPopup";

interface PlaceDetail {
  name: string;
  address: string;
  website?: string;
  photoUrl?: string;
}

export default function CityMap() {
  const [menuType, setMenuType] = useState<"landmark" | "restaurant" | null>(null);
  const [placeDetails, setPlaceDetails] = useState<PlaceDetail | null>(null);
  const [itinerary, setItinerary] = useState<PlaceDetail[]>([]);
  const mapRef = useRef<google.maps.Map | null>(null);
  const flightPathRef = useRef<google.maps.Polyline | null>(null);
  const flightMarkerRef = useRef<google.maps.Marker | null>(null);

  const airports: Record<string, google.maps.LatLngLiteral> = {
    London: { lat: 51.4700, lng: -0.4543 },
    Paris: { lat: 49.0097, lng: 2.5479 },
    Berlin: { lat: 52.3667, lng: 13.5033 },
    Prague: { lat: 50.1008, lng: 14.26 },
    Beijing: { lat: 40.0801, lng: 116.5846 },
    Seoul: { lat: 37.4602, lng: 126.4407 },
    Tokyo: { lat: 35.5494, lng: 139.7798 },
    "San Francisco": { lat: 37.6213, lng: -122.3790 },
    "New York": { lat: 40.6413, lng: -73.7781 },
  };

  useEffect(() => {
    const stored = localStorage.getItem("itinerary");
    if (stored) setItinerary(JSON.parse(stored));

    let service: google.maps.places.PlacesService | null = null;
    let mapInstance: google.maps.Map;

    const existingScript = document.getElementById("google-maps-script");

    function initMap() {
      const google = (window as any).google;

      const customStyle = [
        { elementType: "geometry", stylers: [{ color: "#1d2c4d" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#8ec3b9" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#1a3646" }] },
        { featureType: "poi.attraction", elementType: "geometry", stylers: [{ color: "#fff952" }] },
        { featureType: "road", elementType: "geometry", stylers: [{ color: "#579e00" }] },
        { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1626" }] },
      ];

      mapInstance = new google.maps.Map(document.getElementById("map") as HTMLElement, {
        center: airports.London,
        zoom: 12,
        styles: customStyle,
        disableDefaultUI: true,
      });

      mapRef.current = mapInstance;
      service = new google.maps.places.PlacesService(mapInstance);

      window.addEventListener("citySelect", (e) => {
        const detail = (e as CustomEvent).detail;
        if (detail && detail.name && airports[detail.name]) {
          const nextAirport = new google.maps.LatLng(
            airports[detail.name].lat,
            airports[detail.name].lng
          );

          const currentPos = mapInstance.getCenter()!;

          // clear old flight path
          if (flightPathRef.current) {
            flightPathRef.current.setMap(null);
          }

          flightPathRef.current = new google.maps.Polyline({
            path: [currentPos, nextAirport],
            geodesic: true,
            strokeColor: "#ffcc00",
            strokeOpacity: 1.0,
            strokeWeight: 2,
          });
          flightPathRef.current.setMap(mapInstance);

          // airplane marker
          if (!flightMarkerRef.current) {
            flightMarkerRef.current = new google.maps.Marker({
              map: mapInstance,
              position: currentPos,
              icon: "✈️",
            });
          } else {
            flightMarkerRef.current.setPosition(currentPos);
          }

          animateMarkerAlongPath(
            flightPathRef.current.getPath().getArray(),
            () => {
              flightPathRef.current?.setMap(null);
              flightMarkerRef.current?.setMap(null);
            }
          );

          // pan
          mapInstance.panTo(nextAirport);
          mapInstance.setZoom(detail.zoom || 12);
        }
      });

      mapInstance.addListener("click", (e: google.maps.MapMouseEvent) => {
        if (e.placeId) {
          e.stop();
          if (!service) return;
          service.getDetails(
            {
              placeId: e.placeId,
              fields: ["name", "formatted_address", "website", "photos", "url"],
            },
            (result, status) => {
              if (status === google.maps.places.PlacesServiceStatus.OK && result) {
                const place: PlaceDetail = {
                  name: result.name || "Unknown place",
                  address: result.formatted_address || "",
                  website: result.website || result.url || "",
                  photoUrl:
                    result.photos && result.photos.length > 0
                      ? result.photos[0].getUrl({ maxWidth: 400 })
                      : undefined,
                };
                setPlaceDetails(place);
                setMenuType("landmark");
                setItinerary((prev) => {
                  const updated = [...prev, place];
                  localStorage.setItem("itinerary", JSON.stringify(updated));
                  return updated;
                });
              }
            }
          );
        }
      });

      window.addEventListener("toggle-satellite", () => {
        const currentType = mapInstance.getMapTypeId();
        if (currentType === "satellite") {
          mapInstance.setMapTypeId("roadmap");
          mapInstance.setOptions({ styles: customStyle });
        } else {
          mapInstance.setMapTypeId("satellite");
          mapInstance.setOptions({ styles: null });
        }
      });
    }

    function animateMarkerAlongPath(
      path: google.maps.LatLng[],
      onDone: () => void
    ) {
      if (!flightMarkerRef.current) return;
      let step = 0;
      const steps = 100;
      const interval = setInterval(() => {
        step++;
        if (step >= steps) {
          clearInterval(interval);
          onDone();
          return;
        }
        const lat = path[0].lat() + (path[1].lat() - path[0].lat()) * (step / steps);
        const lng = path[0].lng() + (path[1].lng() - path[0].lng()) * (step / steps);
        flightMarkerRef.current!.setPosition(new google.maps.LatLng(lat, lng));
      }, 50);
    }

    if (!existingScript) {
      const script = document.createElement("script");
      script.id = "google-maps-script";
      script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`;
      script.async = true;
      script.defer = true;
      script.onload = () => {
        initMap();
      };
      document.head.appendChild(script);
    } else {
      if ((window as any).google) {
        initMap();
      } else {
        existingScript.addEventListener("load", initMap);
      }
    }

    const handleLandmarks = () => {
      setPlaceDetails(null);
      setMenuType("landmark");
    };
    const handleRestaurants = () => {
      setPlaceDetails(null);
      setMenuType("restaurant");
    };

    window.addEventListener("show-landmarks-menu", handleLandmarks);
    window.addEventListener("show-restaurants-menu", handleRestaurants);

    return () => {
      window.removeEventListener("show-landmarks-menu", handleLandmarks);
      window.removeEventListener("show-restaurants-menu", handleRestaurants);
    };
  }, []);

  return (
    <>
      <div id="map" className="absolute inset-0 z-0" />
      <LocationMenuPopup
        isOpen={!!menuType}
        onClose={() => setMenuType(null)}
        type={menuType || "landmark"}
        items={
          placeDetails
            ? [
                `**${placeDetails.name}**`,
                placeDetails.address,
                placeDetails.website
                  ? `[Visit Website](${placeDetails.website})`
                  : "",
              ].filter(Boolean)
            : ["Choose a location", "Nothing yet"]
        }
      />
    </>
  );
}
