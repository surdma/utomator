"use client";

import { motion } from "framer-motion";

export default function PageTransition() {
  return (
    <>
      <motion.div
        className="fixed top-0 bottom-0 right-full w-screen z-30"
        style={{ transformOrigin: "right", background: "#06b6d4" }}
        initial={{ x: "100%", scaleX: 1 }}
        animate={{ x: "0%", scaleX: 0 }}
        transition={{ duration: 0.6, ease: "easeInOut" }}
      />
      <motion.div
        className="fixed top-0 bottom-0 right-full w-screen z-20"
        style={{ transformOrigin: "right", background: "var(--bg)" }}
        initial={{ x: "100%", scaleX: 1 }}
        animate={{ x: "0%", scaleX: 0 }}
        transition={{ delay: 0.15, duration: 0.6, ease: "easeInOut" }}
      />
      <motion.div
        className="fixed top-0 bottom-0 right-full w-screen z-10"
        style={{ transformOrigin: "right", background: "#8b5cf6" }}
        initial={{ x: "100%", scaleX: 1 }}
        animate={{ x: "0%", scaleX: 0 }}
        transition={{ delay: 0.3, duration: 0.6, ease: "easeInOut" }}
      />
    </>
  );
}
