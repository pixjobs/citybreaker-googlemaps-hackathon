"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  X,
  Compass,
  MapPinned,
  Globe,
  Landmark,
  Utensils,
} from "lucide-react";
import React from "react";

// --- menu items config ---
interface MenuItem {
  icon: React.ReactNode;
  label: string;
  action: "surprise-me" | "itinerary" | "toggle-satellite" | "toggle-landmarks" | "toggle-restaurants";
}

const menuItems: MenuItem[] = [
  { icon: <Compass size={22} />, label: "Surprise Me", action: "surprise-me" },
  { icon: <MapPinned size={22} />, label: "My Itinerary", action: "itinerary" },
  { icon: <Globe size={22} />, label: "Satellite", action: "toggle-satellite" },
  { icon: <Landmark size={22} />, label: "Landmarks", action: "toggle-landmarks" },
  { icon: <Utensils size={22} />, label: "Restaurants", action: "toggle-restaurants" },
];

// --- animation variants ---
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

export default function FABMenu() {
  const [isOpen, setIsOpen] = useState(false);

  const handleItemClick = (action: MenuItem["action"]) => {
    switch (action) {
      case "toggle-satellite":
        window.dispatchEvent(new Event("toggle-satellite"));
        break;
      case "toggle-landmarks":
        window.dispatchEvent(new Event("show-landmarks-menu"));
        break;
      case "toggle-restaurants":
        window.dispatchEvent(new Event("show-restaurants-menu"));
        break;
      case "surprise-me":
        console.log("🎯 surprise-me triggered (Gemini to hook here)");
        break;
      case "itinerary":
        console.log("📍 itinerary triggered (hook up later)");
        break;
    }
    setIsOpen(false);
  };

  return (
    <>
      {/* backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-black/40 z-40"
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      {/* FAB + menu */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
        {/* animated menu items */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="hidden"
              className="flex flex-col gap-3 mb-4"
            >
              {menuItems.map((item) => (
                <motion.div
                  key={item.label}
                  variants={itemVariants}
                  className="flex items-center justify-end gap-3"
                >
                  <span className="bg-gray-800 text-white text-xs px-3 py-1 rounded shadow">
                    {item.label}
                  </span>
                  <button
                    onClick={() => handleItemClick(item.action)}
                    className="bg-white text-gray-900 rounded-full w-14 h-14 shadow-md flex items-center justify-center"
                    aria-label={item.label}
                  >
                    {item.icon}
                  </button>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* main FAB button */}
        <motion.button
          onClick={() => setIsOpen(!isOpen)}
          className="bg-blue-600 text-white rounded-full w-16 h-16 shadow-lg flex items-center justify-center"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          aria-expanded={isOpen}
          aria-label={isOpen ? "Close menu" : "Open menu"}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={isOpen ? "x" : "plus"}
              initial={{ rotate: -45, opacity: 0, scale: 0.5 }}
              animate={{ rotate: 0, opacity: 1, scale: 1 }}
              exit={{ rotate: 45, opacity: 0, scale: 0.5 }}
              transition={{ duration: 0.2 }}
            >
              {isOpen ? <X size={28} /> : <Plus size={28} />}
            </motion.div>
          </AnimatePresence>
        </motion.button>
      </div>
    </>
  );
}
