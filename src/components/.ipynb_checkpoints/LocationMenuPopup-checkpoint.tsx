"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X, Star, Globe, MessageSquare, Video, Info } from "lucide-react";
import React from "react";
import Image from "next/image";

// --- TYPE DEFINITIONS ---
export interface Review {
  author_name: string;
  rating: number;
  relative_time_description: string;
  text: string;
  profile_photo_url: string;
}

export interface RichPlaceDetails {
  place_id?: string;
  website?: string;
  rating?: number;
  reviews?: Review[];
  editorialSummary?: { overview?: string }; // updated type
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
  <div className="flex items-center gap-1">
    {[...Array(5)].map((_, i) => (
      <Star
        key={i}
        size={16}
        className={i < Math.round(rating) ? "text-yellow-400 fill-yellow-400" : "text-gray-500"}
      />
    ))}
    <span className="ml-1 text-sm font-bold text-white">{rating.toFixed(1)}</span>
  </div>
);

const SkeletonLoader = () => (
  <div className="space-y-4 pt-2">
    <div className="bg-slate-700/50 rounded-lg h-24 w-full animate-pulse"></div>
    <div className="space-y-2">
      <div className="bg-slate-700/50 rounded-md h-4 w-3/4 animate-pulse"></div>
      <div className="bg-slate-700/50 rounded-md h-4 w-1/2 animate-pulse"></div>
    </div>
    <div className="bg-slate-700/50 rounded-md h-8 w-1/3 animate-pulse"></div>
  </div>
);

const ReviewCard = ({ review }: { review: Review }) => (
  <motion.li
    className="bg-slate-900/50 p-3 rounded-xl border border-white/10"
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.3 }}
  >
    <div className="flex items-start mb-2">
      <div className="relative w-10 h-10 rounded-full mr-3 overflow-hidden flex-shrink-0">
        <Image
          src={review.profile_photo_url}
          alt={review.author_name}
          fill
          sizes="40px"
          className="object-cover"
        />
      </div>
      <div className="flex-1">
        <p className="font-semibold">{review.author_name}</p>
        <StarRating rating={review.rating} />
      </div>
      <p className="ml-auto text-xs text-white/50 whitespace-nowrap">{review.relative_time_description}</p>
    </div>
    <p className="text-sm text-white/80 leading-relaxed">{review.text}</p>
  </motion.li>
);

const VideoCard = ({ video }: { video: YouTubeVideo }) => (
  <motion.li
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.3 }}
  >
    <a
      href={`https://www.youtube.com/watch?v=${video.id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center bg-slate-900/50 p-2 rounded-xl border border-transparent hover:border-yellow-400/50 hover:bg-slate-900 transition-all group"
    >
      <div className="relative w-28 h-[72px] rounded-md mr-4 overflow-hidden flex-shrink-0">
        <Image
          src={video.thumbnail!}
          alt={video.title || "YouTube video thumbnail"}
          fill
          sizes="112px"
          className="object-cover group-hover:scale-105 transition-transform"
        />
      </div>
      <div className="flex-1">
        <p className="font-semibold text-sm leading-tight group-hover:text-yellow-300 transition-colors">{video.title}</p>
        <p className="text-xs text-white/60 mt-1">{video.channelTitle}</p>
      </div>
    </a>
  </motion.li>
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
  const tabs = [
    { id: "info", label: "Info", icon: <Info size={16} />, disabled: false },
    { id: "reviews", label: "Reviews", icon: <MessageSquare size={16} />, disabled: isLoading || !details?.reviews },
    { id: "videos", label: "Videos", icon: <Video size={16} />, disabled: isLoading },
  ] as const;

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
            className="relative w-full max-w-lg rounded-3xl bg-gradient-to-br from-gray-900 via-slate-900 to-gray-800 border border-white/10 shadow-2xl p-6 text-white overflow-hidden"
            initial={{ scale: 0.9, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: 20, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors z-10"
              onClick={onClose}
              aria-label="Close"
            >
              <X size={24} />
            </button>

            {place && (
              <div className="mb-4 pr-8">
                <motion.h2 layoutId={`place-title-${place.name}`} className="text-2xl font-bold text-yellow-300">
                  {place.name}
                </motion.h2>
                <p className="text-sm text-white/50">{place.address}</p>
              </div>
            )}

            <div className="relative flex border-b border-white/10 mb-4">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  disabled={tab.disabled}
                  className={`relative flex items-center gap-2 px-4 py-2 text-sm font-semibold transition rounded-t-md outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 ${
                    activeTab === tab.id ? "text-white" : "text-white/50 hover:text-white"
                  } disabled:text-white/20`}
                >
                  {tab.icon}
                  {tab.label}
                  {activeTab === tab.id && (
                    <motion.div className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-yellow-400" layoutId="underline" />
                  )}
                </button>
              ))}
            </div>

            <div className="min-h-[250px] max-h-[55vh] overflow-y-auto pr-2 custom-scrollbar">
              {isLoading ? (
                <SkeletonLoader />
              ) : (
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                  >
                    {activeTab === "info" && (
                      <div className="space-y-4">
                        {place?.photoUrl && (
                          <div className="relative w-full h-48 rounded-xl overflow-hidden">
                            <Image
                              src={`/api/proxy-photo?placeid=${details.place_id}`}
                              alt={place.name}
                              fill
                              sizes="100vw"
                              className="object-cover"
                              priority
                              unoptimized
                            />
                          </div>
                        )}
                        {details?.rating && <StarRating rating={details.rating} />}
                        {details?.editorialSummary?.overview && (
                          <div>
                            <h4 className="font-bold text-white mb-1">About this place</h4>
                            <p className="text-sm text-white/70 leading-relaxed">{details.editorialSummary.overview}</p>
                          </div>
                        )}
                        {details?.website && (
                          <a
                            href={details.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center text-sm font-semibold text-blue-400 hover:text-blue-300 transition-colors group"
                          >
                            <Globe size={16} className="mr-2" />
                            Visit Website
                            <span className="ml-1 group-hover:translate-x-1 transition-transform">→</span>
                          </a>
                        )}
                      </div>
                    )}

                    {activeTab === "reviews" && (
                      <ul className="space-y-3">
                        {details?.reviews && details.reviews.length > 0 ? (
                          details.reviews.map((review, idx) => <ReviewCard key={idx} review={review} />)
                        ) : (
                          <li className="text-sm text-white/60 italic text-center pt-8">No reviews available.</li>
                        )}
                      </ul>
                    )}

                    {activeTab === "videos" && (
                      <div>
                        {isVideosLoading ? (
                          <SkeletonLoader />
                        ) : (
                          <ul className="space-y-3">
                            {youtubeVideos && youtubeVideos.length > 0 ? (
                              youtubeVideos.map((video) => <VideoCard key={video.id} video={video} />)
                            ) : (
                              <li className="text-sm text-white/60 italic text-center pt-8">No relevant videos found.</li>
                            )}
                          </ul>
                        )}
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
