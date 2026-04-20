"use client";

import {
  motion,
  useMotionTemplate,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";
import { useRef, type ReactNode } from "react";

type ScrollRevealProps = {
  amount?: number;
  blur?: number;
  children: ReactNode;
  className?: string;
  delay?: number;
  once?: boolean;
  rotate?: number;
  scale?: number;
  x?: number;
  y?: number;
};

export function ScrollReveal({
  amount = 0.28,
  blur = 0,
  children,
  className,
  delay = 0,
  once = false,
  rotate = 0,
  scale = 0.986,
  x = 0,
  y = 24,
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: once ? ["start 92%", "start 48%"] : ["start 97%", "start 56%"],
  });

  const leadIn = Math.min(0.14, delay * 0.55);
  const settlePoint = Math.min(0.56, Math.max(0.18, amount + 0.08 + leadIn));

  const opacityRaw = useTransform(
    scrollYProgress,
    [0, leadIn, settlePoint, 1],
    [0.18, 0.18, 1, 1],
  );
  const xRaw = useTransform(scrollYProgress, [0, settlePoint, 1], [x, 0, 0]);
  const yRaw = useTransform(scrollYProgress, [0, settlePoint, 1], [y, 0, 0]);
  const rotateRaw = useTransform(scrollYProgress, [0, settlePoint, 1], [rotate, 0, 0]);
  const scaleRaw = useTransform(scrollYProgress, [0, settlePoint, 1], [scale, 1, 1]);
  const blurRaw = useTransform(scrollYProgress, [0, settlePoint, 1], [blur, 0, 0]);

  const opacity = useSpring(opacityRaw, {
    damping: 34,
    mass: 0.54,
    stiffness: 220,
  });
  const motionX = useSpring(xRaw, {
    damping: 38,
    mass: 0.58,
    stiffness: 240,
  });
  const motionY = useSpring(yRaw, {
    damping: 38,
    mass: 0.58,
    stiffness: 240,
  });
  const motionRotate = useSpring(rotateRaw, {
    damping: 36,
    mass: 0.56,
    stiffness: 210,
  });
  const motionScale = useSpring(scaleRaw, {
    damping: 34,
    mass: 0.54,
    stiffness: 220,
  });
  const motionBlur = useSpring(blurRaw, {
    damping: 34,
    mass: 0.46,
    stiffness: 210,
  });
  const filter = useMotionTemplate`blur(${motionBlur}px)`;

  if (prefersReducedMotion) {
    return (
      <div className={className} ref={ref}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      className={className}
      ref={ref}
      style={{
        ...(blur > 0 ? { filter } : {}),
        opacity,
        rotate: motionRotate,
        scale: motionScale,
        transformOrigin: "center center",
        willChange: blur > 0 ? "transform, opacity, filter" : "transform, opacity",
        x: motionX,
        y: motionY,
      }}
    >
      {children}
    </motion.div>
  );
}
