"use client";

import { useEffect } from "react";

export default function WestminsterMap() {
  useEffect(() => {
    const existingScript = document.getElementById("google-maps-script");

    if (!existingScript) {
      const script = document.createElement("script");
      script.id = "google-maps-script";
      script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=maps,geometry`;
      script.async = true;
      script.defer = true;

      script.onload = () => {
        console.log("✅ Google Maps JS API loaded");
        initMap();
      };

      document.head.appendChild(script);
    } else {
      if ((window as any).google) {
        console.log("✅ Google Maps already loaded");
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
          stylers: [{ color: "#4b6878" }]
        },
        {
          featureType: "administrative.land_parcel",
          elementType: "labels.text.fill",
          stylers: [{ color: "#64779e" }]
        },
        {
          featureType: "administrative.province",
          elementType: "geometry.stroke",
          stylers: [{ color: "#4b6878" }]
        },
        {
          featureType: "landscape.man_made",
          elementType: "geometry.stroke",
          stylers: [{ color: "#334e87" }]
        },
        {
          featureType: "landscape.natural",
          elementType: "geometry",
          stylers: [{ color: "#023e58" }]
        },
        {
          featureType: "poi",
          elementType: "geometry",
          stylers: [{ color: "#283d6a" }]
        },
        {
          featureType: "poi",
          elementType: "labels.text.fill",
          stylers: [{ color: "#6f9ba5" }]
        },
        {
          featureType: "poi",
          elementType: "labels.text.stroke",
          stylers: [{ color: "#1d2c4d" }]
        },
        {
          featureType: "poi.attraction",
          elementType: "geometry",
          stylers: [{ color: "#fff952" }]
        },
        {
          featureType: "poi.park",
          elementType: "geometry.fill",
          stylers: [{ color: "#023e58" }]
        },
        {
          featureType: "poi.park",
          elementType: "labels.text.fill",
          stylers: [{ color: "#3C7680" }]
        },
        {
          featureType: "road",
          elementType: "geometry",
          stylers: [{ color: "#579e00" }]
        },
        {
          featureType: "road",
          elementType: "labels.text.fill",
          stylers: [{ color: "#98a5be" }]
        },
        {
          featureType: "road",
          elementType: "labels.text.stroke",
          stylers: [{ color: "#1d2c4d" }]
        },
        {
          featureType: "road.highway",
          elementType: "geometry",
          stylers: [{ color: "#2c6675" }]
        },
        {
          featureType: "road.highway",
          elementType: "geometry.stroke",
          stylers: [{ color: "#255763" }]
        },
        {
          featureType: "road.highway",
          elementType: "labels.text.fill",
          stylers: [{ color: "#b0d5ce" }]
        },
        {
          featureType: "road.highway",
          elementType: "labels.text.stroke",
          stylers: [{ color: "#023e58" }]
        },
        {
          featureType: "transit",
          elementType: "labels.text.fill",
          stylers: [{ color: "#98a5be" }]
        },
        {
          featureType: "transit",
          elementType: "labels.text.stroke",
          stylers: [{ color: "#1d2c4d" }]
        },
        {
          featureType: "transit.line",
          elementType: "geometry.fill",
          stylers: [{ color: "#283d6a" }]
        },
        {
          featureType: "transit.station",
          elementType: "geometry",
          stylers: [{ color: "#3a4762" }]
        },
        {
          featureType: "water",
          elementType: "geometry",
          stylers: [{ color: "#0e1626" }]
        },
        {
          featureType: "water",
          elementType: "labels.text.fill",
          stylers: [{ color: "#4e6d70" }]
        }
      ];

      // create the map
      const map = new google.maps.Map(
        document.getElementById("map") as HTMLElement,
        {
          center: { lat: 51.4995, lng: -0.1245 },
          zoom: 16,
          minZoom: 15,
          maxZoom: 17,
          heading: 0,
          tilt: 0,
          styles: customStyle,
          mapTypeId: "roadmap",
          disableDefaultUI: true
        }
      );

      // listen for the FAB menu's event
      window.addEventListener("toggle-satellite", () => {
        const currentType = map.getMapTypeId();
        if (currentType === "satellite") {
          map.setMapTypeId("roadmap");
          map.setOptions({ styles: customStyle });
          console.log("✅ switched to roadmap with style");
        } else {
          map.setMapTypeId("satellite");
          map.setOptions({ styles: null });
          console.log("✅ switched to satellite");
        }
      });

      console.log("✅ Google Maps with FAB event listener ready", map);
    }
  }, []);

  return <div id="map" className="absolute inset-0" />;
}
