// components/StreetViewOverlay.tsx

"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { useMaps } from "./providers/MapsProvider";

interface StreetViewOverlayProps {
	/** The geographic coordinates to display Street View for. */
	location: { lat: number; lng: number };
	/** The main Google Map instance to attach the Street View to. */
	map: google.maps.Map | null;
	/** Callback function to close the overlay. */
	onClose: () => void;
}

/**
 * A full-screen overlay that displays Google Maps Street View for a given location.
 * It hooks into the provided map instance's StreetViewPanorama.
 */
export default function StreetViewOverlay({
	location,
	map,
	onClose,
}: StreetViewOverlayProps) {
	const { isLoaded } = useMaps();

	useEffect(() => {
		// Ensure the Google Maps script is loaded and we have a valid map instance.
		if (!isLoaded || !map) {
			return;
		}

		const streetViewService = new google.maps.StreetViewService();
		const panorama = map.getStreetView();

		// Find the nearest panorama within a 50-meter radius.
		streetViewService.getPanorama({ location, radius: 50 }, (data, status) => {
			// **FIX:** Check for status AND the presence of the nested latLng property.
			if (status === "OK" && data?.location?.latLng) {
				// If a valid panorama is found, set its location and make it visible.
				panorama.setPosition(data.location.latLng);
				panorama.setPov({ heading: 270, pitch: 0 }); // Point in a default direction.
				panorama.setVisible(true);
			} else {
				// If no valid panorama is found, log a warning and close the overlay.
				console.warn("Street View data not found for this location.");
				onClose();
			}
		});

		// Google's panorama has its own close button. We must listen for when
		// the user clicks it to sync our state and properly close the overlay.
		const visibleListener = panorama.addListener("visible_changed", () => {
			if (!panorama.getVisible()) {
				onClose();
			}
		});

		// Cleanup function to run when the component unmounts.
		return () => {
			// Hide the panorama and remove the event listener to prevent memory leaks.
			if (panorama) {
				panorama.setVisible(false);
			}
			google.maps.event.removeListener(visibleListener);
		};
	}, [isLoaded, location, map, onClose]);

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
			{/* 
        This div acts as a container for the overlay styling. The actual
        Street View UI is rendered by Google Maps within the map's container.
      */}
			<div className="h-full w-full" />

			{/* We add our own styled close button as a fallback and for style consistency. */}
			<button
				onClick={onClose}
				className="absolute right-4 top-4 z-[60] rounded-full bg-black/50 p-2 text-white hover:bg-black"
				aria-label="Close Street View"
			>
				<X size={24} />
			</button>
		</div>
	);
}