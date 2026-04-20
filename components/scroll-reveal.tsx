"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

type ScrollRevealProps = {
  amount?: number;
  children: ReactNode;
  className?: string;
  delay?: number;
  once?: boolean;
  x?: number;
  y?: number;
};

export function ScrollReveal({
  amount = 0.28,
  children,
  className,
  delay = 0,
  once = false,
  x = 0,
  y = 32,
}: ScrollRevealProps) {
  const prefersReducedMotion = useReducedMotion();

  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, x, y }}
      transition={{
        delay,
        duration: 0.68,
        ease: [0.22, 1, 0.36, 1],
      }}
      viewport={{ amount, once }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
    >
      {children}
    </motion.div>
  );
}
