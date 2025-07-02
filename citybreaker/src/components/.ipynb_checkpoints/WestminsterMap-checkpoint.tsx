"use client";

import { useEffect, useState } from "react";
import LocationMenuPopup from "@/components/LocationMenuPopup";

interface PlaceDetail {
  name: string;
  address: string;
  website?: string;
  photoUrl?: string;
}

export default function WestminsterMap() {
  const [menuType, setMenuType] = useState<"landmark" | "restaurant" | null>(null);
  const [placeDetails, setPlaceDetails] = useState<PlaceDetail | null>(null);

  useEffect(() => {
    let service: google.maps.places.PlacesService | null = null;

    const existingScript = document.getElementById("google-maps-script");

    if (!existingScript) {
      const script = document.createElement("script");
      script.id = "google-maps-script";
      script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`;
      script.async = true;
      script.defer = true;

      script.onload = () => {
        console.log("✅ Google Maps JS API loaded");
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

    function initMap() {
      const google = (window as any).google;

      const customStyle = [
        { elementType: "geometry", stylers: [{ color: "#1d2c4d" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#8ec3b9" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#1a3646" }] },
        {
          featureType: "administrative.country",
          elementType: "geometry.stroke",
          stylers: [{ color: "#4b6878" }],
        },
        {
          featureType: "administrative.land_parcel",
          elementType: "labels.text.fill",
          stylers: [{ color: "#64779e" }],
        },
        {
          featureType: "administrative.province",
          elementType: "geometry.stroke",
          stylers: [{ color: "#4b6878" }],
        },
        {
          featureType: "landscape.man_made",
          elementType: "geometry.stroke",
          stylers: [{ color: "#334e87" }],
        },
        {
          featureType: "landscape.natural",
          elementType: "geometry",
          stylers: [{ color: "#023e58" }],
        },
        {
          featureType: "poi",
          elementType: "geometry",
          stylers: [{ color: "#283d6a" }],
        },
        {
          featureType: "poi",
          elementType: "labels.text.fill",
          stylers: [{ color: "#6f9ba5" }],
        },
        {
          featureType: "poi",
          elementType: "labels.text.stroke",
          stylers: [{ color: "#1d2c4d" }],
        },
        {
          featureType: "poi.attraction",
          elementType: "geometry",
          stylers: [{ color: "#fff952" }],
        },
        {
          featureType: "poi.park",
          elementType: "geometry.fill",
          stylers: [{ color: "#023e58" }],
        },
        {
          featureType: "poi.park",
          elementType: "labels.text.fill",
          stylers: [{ color: "#3C7680" }],
        },
        {
          featureType: "road",
          elementType: "geometry",
          stylers: [{ color: "#579e00" }],
        },
        {
          featureType: "road",
          elementType: "labels.text.fill",
          stylers: [{ color: "#98a5be" }],
        },
        {
          featureType: "road",
          elementType: "labels.text.stroke",
          stylers: [{ color: "#1d2c4d" }],
        },
        {
          featureType: "road.highway",
          elementType: "geometry",
          stylers: [{ color: "#2c6675" }],
        },
        {
          featureType: "road.highway",
          elementType: "geometry.stroke",
          stylers: [{ color: "#255763" }],
        },
        {
          featureType: "road.highway",
          elementType: "labels.text.fill",
          stylers: [{ color: "#b0d5ce" }],
        },
        {
          featureType: "road.highway",
          elementType: "labels.text.stroke",
          stylers: [{ color: "#023e58" }],
        },
        {
          featureType: "transit",
          elementType: "labels.text.fill",
          stylers: [{ color: "#98a5be" }],
        },
        {
          featureType: "transit",
          elementType: "labels.text.stroke",
          stylers: [{ color: "#1d2c4d" }],
        },
        {
          featureType: "transit.line",
          elementType: "geometry.fill",
          stylers: [{ color: "#283d6a" }],
        },
        {
          featureType: "transit.station",
          elementType: "geometry",
          stylers: [{ color: "#3a4762" }],
        },
        {
          featureType: "water",
          elementType: "geometry",
          stylers: [{ color: "#0e1626" }],
        },
        {
          featureType: "water",
          elementType: "labels.text.fill",
          stylers: [{ color: "#4e6d70" }],
        },
      ];

      const map = new google.maps.Map(
        document.getElementById("map") as HTMLElement,
        {
          center: { lat: 51.4995, lng: -0.1245 },
          zoom: 16,
          minZoom: 15,
          maxZoom: 18,
          heading: 0,
          tilt: 0,
          styles: customStyle,
          disableDefaultUI: true,
          mapTypeId: "roadmap",
        }
      );

      service = new google.maps.places.PlacesService(map);

      map.addListener("click", (e: google.maps.MapMouseEvent) => {
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
                setPlaceDetails({
                  name: result.name || "Unknown place",
                  address: result.formatted_address || "",
                  website: result.website || result.url || "",
                  photoUrl:
                    result.photos && result.photos.length > 0
                      ? result.photos[0].getUrl({ maxWidth: 400 })
                      : undefined,
                });
                setMenuType("landmark");
              }
            }
          );
        }
      });

      // satellite toggle
      window.addEventListener("toggle-satellite", () => {
        const currentType = map.getMapTypeId();
        if (currentType === "satellite") {
          map.setMapTypeId("roadmap");
          map.setOptions({ styles: customStyle });
        } else {
          map.setMapTypeId("satellite");
          map.setOptions({ styles: null });
        }
      });

      console.log("✅ WestminsterMap initialized with styles and Places API");
    }

    // FAB event listeners
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
      <div id="map" className="absolute inset-0" />
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
            : ["Placeholder 1", "Placeholder 2", "Placeholder 3"]
        }
      />
    </>
  );
}
