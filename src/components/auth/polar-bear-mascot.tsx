"use client";

import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface PolarBearMascotProps {
  /** Normalized horizontal gaze target in [-1, 1] when focused on an input */
  inputLookX: number | null;
  /** Normalized vertical gaze target in [-1, 1] when focused on an input */
  inputLookY: number | null;
  /** True when password or confirm-password is displayed as plain text characters */
  isCoveringEyes: boolean;
  /** True when an input is actively focused */
  isInputFocused: boolean;
  /** True when passwords match or form is submitting happily */
  isHappy?: boolean;
  /** True briefly when a validation/auth error occurs */
  hasError?: boolean;
  className?: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Interactive White Polar Bear mascot for Sign In / Sign Up:
 * - Follows the typing caret (`selectionStart`) across form inputs as the user types
 * - Smoothly tracks the mouse pointer across the viewport when idle
 * - Raises both white paws to cover its eyes whenever plain-text password mode is toggled ON
 */
export function PolarBearMascot({
  inputLookX,
  inputLookY,
  isCoveringEyes,
  isInputFocused,
  isHappy = false,
  hasError = false,
  className,
}: PolarBearMascotProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [pointerLook, setPointerLook] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [isBlinking, setIsBlinking] = useState(false);

  // Track mouse/pointer cursor smoothly when not locked onto a focused input
  useEffect(() => {
    let rafId: number | null = null;

    function handlePointerMove(e: PointerEvent) {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        const el = containerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const nx = clamp((e.clientX - cx) / 220, -1, 1);
        const ny = clamp((e.clientY - cy) / 220, -1, 1);
        setPointerLook({ x: nx, y: ny });
      });
    }

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, []);

  // Natural periodic eye blink
  useEffect(() => {
    let blinkTimeout: ReturnType<typeof setTimeout> | null = null;
    const interval = setInterval(() => {
      setIsBlinking(true);
      blinkTimeout = setTimeout(() => setIsBlinking(false), 140);
    }, 4100);

    return () => {
      clearInterval(interval);
      if (blinkTimeout) clearTimeout(blinkTimeout);
    };
  }, []);

  // Resolve effective gaze vector in pixel units
  const activeNormX = isCoveringEyes
    ? 0
    : isInputFocused && inputLookX !== null
      ? clamp(inputLookX, -1, 1)
      : pointerLook.x;

  const activeNormY = isCoveringEyes
    ? -0.15
    : isInputFocused && inputLookY !== null
      ? clamp(inputLookY, -1, 1)
      : pointerLook.y;

  const lookX = activeNormX * 13.5;
  const lookY = activeNormY * 9.5;

  const earTx = lookX * 0.35;
  const earTy = lookY * 0.3;
  const headTx = lookX * 0.72;
  const headTy = lookY * 0.55;
  const headRot = lookX * 0.32;
  const faceTx = lookX * 1.18;
  const faceTy = lookY * 0.92;
  const muzzleTx = lookX * 1.32;
  const muzzleTy = lookY * 0.98;

  const statusLabel = isCoveringEyes
    ? "Polar bear covering its eyes while password is visible"
    : isInputFocused
      ? "Polar bear watching your typing cursor"
      : "Polar bear watching cursor";

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={statusLabel}
      className={cn(
        "relative mx-auto size-28 sm:size-32 select-none rounded-full border border-border/90 bg-gradient-to-b from-slate-100 via-slate-100 to-slate-200/90 dark:from-zinc-800 dark:via-zinc-800/95 dark:to-zinc-900 shadow-inner overflow-hidden transition-transform duration-200",
        hasError && "animate-[bearShake_0.38s_ease-in-out]",
        className,
      )}
    >
      <svg
        viewBox="0 0 200 200"
        className="h-full w-full"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <clipPath id="naut-polar-bear-clip">
            <circle cx="100" cy="100" r="98" />
          </clipPath>
          <linearGradient id="furShadow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#f1f5f9" />
          </linearGradient>
        </defs>

        <g clipPath="url(#naut-polar-bear-clip)">
          {/* Subtle snow horizon */}
          <ellipse
            cx="100"
            cy="194"
            rx="85"
            ry="24"
            className="fill-slate-200/70 dark:fill-zinc-700/40"
          />

          {/* Fluffy Polar Bear Shoulders / Torso */}
          <path
            d="M 34 204 C 39 152, 66 136, 100 136 C 134 136, 161 152, 166 204 Z"
            fill="url(#furShadow)"
            stroke="#cbd5e1"
            strokeWidth="2.2"
          />
          {/* Subtle neck shadow */}
          <ellipse cx="100" cy="143" rx="34" ry="9" fill="#e2e8f0" opacity="0.7" />

          {/* Rounded Polar Bear Ears (reverse/soft parallax) */}
          <g
            style={{
              transform: `translate(${earTx}px, ${earTy}px)`,
              transition: "transform 130ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          >
            <circle
              cx="55"
              cy="56"
              r="16.5"
              fill="#ffffff"
              stroke="#cbd5e1"
              strokeWidth="2.2"
            />
            <circle cx="56" cy="57" r="8.5" fill="#e2e8f0" />

            <circle
              cx="145"
              cy="56"
              r="16.5"
              fill="#ffffff"
              stroke="#cbd5e1"
              strokeWidth="2.2"
            />
            <circle cx="144" cy="57" r="8.5" fill="#e2e8f0" />
          </g>

          {/* Polar Bear Head */}
          <g
            style={{
              transform: `translate(${headTx}px, ${headTy}px) rotate(${headRot}deg)`,
              transformOrigin: "100px 98px",
              transition: "transform 120ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          >
            <ellipse
              cx="100"
              cy="97"
              rx="53"
              ry="47"
              fill="url(#furShadow)"
              stroke="#cbd5e1"
              strokeWidth="2.2"
            />
            {/* Top fur tuft */}
            <path
              d="M 93 50 Q 100 44 107 50"
              fill="#ffffff"
              stroke="#cbd5e1"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </g>

          {/* Eyes, Brows & Blush (2.5D foreground parallax) */}
          <g
            style={{
              transform: `translate(${faceTx}px, ${faceTy}px)`,
              transition: "transform 105ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          >
            {/* Eyebrows */}
            <path
              d={
                isCoveringEyes
                  ? "M 69 74 Q 78 69 86 75"
                  : hasError
                    ? "M 69 75 Q 78 79 86 77"
                    : "M 69 78 Q 78 73.5 86 78"
              }
              stroke="#94a3b8"
              strokeWidth="2.4"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d={
                isCoveringEyes
                  ? "M 114 75 Q 122 69 131 74"
                  : hasError
                    ? "M 114 77 Q 122 79 131 75"
                    : "M 114 78 Q 122 73.5 131 78"
              }
              stroke="#94a3b8"
              strokeWidth="2.4"
              strokeLinecap="round"
              fill="none"
            />

            {/* Left Eye */}
            <g
              style={{
                transformOrigin: "78px 90px",
                transform: `scaleY(${isBlinking && !isCoveringEyes ? 0.1 : 1})`,
                transition: "transform 85ms ease-out",
              }}
            >
              <circle cx="78" cy="90" r="6.2" fill="#0f172a" />
              <circle
                cx={76.2 + activeNormX * 1.4}
                cy={88.2 + activeNormY * 1.1}
                r="2"
                fill="#ffffff"
              />
              <circle cx="80.2" cy="92.2" r="0.9" fill="#ffffff" opacity="0.65" />
            </g>

            {/* Right Eye */}
            <g
              style={{
                transformOrigin: "122px 90px",
                transform: `scaleY(${isBlinking && !isCoveringEyes ? 0.1 : 1})`,
                transition: "transform 85ms ease-out",
              }}
            >
              <circle cx="122" cy="90" r="6.2" fill="#0f172a" />
              <circle
                cx={120.2 + activeNormX * 1.4}
                cy={88.2 + activeNormY * 1.1}
                r="2"
                fill="#ffffff"
              />
              <circle cx="124.2" cy="92.2" r="0.9" fill="#ffffff" opacity="0.65" />
            </g>

            {/* Soft Rosy Cheeks */}
            <ellipse
              cx="63"
              cy="104"
              rx="8.5"
              ry="4.8"
              fill="#fda4af"
              style={{
                opacity: isCoveringEyes ? 0.62 : isInputFocused ? 0.3 : 0.14,
                transition: "opacity 220ms ease",
              }}
            />
            <ellipse
              cx="137"
              cy="104"
              rx="8.5"
              ry="4.8"
              fill="#fda4af"
              style={{
                opacity: isCoveringEyes ? 0.62 : isInputFocused ? 0.3 : 0.14,
                transition: "opacity 220ms ease",
              }}
            />
          </g>

          {/* Snout / Muzzle (strongest parallax for convincing 3D head turn) */}
          <g
            style={{
              transform: `translate(${muzzleTx}px, ${muzzleTy}px)`,
              transition: "transform 105ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          >
            <ellipse
              cx="100"
              cy="112"
              rx="22.5"
              ry="16.5"
              fill="#f1f5f9"
              stroke="#e2e8f0"
              strokeWidth="1.6"
            />
            {/* Polar Bear Nose */}
            <path
              d="M 91.5 105.5 C 91.5 101.5, 108.5 101.5, 108.5 105.5 C 108.5 111, 103 115, 100 115 C 97 115, 91.5 111, 91.5 105.5 Z"
              fill="#18181b"
            />
            <ellipse
              cx="97.2"
              cy="104.8"
              rx="2.8"
              ry="1.2"
              fill="#ffffff"
              opacity="0.65"
            />
            {/* Philtrum & Mouth */}
            <line
              x1="100"
              y1="115"
              x2="100"
              y2="119.5"
              stroke="#334155"
              strokeWidth="2.1"
              strokeLinecap="round"
            />
            {hasError ? (
              <path
                d="M 93.5 123.5 Q 100 119.5 106.5 123.5"
                stroke="#334155"
                strokeWidth="2.1"
                strokeLinecap="round"
                fill="none"
              />
            ) : isCoveringEyes ? (
              <ellipse
                cx="100"
                cy="122"
                rx="3.4"
                ry="2.6"
                fill="#334155"
              />
            ) : isHappy ? (
              <path
                d="M 91 119.5 Q 100 127.5 109 119.5"
                stroke="#334155"
                strokeWidth="2.2"
                strokeLinecap="round"
                fill="none"
              />
            ) : (
              <path
                d="M 92.5 120.5 Q 96.2 124.2 100 120.2 Q 103.8 124.2 107.5 120.5"
                stroke="#334155"
                strokeWidth="2.1"
                strokeLinecap="round"
                fill="none"
              />
            )}
          </g>

          {/* Left Articulated White Paw (swings up to cover left eye when password is plain text) */}
          <g
            style={{
              transformOrigin: "54px 186px",
              transform: isCoveringEyes
                ? "translate(0px, 0px) rotate(0deg)"
                : "translate(-20px, 78px) rotate(-24deg)",
              transition: "transform 340ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          >
            <path
              d="M 38 196 C 36 146, 52 98, 66 76 C 74 65, 93 69, 96 84 C 99 98, 91 116, 82 132 L 74 198 Z"
              fill="#ffffff"
              stroke="#cbd5e1"
              strokeWidth="2.4"
              strokeLinejoin="round"
            />
            {/* Fluffy toe creases */}
            <path
              d="M 71 73 L 73 81 M 80 73 L 80 81 M 88 76 L 86 83"
              stroke="#cbd5e1"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <ellipse
              cx="79"
              cy="91"
              rx="8"
              ry="6"
              fill="#e2e8f0"
              opacity="0.55"
            />
          </g>

          {/* Right Articulated White Paw (swings up to cover right eye when password is plain text) */}
          <g
            style={{
              transformOrigin: "146px 186px",
              transform: isCoveringEyes
                ? "translate(0px, 0px) rotate(0deg)"
                : "translate(20px, 78px) rotate(24deg)",
              transition: "transform 340ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          >
            <path
              d="M 162 196 C 164 146, 148 98, 134 76 C 126 65, 107 69, 104 84 C 101 98, 109 116, 118 132 L 126 198 Z"
              fill="#ffffff"
              stroke="#cbd5e1"
              strokeWidth="2.4"
              strokeLinejoin="round"
            />
            {/* Fluffy toe creases */}
            <path
              d="M 129 73 L 127 81 M 120 73 L 120 81 M 112 76 L 114 83"
              stroke="#cbd5e1"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <ellipse
              cx="121"
              cy="91"
              rx="8"
              ry="6"
              fill="#e2e8f0"
              opacity="0.55"
            />
          </g>
        </g>
      </svg>
    </div>
  );
}
