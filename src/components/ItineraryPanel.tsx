"use client";

import React, {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	MapPin,
	Pin,
	Sparkles,
	Star,
	Users,
	Wallet,
	X,
} from "lucide-react";
import { saveAs } from "file-saver";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/dist/ScrollTrigger";
import Image from "next/image";
import ReactMarkdown from "react-markdown";

// Register the GSAP ScrollTrigger plugin
gsap.registerPlugin(ScrollTrigger);

// --- Constants ---
const TRIP_LENGTH_OPTIONS = [3, 5, 7];
const DEFAULT_TRIP_LENGTH = 3;

// --- Types ---
interface EnrichedPlace {
	name: string;
	photoUrl?: string;
	website?: string;
	googleMapsUrl?: string;
	location?: { lat: number; lng: number };
}

interface ItineraryActivity {
	title: string;
	description: string;
	whyVisit: string;
	insiderTip: string;
	priceRange: string;
	audience: string;
	placeName: string;
}

interface ItineraryDay {
	title: string;
	dayPhotoUrl?: string;
	activities: ItineraryActivity[];
}

interface ApiResponse {
	city: string;
	days: number;
	places: EnrichedPlace[];
	itinerary: ItineraryDay[];
}

interface ItineraryPanelProps {
	cityName: string;
	places: { name: string }[];
	onClose: () => void;
	onZoomToLocation: (location: { lat: number; lng: number }) => void;
}

// --- Utility ---
const formatCityName = (input: string | undefined): string => {
	if (!input || typeof input !== "string") return "CityBreaker";
	return input
		.trim()
		.toLowerCase()
		.replace(/\b\w/g, (c) => c.toUpperCase());
};

// --- Sub-Components ---

/**
 * Renders a single activity card with details and an optional photo.
 */
const ActivityCard: React.FC<{
	activity: ItineraryActivity;
	place?: EnrichedPlace;
	onZoomToLocation: (location: { lat: number; lng: number }) => void;
}> = ({ activity, place, onZoomToLocation }) => (
	<div className="activity-card flex flex-col overflow-hidden rounded-xl border border-neutral-700/60 bg-neutral-800/50 shadow-lg sm:flex-row">
		<div className="relative h-40 w-full flex-shrink-0 sm:h-auto sm:w-1/3">
			{place?.photoUrl ? (
				<Image
					src={place.photoUrl}
					alt={activity.title.replace(/"/g, "'")}
					fill
					className="object-cover"
					sizes="(max-width: 640px) 100vw, 33vw"
				/>
			) : (
				<div className="flex h-full w-full items-center justify-center bg-neutral-800">
					<Pin className="text-neutral-600" size={32} />
				</div>
			)}
		</div>
		<div className="flex w-full flex-col p-4 sm:p-5">
			<div className="mb-2 flex items-start justify-between gap-3">
				<h4 className="font-serif text-lg font-bold text-amber-300 sm:text-xl">
					{activity.title}
				</h4>
				{place?.location &&
                  typeof place.location.lat === "number" &&
                  typeof place.location.lng === "number" && (
                    <button
                      onClick={() => onZoomToLocation(place.location)}
                      className="flex-shrink-0 items-center gap-1.5 rounded-full bg-blue-500/10 px-2.5 py-1.5 text-xs font-semibold text-blue-400 transition-colors hover:bg-blue-500/20"
                      title={`View ${activity.placeName} on the map`}
                    >
                      <MapPin size={14} />
                      Map
                    </button>
                )}
			</div>
			<div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-400 sm:text-sm">
				<span className="flex items-center gap-1.5">
					<Wallet size={14} className="text-amber-400/80" /> {activity.priceRange}
				</span>
				<span className="flex items-center gap-1.5">
					<Users size={14} className="text-amber-400/80" /> {activity.audience}
				</span>
			</div>
			<div className="prose prose-sm prose-invert prose-p:leading-relaxed mb-4 text-neutral-300">
				<ReactMarkdown>{activity.description}</ReactMarkdown>
			</div>
			<div className="mt-auto grid grid-cols-1 gap-3 border-t border-neutral-700/60 pt-3 text-xs sm:text-sm">
				<div className="flex items-start gap-2">
					<Star className="mt-0.5 flex-shrink-0 text-amber-400" size={14} />
					<div>
						<h5 className="mb-0.5 font-semibold text-neutral-200">Why Visit</h5>
						<p className="text-neutral-400">{activity.whyVisit}</p>
					</div>
				</div>
				<div className="flex items-start gap-2">
					<Pin className="mt-0.5 flex-shrink-0 text-amber-400" size={14} />
					<div>
						<h5 className="mb-0.5 font-semibold text-neutral-200">Insider Tip</h5>
						<p className="text-neutral-400">{activity.insiderTip}</p>
					</div>
				</div>
			</div>
		</div>
	</div>
);

// --- Main Component ---

const ItineraryPanel: React.FC<ItineraryPanelProps> = ({
	cityName,
	places,
	onClose,
	onZoomToLocation,
}) => {
	const [itineraryData, setItineraryData] = useState<ItineraryDay[]>([]);
	const [enrichedPlaces, setEnrichedPlaces] = useState<EnrichedPlace[]>([]);
	const [panelLoading, setPanelLoading] = useState(true);
	const [pdfLoading, setPdfLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [currentTripLength, setCurrentTripLength] =
		useState(DEFAULT_TRIP_LENGTH);

	const panelRef = useRef<HTMLDivElement>(null);
	const itineraryCache = useRef<Record<string, ApiResponse>>({});
	const onCloseRef = useRef(onClose);

	// Memoized values
	const safeCityName = useMemo(() => formatCityName(cityName), [cityName]);
	const cacheKey = useMemo(() => {
		const sortedPlaceNames = places.map((p) => p.name).sort().join("|");
		return `${safeCityName}_${currentTripLength}_${sortedPlaceNames}`;
	}, [places, currentTripLength, safeCityName]);

	const isLoading = panelLoading || pdfLoading;
	const hasData = !panelLoading && !error && itineraryData.length > 0;

	// Keep onClose callback fresh without adding it to dependencies
	useEffect(() => {
		onCloseRef.current = onClose;
	}, [onClose]);

	// Effect for initial panel entrance animation
	useEffect(() => {
		const ctx = gsap.context(() => {
			gsap.fromTo(
				panelRef.current,
				{ opacity: 0, y: 100 },
				{ opacity: 1, y: 0, duration: 0.7, ease: "power3.out" },
			);
			gsap.from(".header-element", {
				y: -30,
				opacity: 0,
				stagger: 0.1,
				delay: 0.5,
				ease: "power3.out",
			});
		}, panelRef);
		return () => ctx.revert();
	}, []);

	// Effect to fetch itinerary data when cacheKey changes
	useEffect(() => {
		const controller = new AbortController();

		const fetchData = async () => {
			setPanelLoading(true);
			setError(null);

			const startTime = Date.now();
			const isCached = !!itineraryCache.current[cacheKey];

			// If data is in cache, use it after a short artificial delay
			if (isCached) {
				await new Promise((resolve) => setTimeout(resolve, 1000));
				const cached = itineraryCache.current[cacheKey];
				setItineraryData(cached.itinerary);
				setEnrichedPlaces(cached.places);
				setPanelLoading(false);
				return;
			}

			// Otherwise, fetch new data from the API
			try {
				const res = await fetch("/api/gemini-recommendations/json", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						places,
						tripLength: currentTripLength,
						cityName: safeCityName,
					}),
					signal: controller.signal,
				});

				if (!res.ok) {
					const errorResponse = await res.json().catch(() => ({}));
					const message =
						typeof errorResponse?.error === "string"
							? errorResponse.error
							: "Request failed";
					throw new Error(message);
				}

				const data: ApiResponse = await res.json();
				itineraryCache.current[cacheKey] = data;
				setItineraryData(data.itinerary || []);
				setEnrichedPlaces(data.places || []);
			} catch (err: unknown) {
				if (err instanceof DOMException && err.name === "AbortError") {
					// Request was aborted by the user, so we do nothing.
				} else if (err instanceof Error) {
					setError(err.message || "Something went wrong.");
				} else {
					setError("An unknown error occurred.");
				}
			} finally {
				// Ensure the loader is visible for a minimum duration to avoid flickering
				const duration = Date.now() - startTime;
				setTimeout(() => setPanelLoading(false), Math.max(0, 1500 - duration));
			}
		};

		fetchData();

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") onCloseRef.current();
		};

		document.addEventListener("keydown", handleKeyDown);

		// Cleanup function
		return () => {
			controller.abort();
			document.removeEventListener("keydown", handleKeyDown);
			ScrollTrigger.getAll().forEach((t) => t.kill());
		};
	}, [cacheKey, safeCityName, currentTripLength, places]);

	// Effect for scroll-triggered content animations
	useEffect(() => {
		if (!panelLoading && hasData) {
			const ctx = gsap.context(() => {
				ScrollTrigger.batch(".day-block", {
					onEnter: (batch) =>
						gsap.from(batch, {
							autoAlpha: 0,
							y: 50,
							stagger: 0.15,
							ease: "power3.out",
						}),
					start: "top 90%",
				});

				ScrollTrigger.batch(".activity-card", {
					onEnter: (batch) =>
						gsap.from(batch, {
							autoAlpha: 0,
							x: -50,
							stagger: 0.1,
							ease: "back.out(1.7)",
						}),
					start: "top 95%",
				});
			}, panelRef);
			return () => {
				ScrollTrigger.getAll().forEach((t) => t.kill());
				ctx.revert();
			};
		}
	}, [panelLoading, hasData]);

	// Callbacks
	const generateExtendedItineraryPDF = useCallback(async () => {
		if (!itineraryData.length || pdfLoading) return;
		setPdfLoading(true);

		try {
			const res = await fetch("/api/pdf-itinerary", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					places,
					tripLength: currentTripLength,
					cityName: safeCityName,
				}),
			});

			if (!res.ok) {
				const errorResponse = await res.json().catch(() => ({}));
				const message =
					typeof errorResponse?.error === "string"
						? errorResponse.error
						: "PDF generation failed";
				throw new Error(message);
			}

			const blob = await res.blob();
			const filename = `${safeCityName.replace(
				/\s+/g,
				"_",
			)}_${currentTripLength}d_Itinerary.pdf`;
			saveAs(blob, filename);
		} catch (err: unknown) {
			const message =
				err instanceof Error ? err.message : "An unknown error occurred";
			alert(`PDF Download Failed: ${message}`);
		} finally {
			setPdfLoading(false);
		}
	}, [pdfLoading, itineraryData, places, currentTripLength, safeCityName]);

	const handleTripLengthChange = useCallback(
		(days: number) => {
			if (days !== currentTripLength && !panelLoading) {
				setCurrentTripLength(days);
			}
		},
		[currentTripLength, panelLoading],
	);

	return (
		<div
			className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm"
			onClick={onClose}
		>
			<div
				ref={panelRef}
				className="no-scrollbar absolute bottom-0 left-0 right-0 top-[80px] flex flex-col border-t border-neutral-700/50 bg-neutral-900 font-sans text-neutral-200 shadow-2xl sm:left-1/2 sm:top-[88px] sm:w-full sm:max-w-4xl sm:-translate-x-1/2 sm:rounded-2xl sm:border"
				onClick={(e) => e.stopPropagation()}
			>
				<header className="sticky top-0 z-20 flex items-center justify-between border-b border-neutral-700/50 bg-neutral-900/80 p-3 backdrop-blur-md sm:p-4">
					<div className="header-element flex items-center gap-1 rounded-full border border-neutral-700 bg-neutral-800 p-1">
						{TRIP_LENGTH_OPTIONS.map((days) => (
							<button
								key={days}
								onClick={() => handleTripLengthChange(days)}
								disabled={panelLoading}
								className={`rounded-full px-3 py-1 text-sm font-semibold transition-colors duration-200 disabled:cursor-not-allowed ${
									currentTripLength === days
										? "bg-amber-400 text-black"
										: "text-neutral-300 hover:bg-neutral-700/50"
								}`}
							>
								{days} Days
							</button>
						))}
					</div>
					<h2 className="header-element absolute left-1/2 hidden -translate-x-1/2 font-serif text-lg text-white md:block">
						Your <span className="text-amber-300">{safeCityName}</span> Itinerary
					</h2>
                    <div className="flex items-center gap-2">
                      {hasData && !panelLoading && (
                        <button
                          onClick={generateExtendedItineraryPDF}
                          disabled={pdfLoading}
                          className="header-element rounded-full bg-gradient-to-r from-purple-500 to-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-md transition-transform hover:scale-105 hover:shadow-lg disabled:opacity-60 disabled:pointer-events-none"
                          aria-label="Generate Premium Itinerary"
                        >
                          {pdfLoading ? (
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          ) : (
                            "Generate Premium PDF Itinerary"
                          )}
                        </button>
                      )}
                      <button
                        onClick={onClose}
                        className="header-element rounded-full p-2 text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-white"
                        aria-label="Close itinerary panel"
                      >
                        <X size={24} />
                      </button>
                    </div>

				</header>

				<main className="flex-grow overflow-y-auto p-3 sm:p-4 lg:p-6">
					{panelLoading ? (
						<div className="flex h-full flex-col items-center justify-center pt-10 text-neutral-500">
							<div className="h-10 w-10 animate-spin rounded-full border-4 border-amber-400 border-t-transparent" />
							<p className="mt-4 font-semibold">
								Crafting your {currentTripLength}-day itinerary...
							</p>
							<p className="mt-1 text-sm text-neutral-600">
								This can take a moment.
							</p>
						</div>
					) : error ? (
						<div className="flex h-full flex-col items-center justify-center pt-10 text-amber-400/80">
							<p className="text-lg font-semibold">
								Itinerary Generation Failed
							</p>
							<p className="mt-2 max-w-md text-center text-sm text-neutral-400">
								{error}
							</p>
						</div>
					) : (
						<div className="space-y-6 sm:space-y-10">
							{itineraryData.map((day, i) => (
								<div key={day.title} className="day-block space-y-4 sm:space-y-5">
									<div className="relative h-18 w-full overflow-hidden rounded-xl border-2 border-amber-300/20 sm:h-24 sm:rounded-2xl">
										{day.dayPhotoUrl && (
											<Image
												src={day.dayPhotoUrl}
												alt={day.title.replace(/"/g, "'")}
												fill
												className="object-cover"
												priority={i === 0}
											/>
										)}
										<div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
										<div className="absolute bottom-0 left-0 p-3 sm:p-5">
											<span className="text-xs font-bold uppercase tracking-widest text-amber-300">
												Day {i + 1}
											</span>
											<h3 className="mt-0.5 font-serif text-base leading-tight text-white sm:text-xl">
												{day.title}
											</h3>
										</div>
									</div>
									<div className="space-y-4 sm:space-y-5">
										{day.activities.map((activity) => (
											<ActivityCard
												key={activity.title}
												activity={activity}
												place={enrichedPlaces.find(
													(p) => p.name === activity.placeName,
												)}
												onZoomToLocation={onZoomToLocation}
											/>
										))}
									</div>
								</div>
							))}
						</div>
					)}
				</main>
			</div>
		</div>
	);
};

export default ItineraryPanel;