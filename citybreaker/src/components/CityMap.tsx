"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";

interface PlaceDetail {
  name: string;
  address: string;
  website?: string;
  photoUrl?: string;
  description?: string;
}

export default function CityMap() {
  const [placeDetails, setPlaceDetails] = useState<PlaceDetail | null>(null);
  const [itinerary, setItinerary] = useState<PlaceDetail[]>([]);
  const mapRef = useRef<google.maps.Map | null>(null);
  const flightPathRef = useRef<google.maps.Polyline | null>(null);
  const flightMarkerRef = useRef<google.maps.Marker | null>(null);

  const landmarks: Record<string, google.maps.LatLngLiteral> = {
    London: { lat: 51.4995, lng: -0.1245 },
    Paris: { lat: 48.8584, lng: 2.2945 },
    Berlin: { lat: 52.5163, lng: 13.3777 },
    Prague: { lat: 50.087, lng: 14.4208 },
    Beijing: { lat: 39.9163, lng: 116.3972 },
    Seoul: { lat: 37.5796, lng: 126.977 },
    Tokyo: { lat: 35.71, lng: 139.8107 },
    "San Francisco": { lat: 37.7749, lng: -122.4194 },
    "New York": { lat: 40.7829, lng: -73.9654 },
  };

  useEffect(() => {
    const stored = localStorage.getItem("itinerary");
    if (stored) setItinerary(JSON.parse(stored));

    let service: google.maps.places.PlacesService | null = null;
    let mapInstance: google.maps.Map;

    const customStyle = [
      { elementType: "geometry", stylers: [{ color: "#1d2c4d" }] },
      { elementType: "labels.text.fill", stylers: [{ color: "#8ec3b9" }] },
      { elementType: "labels.text.stroke", stylers: [{ color: "#1a3646" }] },
      { featureType: "poi.attraction", elementType: "geometry", stylers: [{ color: "#fff952" }] },
      { featureType: "road", elementType: "geometry", stylers: [{ color: "#579e00" }] },
      { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1626" }] },
    ];

    function initMap() {
      const google = (window as any).google;

      mapInstance = new google.maps.Map(document.getElementById("map") as HTMLElement, {
        center: landmarks.London,
        zoom: 12,
        disableDefaultUI: true,
        styles: customStyle,
        tilt: 45,
        heading: 90,
      });

      mapRef.current = mapInstance;
      service = new google.maps.places.PlacesService(mapInstance);

      mapInstance.addListener("click", (e: google.maps.MapMouseEvent) => {
        if (e.placeId) {
          e.stop();
          if (!service) return;

          service.getDetails(
            {
              placeId: e.placeId,
              fields: [
                "name",
                "formatted_address",
                "website",
                "photos",
                "url",
                "editorial_summary",
              ],
            },
            (result, status) => {
              if (status === google.maps.places.PlacesServiceStatus.OK && result) {
                const place: PlaceDetail = {
                  name: result.name || "Unknown place",
                  address: result.formatted_address || "",
                  website: result.website || result.url || "",
                  photoUrl: result.photos?.[0]?.getUrl({ maxWidth: 400 }),
                  description: result.editorial_summary?.overview,
                };

                setPlaceDetails(place);

                const overlay = document.createElement("div");
                overlay.className = "fixed inset-0 bg-black/50 z-40";

                const popup = document.createElement("div");
                popup.className =
                  "fixed left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50";
                popup.innerHTML = `
                  <div class="bg-black/90 border border-yellow-400 p-4 rounded shadow-lg text-yellow-200 max-w-sm w-[90vw] relative">
                    <button class="absolute top-1 right-2 text-yellow-300 hover:text-yellow-500 text-lg">✕</button>
                    ${place.photoUrl ? `<img src="${place.photoUrl}" alt="${place.name}" class="mb-2 rounded" />` : ""}
                    <h3 class="text-lg font-bold mb-1">${place.name}</h3>
                    <p class="text-sm mb-1">${place.address}</p>
                    ${
                      place.description
                        ? `<p class="text-xs italic mb-2">${place.description}</p>`
                        : "<p class='text-xs italic mb-2 text-gray-400'>(no description available)</p>"
                    }
                    ${
                      place.website
                        ? `<a href="${place.website}" target="_blank" class="underline text-blue-300">Visit Official Site</a>`
                        : ""
                    }
                    <button class="mt-3 w-full bg-yellow-400 text-black py-1 px-2 rounded hover:bg-yellow-300 transition">Add to Itinerary</button>
                  </div>
                `;

                const wrapper = document.createElement("div");
                wrapper.appendChild(overlay);
                wrapper.appendChild(popup);
                document.body.appendChild(wrapper);

                gsap.fromTo(
                  popup,
                  { scale: 0.9, opacity: 0 },
                  { scale: 1, opacity: 1, duration: 0.6, ease: "back.out(1.7)" }
                );

                const closePopup = () => {
                  gsap.to(popup, {
                    scale: 0.9,
                    opacity: 0,
                    duration: 0.3,
                    onComplete: () => document.body.removeChild(wrapper),
                  });
                };

                popup.querySelector("button")?.addEventListener("click", () => {
                  setItinerary((prev) => {
                    const updated = [...prev, place];
                    localStorage.setItem("itinerary", JSON.stringify(updated));
                    return updated;
                  });
                  closePopup();
                });

                overlay.addEventListener("click", closePopup);
              }
            }
          );
        }
      });
    }

    function animateMarkerAlongPath(path: google.maps.LatLng[], onDone: () => void) {
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

    const existingScript = document.getElementById("google-maps-script");
    if (!existingScript) {
      const script = document.createElement("script");
      script.id = "google-maps-script";
      script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`;
      script.async = true;
      script.defer = true;
      script.onload = () => initMap();
      document.head.appendChild(script);
    } else {
      if ((window as any).google) {
        initMap();
      } else {
        existingScript.addEventListener("load", initMap);
      }
    }
  }, []);

  return <div id="map" className="absolute inset-0 z-0" />;
}
