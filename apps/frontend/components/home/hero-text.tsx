"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

const roles = ["Browser workflows", "Human approval", "Traceable execution", "Local-first control"];

export default function HeroText() {
  const [roleIndex, setRoleIndex] = useState(0);
  const [displayText, setDisplayText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const currentRole = roles[roleIndex];
    let timeout: NodeJS.Timeout;

    if (!isDeleting && displayText === currentRole) {
      timeout = setTimeout(() => setIsDeleting(true), 2000);
    } else if (isDeleting && displayText === "") {
      setIsDeleting(false);
      setRoleIndex((prev) => (prev + 1) % roles.length);
    } else {
      timeout = setTimeout(
        () => {
          setDisplayText(
            isDeleting
              ? currentRole.substring(0, displayText.length - 1)
              : currentRole.substring(0, displayText.length + 1)
          );
        },
        isDeleting ? 30 : 60
      );
    }

    return () => clearTimeout(timeout);
  }, [displayText, isDeleting, roleIndex]);

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="text-sm md:text-base font-mono tracking-wider uppercase"
        style={{ color: "#06b6d4" }}
      >
        Introducing
      </motion.p>

      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-3xl md:text-6xl lg:text-7xl font-bold leading-tight"
      >
        <span style={{ color: "var(--text-primary)" }}>Utomator</span>
        <br />
        <span className="text-gradient text-nowrap">
          {displayText}
          <motion.span
            animate={{ opacity: [1, 0] }}
            transition={{ duration: 0.5, repeat: Infinity }}
            className="inline-block w-0.5 h-[1em] ml-1 align-middle"
            style={{ background: "#06b6d4" }}
          />
        </span>
      </motion.h1>
      
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="text-base md:text-lg max-w-xl leading-relaxed"
        style={{ color: "var(--text-secondary)" }}
      >
        Plan and review browser workflows for your LinkedIn and X accounts. Inspect first, approve changes explicitly, and keep evidence of what actually happened.
      </motion.p>
    </div>
  );
}
