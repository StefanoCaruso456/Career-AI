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
  blur = 10,
  children,
  className,
  delay = 0,
  once = false,
  rotate = 0,
  scale = 0.972,
  x = 0,
  y = 32,
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: once ? ["start 94%", "start 42%"] : ["start 96%", "end 6%"],
  });

  const leadIn = Math.min(0.22, delay * 0.9);
  const settlePoint = Math.min(0.72, Math.max(0.32, amount + 0.18 + leadIn));

  const opacityRaw = useTransform(
    scrollYProgress,
    once ? [0, leadIn, settlePoint, 1] : [0, leadIn, settlePoint, 0.86, 1],
    once ? [0.14, 0.14, 1, 1] : [0.14, 0.14, 1, 1, 0.84],
  );
  const xRaw = useTransform(
    scrollYProgress,
    [0, settlePoint, 1],
    once ? [x, 0, 0] : [x, 0, x * -0.22],
  );
  const yRaw = useTransform(
    scrollYProgress,
    [0, settlePoint, 1],
    once ? [y, 0, 0] : [y, 0, y * -0.28],
  );
  const rotateRaw = useTransform(
    scrollYProgress,
    [0, settlePoint, 1],
    once ? [rotate, 0, 0] : [rotate, 0, rotate * -0.32],
  );
  const scaleRaw = useTransform(
    scrollYProgress,
    [0, settlePoint, 1],
    once ? [scale, 1, 1] : [scale, 1, 1.016],
  );
  const blurRaw = useTransform(
    scrollYProgress,
    [0, settlePoint, 1],
    once ? [blur, 0, 0] : [blur, 0, blur * 0.16],
  );

  const opacity = useSpring(opacityRaw, {
    damping: 28,
    mass: 0.5,
    stiffness: 170,
  });
  const motionX = useSpring(xRaw, {
    damping: 30,
    mass: 0.55,
    stiffness: 190,
  });
  const motionY = useSpring(yRaw, {
    damping: 30,
    mass: 0.55,
    stiffness: 190,
  });
  const motionRotate = useSpring(rotateRaw, {
    damping: 28,
    mass: 0.55,
    stiffness: 170,
  });
  const motionScale = useSpring(scaleRaw, {
    damping: 24,
    mass: 0.52,
    stiffness: 170,
  });
  const motionBlur = useSpring(blurRaw, {
    damping: 26,
    mass: 0.46,
    stiffness: 160,
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
        filter,
        opacity,
        rotate: motionRotate,
        scale: motionScale,
        transformOrigin: "center center",
        willChange: "transform, opacity, filter",
        x: motionX,
        y: motionY,
      }}
    >
      {children}
    </motion.div>
  );
}
