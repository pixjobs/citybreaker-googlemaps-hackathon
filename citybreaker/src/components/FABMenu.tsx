"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Compass, ArrowLeft, MapPinned, Globe } from "lucide-react";

export default function FABMenu() {
  const [open, setOpen] = useState(false);
  const [radius, setRadius] = useState(80); // default for desktop

  const toggleMenu = () => setOpen(!open);

  const items = [
    { icon: <Compass size={18} />, label: "Surprise Me" },
    { icon: <ArrowLeft size={18} />, label: "Backtrack" },
    { icon: <MapPinned size={18} />, label: "Itinerary" },
    { icon: <Globe size={18} />, label: "Satellite Toggle", action: "toggle-satellite" },
  ];

  const handleItemClick = (item: typeof items[number]) => {
    if (item.action === "toggle-satellite") {
      window.dispatchEvent(new CustomEvent("toggle-satellite"));
    }
  };

  useEffect(() => {
    const updateRadius = () => {
      if (window.innerWidth < 500) {
        setRadius(50);
      } else {
        setRadius(80);
      }
    };
    updateRadius();
    window.addEventListener("resize", updateRadius);
    return () => window.removeEventListener("resize", updateRadius);
  }, []);

  return (
    <>
      {/* main FAB */}
      <motion.button
        onClick={toggleMenu}
        className="fixed bottom-8 z-50 bg-blue-600 text-white rounded-full w-14 h-14 shadow-lg flex items-center justify-center"
        style={{ right: "100px" }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
      >
        <Plus />
      </motion.button>

      {/* radial menu items */}
      <AnimatePresence>
        {open &&
          items.map((item, index) => (
            <motion.button
              key={item.label}
              initial={{ opacity: 0, scale: 0 }}
              animate={{
                opacity: 1,
                scale: 1,
                x: -Math.cos((index + 1) * Math.PI / 4) * radius,
                y: -Math.sin((index + 1) * Math.PI / 4) * radius,
              }}
              exit={{ opacity: 0, scale: 0 }}
              transition={{ duration: 0.3 }}
              onClick={() => handleItemClick(item)}
              className="fixed bottom-8 z-40 bg-white text-gray-900 rounded-full w-12 h-12 shadow-md flex items-center justify-center"
              style={{ right: "100px" }}
              aria-label={item.label}
            >
              {item.icon}
            </motion.button>
          ))}
      </AnimatePresence>
    </>
  );
}
