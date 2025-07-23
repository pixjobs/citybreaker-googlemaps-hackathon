"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X, Star, Globe } from "lucide-react";
import React from "react";
import Image from "next/image";

// --- FIX: Added the 'export' keyword to make this interface importable ---
export interface Review {
  author_name: string;
  rating: number;
  relative_time_description: string;
  text: string;
  profile_photo_url: string;
}

export interface RichPlaceDetails {
  website?: string;
  rating?: number;
  reviews?: Review[];
  editorial_summary?: { overview?: string };
}

export interface YouTubeVideo {
  id?: string;
  title?: string;
  thumbnail?: string;
  channelTitle?: string;
}

interface LocationMenuPopupProps {
  isOpen: boolean;
  onClose: () => void;
  place?: { name: string; address: string; photoUrl?: string };
  details?: RichPlaceDetails;
  youtubeVideos?: YouTubeVideo[];
  isLoading: boolean;
  isVideosLoading: boolean;
  activeTab: "info" | "reviews" | "videos";
  setActiveTab: (tab: "info" | "reviews" | "videos") => void;
}

const StarRating = ({ rating }: { rating: number }) => (
  <div className="flex items-center">
    {[...Array(5)].map((_, i) => (
      <Star
        key={i}
        size={16}
        className={i < Math.round(rating) ? "text-yellow-400 fill-yellow-400" : "text-gray-400"}
      />
    ))}
    <span className="ml-2 text-sm font-bold text-white">{rating.toFixed(1)}</span>
  </div>
);

export default function LocationMenuPopup({
  isOpen,
  onClose,
  place,
  details,
  youtubeVideos,
  isLoading,
  isVideosLoading,
  activeTab,
  setActiveTab,
}: LocationMenuPopupProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 bg-black/60 backdrop-blur-md z-[200] flex justify-center items-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="relative w-full max-w-md rounded-3xl bg-slate-800/80 backdrop-blur-2xl border border-white/20 shadow-2xl p-6 text-white"
            initial={{ scale: 0.95, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 20 }}
            transition={{ type: "spring", stiffness: 200, damping: 25 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="absolute top-4 right-4 text-white/70 hover:text-white z-10"
              onClick={onClose}
              aria-label="Close"
            >
              <X size={24} />
            </button>

            {place && (
              <div className="mb-4">
                <h2 className="text-2xl font-bold text-yellow-400">{place.name}</h2>
                <p className="text-sm text-white/60">{place.address}</p>
              </div>
            )}

            <div className="flex border-b border-white/30 mb-4">
              <button
                className={`px-4 py-2 text-sm font-semibold transition rounded-t-md ${activeTab === "info" ? "bg-yellow-300 text-black" : "text-white/70 hover:text-white"}`}
                onClick={() => setActiveTab("info")}
              >
                Info
              </button>
              <button
                className={`ml-2 px-4 py-2 text-sm font-semibold transition rounded-t-md ${activeTab === "reviews" ? "bg-yellow-300 text-black" : "text-white/70 hover:text-white"}`}
                onClick={() => setActiveTab("reviews")}
                disabled={isLoading || !details?.reviews}
              >
                Reviews
              </button>
              <button
                className={`ml-2 px-4 py-2 text-sm font-semibold transition rounded-t-md ${activeTab === "videos" ? "bg-yellow-300 text-black" : "text-white/70 hover:text-white"}`}
                onClick={() => setActiveTab("videos")}
                disabled={isLoading}
              >
                Videos
              </button>
            </div>

            <div className="min-h-[200px] max-h-[50vh] overflow-y-auto pr-2">
              {isLoading ? (
                <div className="flex justify-center items-center h-full">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-400"></div>
                </div>
              ) : (
                <>
                  {activeTab === "info" && (
                    <div className="space-y-4">
                      {place?.photoUrl && (
                        <div className="relative w-full h-48">
                          <Image 
                            src={place.photoUrl} 
                            alt={place.name} 
                            fill
                            className="object-cover rounded-xl"
                            sizes="(max-width: 768px) 100vw, 50vw"
                            priority 
                          />
                        </div>
                      )}
                      {details?.rating && <StarRating rating={details.rating} />}
                      {details?.editorial_summary?.overview && (
                        <div>
                          <h4 className="font-bold text-white mb-1">About this place</h4>
                          <p className="text-sm text-white/80 leading-relaxed">{details.editorial_summary.overview}</p>

                        </div>
                      )}
                      {details?.website && (
                        <a href={details.website} target="_blank" rel="noopener noreferrer" className="flex items-center text-blue-300 underline hover:text-blue-200">
                          <Globe size={16} className="mr-2" />
                          Visit Official Website
                        </a>
                      )}
                    </div>
                  )}

                  {activeTab === "reviews" && (
                    <ul className="space-y-4">
                      {details?.reviews && details.reviews.length > 0 ? (
                        details.reviews.map((review, idx) => (
                          <li key={idx} className="bg-white/10 p-3 rounded-xl border border-white/20">
                            <div className="flex items-center mb-2">
                              <div className="relative w-10 h-10 rounded-full mr-3 overflow-hidden">
                                <Image 
                                  src={review.profile_photo_url} 
                                  alt={review.author_name} 
                                  fill
                                  sizes="40px"
                                  className="object-cover"
                                />
                              </div>
                              <div>
                                <p className="font-semibold">{review.author_name}</p>
                                <StarRating rating={review.rating} />
                              </div>
                              <p className="ml-auto text-xs text-white/60">{review.relative_time_description}</p>
                            </div>
                            <p className="text-sm text-white/90">{review.text}</p>
                          </li>
                        ))
                      ) : (
                        <li className="text-sm text-white/60 italic">No reviews available.</li>
                      )}
                    </ul>
                  )}

                  {activeTab === "videos" && (
                    <div>
                      {isVideosLoading ? (
                        <div className="flex justify-center items-center h-full pt-8">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-400"></div>
                        </div>
                      ) : (
                        <ul className="space-y-4">
                          {youtubeVideos && youtubeVideos.length > 0 ? (
                            youtubeVideos.map((video) => (
                              <li key={video.id}>
                                <a
                                  href={`https://www.youtube.com/watch?v=${video.id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center bg-white/10 p-2 rounded-xl border border-transparent hover:border-yellow-400 transition-all group"
                                >
                                  <div className="relative w-24 h-16 rounded-md mr-4 overflow-hidden flex-shrink-0">
                                    <Image 
                                      src={video.thumbnail!}
                                      alt={video.title || "YouTube video thumbnail"} 
                                      fill
                                      sizes="96px"
                                      className="object-cover"
                                    />
                                  </div>
                                  <div className="flex-1">
                                    <p className="font-semibold text-sm leading-tight group-hover:text-yellow-300 transition-colors">{video.title}</p>
                                    <p className="text-xs text-white/60 mt-1">{video.channelTitle}</p>
                                  </div>
                                </a>
                              </li>
                            ))
                          ) : (
                            <li className="text-sm text-white/60 italic">No relevant videos found.</li>
                          )}
                        </ul>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}