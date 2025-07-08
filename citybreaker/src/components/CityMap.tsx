// components/CityMap.tsx
"use client"; // This directive is crucial for client-side components

import { useEffect, useRef, useState, useCallback } from "react";
import gsap from "gsap";
import { FaMapMarkerAlt, FaRegClock, FaGlobe, FaInfoCircle, FaUtensils, FaCocktail, FaTimes, FaSpinner, FaPlus } from 'react-icons/fa';

// Define the structure for a place detail
interface PlaceDetail {
  placeId: string; // Added placeId for unique identification and potential future use
  name: string;
  address: string;
  website?: string;
  photoUrl?: string;
  description?: string; // This will come from editorial_summary
  types?: string[]; // Added for nearby search filtering
  rating?: number; // Added for nearby search
  user_ratings_total?: number; // Added for nearby search
  url?: string; // The Google Maps URL
}

// Custom hook for Google Maps script loading
function useGoogleMapsScript(apiKey: string, libraries: string[], onLoad: () => void) {
  useEffect(() => {
    const existingScript = document.getElementById("google-maps-script");

    if (!existingScript) {
      const script = document.createElement("script");
      script.id = "google-maps-script";
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=${libraries.join(',')}`;
      script.async = true;
      script.defer = true;
      script.onload = onLoad;
      document.head.appendChild(script);
    } else if ((window as any).google) {
      // If script already loaded and google object is available
      onLoad();
    } else {
      // If script loading but google object not yet available
      existingScript.addEventListener("load", onLoad);
    }

    return () => {
      // Cleanup listener if component unmounts before script loads
      if (existingScript) {
        existingScript.removeEventListener("load", onLoad);
      }
    };
  }, [apiKey, libraries, onLoad]);
}


// --- React Components for UI ---
// These are nested client components, so they don't need 'use client' if imported
// by another client component (CityMap.tsx in this case).

// Popup for place details (now a proper React component)
function PlaceDetailsPopup({ place, onClose, onAddToItinerary }: { place: PlaceDetail; onClose: () => void; onAddToItinerary: (place: PlaceDetail) => void; }) {
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (popupRef.current) {
      gsap.fromTo(
        popupRef.current,
        { scale: 0.9, opacity: 0, y: "-50%", x: "-50%" },
        { scale: 1, opacity: 1, duration: 0.6, ease: "back.out(1.7)" }
      );
    }
  }, [place]);

  const handleAddToItinerary = () => {
    onAddToItinerary(place);
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div
        ref={popupRef}
        className="fixed left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 p-4 rounded shadow-lg text-yellow-200 max-w-sm w-[90vw] transition-all duration-300"
      >
        <div className="bg-black/90 border border-yellow-400 p-4 rounded relative">
          <button
            className="absolute top-2 right-2 text-yellow-300 hover:text-yellow-500 text-lg"
            onClick={onClose}
            aria-label="Close"
          >
            <FaTimes />
          </button>
          {place.photoUrl && (
            <img src={place.photoUrl} alt={place.name} className="mb-3 rounded w-full h-40 object-cover" />
          )}
          <h3 className="text-xl font-bold mb-1 flex items-center"><FaMapMarkerAlt className="mr-2 text-yellow-400" /> {place.name}</h3>
          <p className="text-sm text-gray-300 mb-2">{place.address}</p>
          {place.description ? (
            <div className="mb-3 text-sm italic border-l-2 border-yellow-500 pl-2">
              <p className="font-semibold text-yellow-300 mb-1">Description:</p>
              <p>{place.description}</p>
            </div>
          ) : (
            <p className="text-xs italic mb-2 text-gray-400">(No detailed description available from Google Maps.)</p>
          )}
          {place.website && (
            <a href={place.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-blue-300 hover:text-blue-400 underline text-sm mb-3">
              <FaGlobe className="mr-1" /> Visit Official Site
            </a>
          )}
          <button
            className="mt-3 w-full bg-yellow-400 text-black py-2 px-3 rounded hover:bg-yellow-300 transition flex items-center justify-center"
            onClick={handleAddToItinerary}
          >
            <FaPlus className="mr-2" /> Add to Itinerary
          </button>
        </div>
      </div>
    </>
  );
}

// Itinerary Sidebar
function ItinerarySidebar({ itinerary, onRemovePlace }: { itinerary: PlaceDetail[]; onRemovePlace: (placeId: string) => void; }) {
  return (
    <div className="absolute top-0 right-0 h-full w-80 bg-black/80 text-yellow-100 p-4 shadow-lg z-30 overflow-y-auto">
      <h2 className="text-2xl font-bold mb-4 text-yellow-400">Your Itinerary</h2>
      {itinerary.length === 0 ? (
        <p className="text-gray-400 italic">No places added yet. Click on the map to add!</p>
      ) : (
        <ul>
          {itinerary.map((place) => (
            <li key={place.placeId} className="mb-3 border-b border-yellow-600 pb-2">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-lg">{place.name}</h3>
                  <p className="text-sm text-gray-300">{place.address}</p>
                </div>
                <button
                  className="text-red-400 hover:text-red-500 text-xl"
                  onClick={() => onRemovePlace(place.placeId)}
                  aria-label={`Remove ${place.name}`}
                >
                  <FaTimes />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Main CityMap Component
export default function CityMap() {
  const [placeDetails, setPlaceDetails] = useState<PlaceDetail | null>(null);
  const [showPlaceDetailsPopup, setShowPlaceDetailsPopup] = useState(false);
  const [itinerary, setItinerary] = useState<PlaceDetail[]>([]);
  const [activeTab, setActiveTab] = useState<'details' | 'nearby'>('details');
  const [nearbyPlaces, setNearbyPlaces] = useState<PlaceDetail[]>([]);
  const [loadingNearby, setLoadingNearby] = useState(false);
  const [geminiRecommendations, setGeminiRecommendations] = useState<string | null>(null);
  const [loadingGemini, setLoadingGemini] = useState(false);

  const mapRef = useRef<google.maps.Map | null>(null);
  const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null);
  const currentMapCenter = useRef<google.maps.LatLngLiteral | null>(null); // To store current center for nearby search

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

  // Function to initialize the Google Map
  const initMap = useCallback(() => {
    const google = (window as any).google;
    if (!google) return; // Ensure google object is loaded

    const mapInstance = new google.maps.Map(document.getElementById("map") as HTMLElement, {
      center: landmarks.London,
      zoom: 12,
      disableDefaultUI: true,
      styles: [
        { elementType: "geometry", stylers: [{ color: "#1d2c4d" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#8ec3b9" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#1a3646" }] },
        { featureType: "poi.attraction", elementType: "geometry", stylers: [{ color: "#fff952" }] },
        { featureType: "road", elementType: "geometry", stylers: [{ color: "#579e00" }] },
        { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1626" }] },
      ],
      tilt: 45,
      heading: 90,
    });

    mapRef.current = mapInstance;
    placesServiceRef.current = new google.maps.places.PlacesService(mapInstance);
    currentMapCenter.current = mapInstance.getCenter().toJSON();

    // Update current map center when map stops moving
    mapInstance.addListener("idle", () => {
      currentMapCenter.current = mapInstance.getCenter().toJSON();
    });

    // Handle clicks on places on the map
    mapInstance.addListener("click", (e: google.maps.MapMouseEvent) => {
      if (e.placeId && placesServiceRef.current) {
        e.stop(); // Prevent default info window for places
        placesServiceRef.current.getDetails(
          {
            placeId: e.placeId,
            fields: [
              "place_id", // Ensure place_id is fetched
              "name",
              "formatted_address",
              "website",
              "photos",
              "url",
              "editorial_summary",
              "types",
              "rating",
              "user_ratings_total",
            ],
          },
          (result, status) => {
            if (status === google.maps.places.PlacesServiceStatus.OK && result) {
              const place: PlaceDetail = {
                placeId: result.place_id || '',
                name: result.name || "Unknown place",
                address: result.formatted_address || "",
                website: result.website || result.url || "",
                photoUrl: result.photos?.[0]?.getUrl({ maxWidth: 400 }),
                description: result.editorial_summary?.overview,
                types: result.types || [],
                rating: result.rating,
                user_ratings_total: result.user_ratings_total,
                url: result.url,
              };
              setPlaceDetails(place);
              setShowPlaceDetailsPopup(true);
            } else {
              console.error("PlacesService details request failed:", status);
            }
          }
        );
      }
    });
  }, [landmarks]); // Dependency on landmarks, which is static.

  useGoogleMapsScript(
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY as string,
    ['places'],
    initMap
  );

  // Load itinerary from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("itinerary");
    if (stored) setItinerary(JSON.parse(stored));
  }, []);

  // Save itinerary to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("itinerary", JSON.stringify(itinerary));
  }, [itinerary]);

  const addPlaceToItinerary = (place: PlaceDetail) => {
    setItinerary((prev) => {
      if (!prev.some(p => p.placeId === place.placeId)) { // Prevent duplicates
        return [...prev, place];
      }
      return prev;
    });
  };

  const removePlaceFromItinerary = (placeId: string) => {
    setItinerary((prev) => prev.filter(place => place.placeId !== placeId));
  };

  // Function to fetch nearby bars and restaurants
  const fetchNearbyPlaces = useCallback(() => {
    if (!placesServiceRef.current || !currentMapCenter.current) {
      console.warn("Map or Places Service not initialized for nearby search.");
      return;
    }

    setLoadingNearby(true);
    setGeminiRecommendations(null); // Clear previous Gemini recommendations
    setLoadingGemini(false); // Reset Gemini loading state

    const request: google.maps.places.PlaceSearchRequest = {
      location: currentMapCenter.current,
      radius: 5000, // 5km radius
      type: ['bar', 'restaurant'],
      // You can add keyword for more specific search, e.g., keyword: 'tapas'
    };

    placesServiceRef.current.nearbySearch(request, (results, status) => {
      setLoadingNearby(false);
      if (status === google.maps.places.PlacesServiceStatus.OK && results) {
        const mappedResults: PlaceDetail[] = results.map(place => ({
          placeId: place.place_id || '',
          name: place.name || 'Unknown',
          address: place.vicinity || place.formatted_address || '',
          photoUrl: place.photos?.[0]?.getUrl({ maxWidth: 100 }),
          types: place.types || [],
          rating: place.rating,
          user_ratings_total: place.user_ratings_total,
          url: place.url, // Google Maps URL
        }));
        setNearbyPlaces(mappedResults);

        // Now, trigger Gemini recommendations for these places
        if (mappedResults.length > 0) {
          getGeminiRecommendations(mappedResults);
        } else {
          setGeminiRecommendations("No nearby bars or restaurants found in this area.");
        }

      } else {
        console.error("Nearby search failed:", status);
        setNearbyPlaces([]);
        setGeminiRecommendations("Failed to load nearby places. Please try again.");
      }
    });
  }, []); // No dependencies that change, relies on currentMapCenter.current being updated by map 'idle' event

  // Mock Gemini API call - in a real app, this would call your backend
  const getGeminiRecommendations = useCallback(async (places: PlaceDetail[]) => {
    setLoadingGemini(true);
    try {
      // Simulate network request to your backend API
      // The path /api/gemini-recommendations will correctly map to app/api/gemini-recommendations/route.ts
      const response = await fetch('/api/gemini-recommendations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ places: places.map(p => ({
          name: p.name,
          types: p.types,
          rating: p.rating,
          address: p.address
        }))}),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setGeminiRecommendations(data.recommendation);
    } catch (error) {
      console.error("Error fetching Gemini recommendations:", error);
      setGeminiRecommendations("Failed to get AI recommendations. Please try again later.");
    } finally {
      setLoadingGemini(false);
    }
  }, []);

  // Effect to fetch nearby places when the tab is switched
  useEffect(() => {
    if (activeTab === 'nearby' && mapRef.current) {
      // Fetch only if we haven't already or if the map center has potentially changed significantly
      if (nearbyPlaces.length === 0 || !currentMapCenter.current) {
        fetchNearbyPlaces();
      }
    }
  }, [activeTab, fetchNearbyPlaces, nearbyPlaces.length]);


  return (
    <div className="relative w-full h-screen">
      <div id="map" className="absolute inset-0 z-0" />

      {/* Main Content Overlay */}
      <div className="absolute top-4 left-4 z-10 w-96 bg-black/80 rounded-lg shadow-xl text-yellow-100 p-4">
        <h1 className="text-3xl font-extrabold text-yellow-400 mb-4 text-center">City Explorer AI</h1>

        {/* Tab Navigation */}
        <div className="flex justify-around mb-4 border-b border-yellow-600">
          <button
            className={`py-2 px-4 flex-1 text-center font-semibold transition-colors duration-200 ${activeTab === 'details' ? 'bg-yellow-700 text-yellow-100 border-b-2 border-yellow-400' : 'text-gray-400 hover:text-yellow-200'}`}
            onClick={() => setActiveTab('details')}
          >
            <FaInfoCircle className="inline-block mr-2" />
            Place Details
          </button>
          <button
            className={`py-2 px-4 flex-1 text-center font-semibold transition-colors duration-200 ${activeTab === 'nearby' ? 'bg-yellow-700 text-yellow-100 border-b-2 border-yellow-400' : 'text-gray-400 hover:text-yellow-200'}`}
            onClick={() => setActiveTab('nearby')}
          >
            <FaUtensils className="inline-block mr-2" />
            Nearby Places
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'details' && (
          <div className="text-gray-300">
            <h2 className="text-xl font-bold mb-2 text-yellow-300">How to use:</h2>
            <p className="mb-2 text-sm">
              Click on any landmark or point of interest on the map to view its details.
              Add places to your itinerary to plan your trip!
            </p>
            <p className="text-sm">
              The "Place Details" tab shows information about your selected landmark, including an AI-generated description if available.
            </p>
          </div>
        )}

        {activeTab === 'nearby' && (
          <div className="text-gray-300">
            <h2 className="text-xl font-bold mb-2 text-yellow-300 flex items-center">
              <FaCocktail className="mr-2" /> Nearby Bars & Restaurants
              <button
                onClick={fetchNearbyPlaces}
                className="ml-auto text-sm bg-yellow-600 hover:bg-yellow-700 text-white py-1 px-2 rounded flex items-center"
                disabled={loadingNearby || loadingGemini}
              >
                {loadingNearby || loadingGemini ? <FaSpinner className="animate-spin mr-2" /> : <FaRegClock className="mr-2" />}
                Refresh
              </button>
            </h2>
            {loadingGemini ? (
              <p className="text-center py-4 flex items-center justify-center text-yellow-300">
                <FaSpinner className="animate-spin mr-2" /> Getting AI recommendations...
              </p>
            ) : geminiRecommendations && (
              <div className="bg-yellow-900/50 border border-yellow-700 p-3 rounded mb-4 text-sm">
                <h3 className="font-semibold text-yellow-200 mb-1 flex items-center"><FaInfoCircle className="mr-2" />AI Recommendations:</h3>
                <p className="text-white">{geminiRecommendations}</p>
              </div>
            )}

            {loadingNearby ? (
              <p className="text-center py-4 flex items-center justify-center text-yellow-300">
                <FaSpinner className="animate-spin mr-2" /> Loading nearby places...
              </p>
            ) : nearbyPlaces.length > 0 ? (
              <ul className="max-h-60 overflow-y-auto custom-scrollbar pr-2">
                {nearbyPlaces.map((place) => (
                  <li key={place.placeId} className="mb-3 p-2 bg-yellow-900/30 rounded flex items-start border border-yellow-800">
                    {place.photoUrl && (
                      <img src={place.photoUrl} alt={place.name} className="w-16 h-16 object-cover rounded mr-3" />
                    )}
                    <div className="flex-1">
                      <h3 className="font-semibold text-yellow-200 text-md">{place.name}</h3>
                      <p className="text-xs text-gray-400 mb-1">{place.address}</p>
                      {place.rating && (
                        <p className="text-xs text-yellow-400 flex items-center">
                          <span className="text-yellow-300 text-sm mr-1">★</span> {place.rating} ({place.user_ratings_total})
                        </p>
                      )}
                      <button
                        className="mt-1 text-sm bg-yellow-500 hover:bg-yellow-400 text-black py-1 px-2 rounded flex items-center"
                        onClick={() => addPlaceToItinerary(place)}
                      >
                        <FaPlus className="mr-1" /> Add
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-400 italic">No nearby bars or restaurants found. Try panning the map or refreshing.</p>
            )}
          </div>
        )}
      </div>

      {showPlaceDetailsPopup && placeDetails && (
        <PlaceDetailsPopup
          place={placeDetails}
          onClose={() => setShowPlaceDetailsPopup(false)}
          onAddToItinerary={addPlaceToItinerary}
        />
      )}

      <ItinerarySidebar itinerary={itinerary} onRemovePlace={removePlaceFromItinerary} />
    </div>
  );
}