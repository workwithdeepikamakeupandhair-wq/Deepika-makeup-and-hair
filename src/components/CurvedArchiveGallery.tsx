/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Sparkles, Heart } from 'lucide-react';
import { ARCHIVE_LOOKS, LookArchiveItem, BUSINESS_INFO } from '../data/portfolioData';

/** Below this width the detail view stacks (cover on top, text below) instead of side by side. */
const DETAIL_SIDE_BY_SIDE_MIN_W = 1024;
/** Max width of the detail layout frame; matches Tailwind's max-w-6xl used by the panel. */
const DETAIL_FRAME_MAX_W = 1152;
/** Cover center sits at 73% of the frame width in the side-by-side detail view. */
const DETAIL_COVER_SHIFT = 0.23;
/** Opened cover size relative to the shelf cover (180×340): side by side, and stacked (narrow screens). */
const DETAIL_SCALE_WIDE = 1.6;
const DETAIL_SCALE_STACKED = 1.15;
/** Side by side, the opened view sits this far below the shelf line so the larger cover clears the
    heading (it grows into the caption area, which is hidden while open). The panel's
    lg:top-[calc(var(--stage-cy)_+_40px)] must match. */
const DETAIL_DROP_WIDE = 40;
/** Stacked, the cover rises a little instead, leaving room for the text panel that follows it. */
const DETAIL_DROP_STACKED = -16;
/** Detail scales the floor-shadow offset was tuned for. */
const SHADOW_BASE_SCALE_WIDE = 1.3;
const SHADOW_BASE_SCALE_STACKED = 1.08;

/** Hover "peek": a hovered side tape turns to this angle (showing part of its cover), pops forward and lifts. */
const PEEK_ANGLE = -24;
const PEEK_Z = 60;
const PEEK_LIFT = 0.06; // fraction of shelf height
/** Extra hit area around the hovered tape so it doesn't flicker when its own lift moves it off the cursor. */
const PEEK_STICKY_PX = 24;
/** Spine face's distance in front of the tape pivot (its translateZ below). */
const SPINE_DEPTH = 90;
const DEG = Math.PI / 180;

/**
 * Devices that can hover get the "Open look" hint on hover; touch-only devices can't hover, so the
 * front cover shows a "Tap to open" hint whenever the shelf is at rest.
 */
const CAN_HOVER = typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches;

/** "01" … "12": a look's position in the gallery */
const lookNumber = (index: number) => String(index + 1).padStart(2, '0');

/** Staggered entrance delay for the detail panel's blocks. */
const stagger = (i: number): React.CSSProperties => ({ animationDelay: `${140 + i * 60}ms` });

interface CurvedArchiveGalleryProps {
  onSelectLookForBooking?: (look: LookArchiveItem) => void;
  onOpenBooking: () => void;
}

export const CurvedArchiveGallery: React.FC<CurvedArchiveGalleryProps> = ({
  onSelectLookForBooking,
  onOpenBooking
}) => {
  const sectionRef = useRef<HTMLElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const [activeLookIndex, setActiveLookIndex] = useState(0);
  const [detailLook, setDetailLook] = useState<LookArchiveItem | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  // Bumped on every open so the panel remounts and replays its entrance animation.
  const [openCount, setOpenCount] = useState(0);
  const [likedLooks, setLikedLooks] = useState<Record<string, boolean>>({});

  // 36 virtual tapes (3 loops of 12)
  const virtualTapes = useMemo(() => {
    const list: { v: number; look: LookArchiveItem; copy: number; originalIndex: number }[] = [];
    for (let copy = 0; copy < 3; copy++) {
      ARCHIVE_LOOKS.forEach((look, i) => {
        list.push({
          v: copy * ARCHIVE_LOOKS.length + i,
          look,
          copy,
          originalIndex: i
        });
      });
    }
    return list;
  }, []);

  // Animation and physics state stored in refs for 60fps rAF loop
  const stateRef = useRef({
    s: 12, // start at second loop index 0 (12)
    T: 12,
    p: 12,
    isDragging: false,
    startX: 0,
    startT: 12,
    moved: 0,
    mx: 0,
    my: 0,
    tiltX: 0,
    tiltY: 0,
    lastTime: performance.now(),
    H: 340,
    W: 1000,
    wheelTimeout: null as NodeJS.Timeout | null,
    hoveredTape: -1,
    pressedTape: -1, // tape under the pointer at pointerdown (pointerup is retargeted by pointer capture)
    open: 0, // detail-view progress: 0 = shelf, 1 = opened look (springs toward openTarget)
    openTarget: 0,
    // Mouse position for hover picking (viewport coords); touch never sets pointerInside
    pointerX: 0,
    pointerY: 0,
    pointerInside: false,
    peek: new Array<number>(36).fill(0), // per-tape hover peek progress, 0..1
    rotY: new Array<number>(36).fill(0), // per-tape rotateY from the last frame (for picking front faces)
    cursor: '',
    openHint: 0, // "Open look" hint on the front cover, 0..1
  });

  // Toggle favorite
  const toggleLike = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setLikedLooks(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Precompute screen x curve table XS
  const XS = useMemo(() => {
    const table: number[] = [];
    let acc = 0;
    const steps = 1500;
    for (let i = 0; i < steps; i++) {
      const uNorm = (i * 2) / 450; // normalized u/U
      const val = 2 / (1 + Math.pow(uNorm, 1.6));
      acc += val;
      table.push(acc);
    }
    return table;
  }, []);

  /**
   * Which tape is under the pointer: the front-most (highest z) tape with a visible face containing the point.
   * Done geometrically because Chromium's hit testing misses most faces in this preserve-3d stage
   * (e.target is just the container), while getBoundingClientRect on the faces is accurate.
   * `stickyV` gets PEEK_STICKY_PX of extra hit area (keeps a hovered tape from flickering).
   */
  const pickTapeAt = (clientX: number, clientY: number, stickyV = -1): number => {
    const state = stateRef.current;
    let picked = -1;
    let pickedZ = -Infinity;
    for (const { v } of virtualTapes) {
      const tapeEl = document.getElementById(`tape-${v}`);
      if (!tapeEl || tapeEl.style.display === 'none' || tapeEl.style.visibility === 'hidden') continue;
      const z = parseFloat(tapeEl.style.zIndex || '0');
      if (z <= pickedZ) continue;
      const pad = v === stickyV ? PEEK_STICKY_PX : 0;
      // Skip faces turned away from the viewer (they're backface-hidden but still have a bounding rect)
      const faces: string[] = [];
      if (Math.abs(state.rotY[v]) < 90) faces.push('.spine-face');
      if (Math.abs(state.rotY[v] + 90) < 90) faces.push('.cover-face');
      for (const sel of faces) {
        const face = tapeEl.querySelector<HTMLElement>(sel);
        if (!face) continue;
        const r = face.getBoundingClientRect();
        if (
          clientX >= r.left - pad && clientX <= r.right + pad &&
          clientY >= r.top - pad && clientY <= r.bottom + pad
        ) {
          picked = v;
          pickedZ = z;
          break;
        }
      }
    }
    return picked;
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let animId: number;

    const updateDimensions = () => {
      const rect = container.getBoundingClientRect();
      stateRef.current.W = rect.width;
      // H is responsive: min(45vh, 32vw) with min 280 and max 440
      const calculatedH = Math.min(Math.max(window.innerHeight * 0.44, 280), 420);
      stateRef.current.H = calculatedH;
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);

    // Main 60fps render loop
    const loop = (now: number) => {
      const state = stateRef.current;
      const dt = Math.min(50, now - state.lastTime);
      state.lastTime = now;

      // Hover picking. Reading face rects here, before this frame's style writes, costs no extra layout.
      const canHover = state.pointerInside && !state.isDragging && state.openTarget === 0;
      state.hoveredTape = canHover ? pickTapeAt(state.pointerX, state.pointerY, state.hoveredTape) : -1;
      const cursor = canHover && state.hoveredTape >= 0 ? 'pointer' : '';
      if (cursor !== state.cursor) {
        container.style.cursor = cursor;
        state.cursor = cursor;
      }

      // "Open look" hint: on hover over the front cover, or always at rest on touch-only devices
      let hoveringFront = false;
      if (state.hoveredTape >= 0) {
        let rh = (state.hoveredTape - state.s) % 36;
        if (rh < -18) rh += 36;
        if (rh >= 18) rh -= 36;
        hoveringFront = Math.abs(rh) < 0.5;
      }
      const shelfAtRest = Math.abs(state.T - state.s) < 0.15 && !state.isDragging && state.openTarget === 0;
      const hintTarget = shelfAtRest && (CAN_HOVER ? hoveringFront : true) ? 1 : 0;
      state.openHint += (hintTarget - state.openHint) * (1 - Math.exp(-12 * (dt / 1000)));
      if (state.openHint < 0.001) state.openHint = 0;

      // Spring physics: s chases T
      const springK = state.isDragging ? 18 : 5.8;
      state.s += (state.T - state.s) * (1 - Math.exp(-springK * (dt / 1000)));

      // Wrap around whole loop if s passes ±4 items from center loop
      if (state.s < 6) {
        state.s += 12;
        state.T += 12;
      } else if (state.s > 24) {
        state.s -= 12;
        state.T -= 12;
      }

      // Determine active look
      const roundedIndex = Math.round(state.s) % 12;
      const positiveIndex = (roundedIndex + 12) % 12;
      if (positiveIndex !== activeLookIndex) {
        setActiveLookIndex(positiveIndex);
      }

      // Detail view progress springs toward its target (0 = shelf, 1 = opened look)
      state.open += (state.openTarget - state.open) * (1 - Math.exp(-6.5 * (dt / 1000)));
      if (Math.abs(state.openTarget - state.open) < 0.001) state.open = state.openTarget;
      const open = state.open;

      const W = state.W;
      const H = state.H;
      const P = 1400; // must match the container's perspective-1400

      // Opened pose: side by side on wide screens (cover shifts right), centered when stacked
      const sideBySide = W >= DETAIL_SIDE_BY_SIDE_MIN_W;
      const detailScale = sideBySide ? DETAIL_SCALE_WIDE : DETAIL_SCALE_STACKED;
      const detailShift = sideBySide ? Math.min(W, DETAIL_FRAME_MAX_W) * DETAIL_COVER_SHIFT : 0;
      const detailDrop = sideBySide ? DETAIL_DROP_WIDE : DETAIL_DROP_STACKED;
      const detailZ = P * (1 - 1 / detailScale); // translateZ that renders at detailScale

      // Pointer tilt interpolation (follows the cover to its opened position)
      const isSettled = Math.abs(state.T - state.s) < 0.3;
      const d = H * (474 / 900);
      const coverCx = W / 2 + detailShift * open;
      const coverHalfW = 0.55 * d * (1 + (detailScale - 1) * open);
      const isOnCover =
        isSettled &&
        Math.abs(state.mx - coverCx) < coverHalfW &&
        Math.abs(state.my - H / 2) < 0.55 * H;

      let targetTiltY = 0;
      let targetTiltX = 0;
      if (isOnCover) {
        targetTiltY = ((state.mx - coverCx) / coverHalfW) * 8;
        targetTiltX = -((state.my - H / 2) / (H / 2)) * 5;
      } else {
        targetTiltY = ((state.mx - W / 2) / W) * 4 * (1 - open);
        targetTiltX = 0;
      }

      state.tiltY += (targetTiltY - state.tiltY) * (1 - Math.exp(-7 * (dt / 1000)));
      state.tiltX += (targetTiltX - state.tiltX) * (1 - Math.exp(-7 * (dt / 1000)));

      // Render tape 3D positions
      const ws = H * (142 / 840);
      const gap = H * 0.035;
      const isMobile = W < 768;
      const U = H * (isMobile ? 1.05 : 1.35);

      // Floor shadow follows the cover into the detail pose (and down with its bottom edge as it grows)
      if (shadowRef.current) {
        const baseScale = sideBySide ? SHADOW_BASE_SCALE_WIDE : SHADOW_BASE_SCALE_STACKED;
        const shadowDrop = 40 + detailDrop + 170 * (detailScale - baseScale);
        shadowRef.current.style.transform = `translateX(calc(-50% + ${(detailShift * open).toFixed(1)}px)) translateY(${(shadowDrop * open).toFixed(1)}px) scaleX(${(1 - 0.3 * open).toFixed(3)})`;
      }

      const smoothstep = (x: number) => Math.max(0, Math.min(1, x * x * (3 - 2 * x)));

      virtualTapes.forEach(({ v }) => {
        const tapeEl = document.getElementById(`tape-${v}`);
        if (!tapeEl) return;

        // Relative index mapped to [-18, 18)
        let r = ((v - state.s) % 36);
        if (r < -18) r += 36;
        if (r >= 18) r -= 36;

        // Arc length from center F(r)
        let Br = 0;
        if (Math.abs(r) < 1) {
          Br = (r + Math.sin(Math.PI * r) / Math.PI) / 2;
        } else {
          Br = r > 0 ? 0.5 : -0.5;
        }
        const u = r * (ws + gap) + (d - ws + 1.4 * gap) * Br;

        // Outside view cutoff
        if (Math.abs(u) > U * 2.1) {
          tapeEl.style.display = 'none';
          return;
        }
        tapeEl.style.display = 'block';

        // Scale and depth
        const absU = Math.abs(u);
        const sc = 1 / (1 + Math.pow(absU / U, 1.6));
        const k = 1 / Math.max(0.01, sc);

        // Precomputed screen x
        const idx = Math.min(Math.floor(absU / 2), XS.length - 1);
        const xScreen = (u < 0 ? -1 : 1) * (XS[idx] || 0);

        // Active open factor: 1 when directly centered, 0 when on side
        const o = smoothstep(Math.max(0, 1 - Math.abs(r)));

        // Hover peek (side tapes only; the front cover tilts instead). Eases in and out.
        const peekTarget = state.hoveredTape === v && Math.abs(r) > 0.5 ? 1 : 0;
        state.peek[v] += (peekTarget - state.peek[v]) * (1 - Math.exp(-9 * (dt / 1000)));
        if (state.peek[v] < 0.001) state.peek[v] = 0;
        const peek = state.peek[v];

        // Popping forward by PEEK_Z would also push the tape outward on screen; scaling x/y by kp
        // instead of k keeps it in its slot.
        const peekZ = peek * PEEK_Z;
        const kp = k - peekZ / P;
        let z = P * (1 - k) + o * H * 0.12 + peekZ;
        let x = xScreen * kp;
        let y = (H * 0.45 * (1 - sc) * 0.42 + o * H * 0.015 - peek * H * PEEK_LIFT) * kp;

        // Detail view: the centered tape glides into the opened pose; the rest drift outward and fade.
        // (x/y are in world units; dividing by detailScale lands them at detailShift/detailDrop on screen.)
        const focus = open * o;
        z += (detailZ - z) * focus;
        x += (detailShift / detailScale - x) * focus;
        y += (detailDrop / detailScale - y) * focus;
        const fade = Math.min(1, open * 1.6) * (1 - o);
        x += (u < 0 ? -1 : 1) * fade * W * 0.08 * k;

        const rotBase =
          (u < 0 ? -1 : 1) * Math.min(1, absU / U) * 26 * (1 - o) -
          90 * o +
          state.tiltY * o;
        // Peek: turn toward the cover (same angle on both sides, so every tape opens the same amount)
        const rotY = rotBase + (PEEK_ANGLE - rotBase) * peek;
        state.rotY[v] = rotY;
        // The spine sits SPINE_DEPTH in front of the tape's pivot, so turning swings it sideways (behind the
        // neighbor on the right side). Shift the tape so the spine stays in its slot and the cover swings out.
        x += SPINE_DEPTH * (Math.sin(rotBase * DEG) - Math.sin(rotY * DEG));
        const rotX = state.tiltX * o;

        tapeEl.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, ${z.toFixed(1)}px) rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg)`;
        tapeEl.style.zIndex = `${Math.round(3000 + z)}`;
        tapeEl.style.visibility = fade > 0.99 ? 'hidden' : '';
        tapeEl.style.pointerEvents = open > 0.01 && o < 0.5 ? 'none' : '';

        // Shading on faces (a peeking tape catches the light so its cover art shows)
        const spineShade = Math.min(0.65, o * 0.55 + (1 - sc) * 0.35) * (1 - 0.6 * peek);
        const coverShade = (1 - o) * 0.85 * (1 - 0.75 * peek);

        // Fade the faces, not the tape: opacity on the preserve-3d tape would flatten its faces.
        const faceOpacity = fade > 0 ? `${(1 - fade).toFixed(3)}` : '';
        const spineFace = tapeEl.querySelector('.spine-face') as HTMLElement;
        const coverFace = tapeEl.querySelector('.cover-face') as HTMLElement;
        if (spineFace) {
          spineFace.style.setProperty('--face-shade', `${spineShade}`);
          spineFace.style.opacity = faceOpacity;
        }
        if (coverFace) {
          coverFace.style.setProperty('--face-shade', `${coverShade}`);
          coverFace.style.setProperty('--open-hint', (state.openHint * o).toFixed(3));
          coverFace.style.opacity = faceOpacity;
        }
      });

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', updateDimensions);
    };
  }, [virtualTapes, XS, activeLookIndex]);

  // Open the look whose tape sits at shelf position `targetT` (snapped to the nearest tape)
  const openDetail = (targetT: number) => {
    const t = Math.round(targetT);
    stateRef.current.T = t;
    stateRef.current.openTarget = 1;
    setDetailLook(ARCHIVE_LOOKS[((t % 12) + 12) % 12]);
    setIsDetailOpen(true);
    setOpenCount((n) => n + 1);
  };

  const closeDetail = () => {
    stateRef.current.openTarget = 0;
    setIsDetailOpen(false);
    sectionRef.current?.focus({ preventScroll: true });
  };

  // Move keyboard focus into the detail view when it opens
  useEffect(() => {
    if (isDetailOpen) backButtonRef.current?.focus({ preventScroll: true });
  }, [isDetailOpen, openCount]);

  // Escape closes the detail view wherever focus is
  useEffect(() => {
    if (!isDetailOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDetail();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isDetailOpen]);

  // Pointer & Drag handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    if (stateRef.current.openTarget === 1) return; // shelf is locked while a look is open
    if ((e.target as HTMLElement).closest('button')) return;
    // Resolve the tape now: after setPointerCapture, pointerup is retargeted to the container.
    stateRef.current.pressedTape = pickTapeAt(e.clientX, e.clientY);
    stateRef.current.isDragging = true;
    stateRef.current.startX = e.clientX;
    stateRef.current.startT = stateRef.current.T;
    stateRef.current.moved = 0;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      stateRef.current.mx = e.clientX - rect.left;
      stateRef.current.my = e.clientY - rect.top;
    }
    // Hover peek follows a mouse only; a touch swipe must not leave a tape stuck open
    if (e.pointerType !== 'touch') {
      stateRef.current.pointerInside = true;
      stateRef.current.pointerX = e.clientX;
      stateRef.current.pointerY = e.clientY;
    }

    if (!stateRef.current.isDragging) return;
    const dx = e.clientX - stateRef.current.startX;
    stateRef.current.moved = Math.max(stateRef.current.moved, Math.abs(dx));

    const ws = stateRef.current.H * (142 / 840);
    const gap = stateRef.current.H * 0.035;
    stateRef.current.T = stateRef.current.startT - dx / (ws + gap);
  };

  const handlePointerUp = () => {
    if (!stateRef.current.isDragging) return;
    stateRef.current.isDragging = false;

    // If small click movement, check if clicked on tape
    if (stateRef.current.moved < 6) {
      const v = stateRef.current.pressedTape;
      if (v >= 0) {
        let r = ((v - stateRef.current.s) % 36);
        if (r < -18) r += 36;
        if (r >= 18) r -= 36;

        if (Math.abs(r) < 0.5) {
          // Clicked active tape: open it in the detail view
          openDetail(stateRef.current.s + r);
        } else {
          // Clicked other tape: Glide to it
          stateRef.current.T = Math.round(stateRef.current.T + r);
        }
      } else {
        stateRef.current.T = Math.round(stateRef.current.T);
      }
    } else {
      stateRef.current.T = Math.round(stateRef.current.T);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (isDetailOpen) return;
    e.preventDefault();
    const ws = stateRef.current.H * (142 / 840);
    const gap = stateRef.current.H * 0.035;
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    stateRef.current.T += (delta / (ws + gap)) * 0.45;

    if (stateRef.current.wheelTimeout) clearTimeout(stateRef.current.wheelTimeout);
    stateRef.current.wheelTimeout = setTimeout(() => {
      stateRef.current.T = Math.round(stateRef.current.T);
    }, 160);
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isDetailOpen) return; // Escape is handled by the document listener above
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      stateRef.current.T = Math.round(stateRef.current.T) + 1;
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      stateRef.current.T = Math.round(stateRef.current.T) - 1;
    } else if (e.key === 'Enter' && e.target === e.currentTarget) {
      openDetail(stateRef.current.T);
    }
  };

  const stepNext = () => {
    stateRef.current.T = Math.round(stateRef.current.T) + 1;
  };

  const stepPrev = () => {
    stateRef.current.T = Math.round(stateRef.current.T) - 1;
  };

  const currentLook = ARCHIVE_LOOKS[activeLookIndex] || ARCHIVE_LOOKS[0];

  return (
    <section
      ref={sectionRef}
      id="archive-gallery"
      className="relative py-20 bg-[#FAF7F2] overflow-hidden border-t border-[#E7DFD6]"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      aria-label="Interactive 3D Curved Makeup Archive Gallery"
    >
      {/* Header Info */}
      <div className="max-w-7xl mx-auto px-5 sm:px-8 text-center space-y-3 relative z-10">
        <div className="inline-flex items-center gap-2 text-xs font-sans tracking-[0.2em] uppercase text-[#9E7D53]">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Look Gallery · {ARCHIVE_LOOKS.length} Signature Looks</span>
        </div>
        <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl text-[#1D1714]">
          The Archive of Bridal Radiance
        </h2>
        <p className="text-xs sm:text-sm text-[#6A5F56] max-w-xl mx-auto font-sans">
          Real looks by {BUSINESS_INFO.artist}. Drag or swipe to rotate the shelf, and tap the front photo to open it.
        </p>
      </div>

      {/* Stage + in-place detail view.
          --stage-cy is the shelf's center line: the tapes, perspective origin, floor shadow and detail
          panel all hang off it, so the stage can end just below the covers (tight gap to the caption). */}
      <div className="relative [--stage-cy:230px] sm:[--stage-cy:250px]">
      {/* 3D Shelf Stage Container */}
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={() => {
          stateRef.current.pointerInside = false;
        }}
        onWheel={handleWheel}
        style={{ perspectiveOrigin: '50% var(--stage-cy)' }}
        className={`relative w-full h-[424px] sm:h-[448px] mt-6 flex items-center justify-center select-none perspective-1400 ${
          isDetailOpen ? 'cursor-default touch-pan-y' : 'cursor-grab active:cursor-grabbing touch-none'
        }`}
      >
        {/* Soft radial floor shadow underneath active cover */}
        <div
          ref={shadowRef}
          className="absolute pointer-events-none z-1 rounded-full"
          style={{
            top: 'calc(var(--stage-cy) + 70px)',
            width: 'min(86vw, 480px)',
            height: '110px',
            background:
              'radial-gradient(50% 50% at 50% 40%, rgba(40, 32, 20, 0.28), rgba(40, 32, 20, 0.08) 55%, transparent 72%)',
            transform: 'translateX(-50%)',
            left: '50%'
          }}
        />

        {/* Center 3D Zero-Size Stage */}
        <div
          ref={stageRef}
          className="absolute left-1/2 top-[var(--stage-cy)] w-0 h-0 preserve-3d"
        >
          {virtualTapes.map(({ v, look, originalIndex }) => (
            <div
              key={v}
              id={`tape-${v}`}
              data-tape-v={v}
              className="absolute left-0 top-0 w-0 h-0 preserve-3d will-change-transform"
            >
              {/* Spine Face */}
              <div
                className="spine-face absolute backface-hidden rounded-[2px] overflow-hidden border border-[#D9D0C5] bg-[#F5EFEB] shadow-md flex flex-col justify-between p-2"
                style={{
                  width: '58px',
                  height: '340px',
                  top: '-170px',
                  left: '-29px',
                  transform: `translateZ(${SPINE_DEPTH}px)`,
                  boxShadow: '0 8px 24px rgba(29, 23, 20, 0.15)'
                }}
              >
                {/* Darkening shade overlay */}
                <div
                  className="absolute inset-0 bg-black pointer-events-none transition-opacity duration-150"
                  style={{ opacity: 'var(--face-shade, 0)' }}
                />

                {/* Spine art content */}
                <div className="relative z-1 text-center space-y-1">
                  <div className="w-5 h-5 mx-auto rounded-full bg-[#C5A880]/30 border border-[#C5A880] flex items-center justify-center">
                    <span className="text-[9px] font-sans font-bold text-[#1D1714]">
                      {lookNumber(originalIndex)}
                    </span>
                  </div>
                  <div className="h-6 w-full overflow-hidden rounded-[1px]">
                    <img
                      src={look.coverImage}
                      alt={look.title}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                </div>

                {/* Vertical spine title */}
                <div className="relative z-1 flex-1 flex items-center justify-center py-2">
                  <span
                    className="text-[10.5px] font-sans font-semibold tracking-[0.16em] uppercase text-[#1D1714] whitespace-nowrap"
                    style={{
                      writingMode: 'vertical-rl',
                      transform: 'rotate(180deg)'
                    }}
                  >
                    {look.title}
                  </span>
                </div>

                <div className="relative z-1 text-center pt-1 border-t border-[#D9D0C5]/80">
                  <span className="text-[9px] font-sans tracking-[0.15em] text-[#9E7D53] font-bold">
                    DMH
                  </span>
                </div>
              </div>

              {/* Cover Face (Turned 90° so it faces forward when centered) */}
              <div
                className="cover-face absolute backface-hidden rounded-[3px] overflow-hidden border border-[#D9D0C5] bg-[#FAF7F2] flex flex-col justify-between"
                style={{
                  width: '180px',
                  height: '340px',
                  top: '-170px',
                  left: '-90px',
                  transform: 'rotateY(90deg) translateZ(29px)',
                  boxShadow: '0 30px 60px -25px rgba(29, 23, 20, 0.45)'
                }}
              >
                {/* Darkening shade overlay */}
                <div
                  className="absolute inset-0 bg-black pointer-events-none transition-opacity duration-150 z-20"
                  style={{ opacity: 'var(--face-shade, 0)' }}
                />

                {/* Cover artwork */}
                <div className="relative w-full h-full flex flex-col justify-between bg-[#1D1714] text-[#FAF7F2] p-3 overflow-hidden">
                  {/* Background Image */}
                  <img
                    src={look.coverImage}
                    alt={look.title}
                    className="absolute inset-0 w-full h-full object-cover object-top"
                    referrerPolicy="no-referrer"
                  />
                  {/* Shade only behind the text bands so the photo itself stays clear */}
                  <div className="absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-black/45 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 h-[38%] bg-gradient-to-t from-[#1D1714]/90 via-[#1D1714]/45 to-transparent" />

                  {/* Header stamp */}
                  <div className="relative z-10 flex items-center justify-between text-[8px] font-sans uppercase tracking-[0.18em] text-[#FAF7F2]/90">
                    <span>Deepika S</span>
                    <span className="px-1.5 py-0.5 border border-[#C5A880] text-[#C5A880] rounded-[2px]">
                      Look {lookNumber(originalIndex)}
                    </span>
                  </div>

                  {/* Bottom title info */}
                  <div className="relative z-10">
                    <h3 className="font-serif text-lg leading-tight text-white font-medium">
                      {look.title}
                    </h3>
                  </div>
                </div>

                {/* "Open look" hint, driven by --open-hint from the render loop (CSS :hover doesn't fire
                    reliably on these 3D faces). Sits over the outfit, clear of the face and the title. */}
                <div
                  aria-hidden="true"
                  className="absolute inset-0 z-30 pointer-events-none"
                  style={{ opacity: 'var(--open-hint, 0)' }}
                >
                  <div
                    className="absolute left-1/2 top-[62%] -translate-x-1/2 -translate-y-1/2"
                    style={{
                      transform:
                        'translateY(calc((1 - var(--open-hint, 0)) * 8px)) scale(calc(0.9 + 0.1 * var(--open-hint, 0)))',
                    }}
                  >
                    <span className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-[#FAF7F2]/95 pl-3.5 pr-2 py-1.5 shadow-lg text-[9px] font-sans font-semibold uppercase tracking-[0.2em] text-[#1D1714]">
                      {CAN_HOVER ? 'Open look' : 'Tap to open'}
                      <span className="w-5 h-5 rounded-full bg-[#1D1714] text-[#FAF7F2] flex items-center justify-center">
                        <ArrowUpRight className="w-3 h-3" />
                      </span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Detail view (VHS-archive style): the opened cover stands on the right, its story on the left.
          Wide screens: overlays the stage's left side. Narrower: sits below the stage. */}
      {detailLook && (
        <div
          aria-hidden={!isDetailOpen}
          className={`relative z-30 transition-[opacity,visibility] duration-300 lg:absolute lg:inset-0 lg:mx-auto lg:max-w-6xl lg:pointer-events-none ${
            isDetailOpen ? 'opacity-100 visible' : 'opacity-0 invisible max-lg:hidden'
          }`}
        >
          <div
            key={openCount}
            role="region"
            aria-label={`${detailLook.title}: look details`}
            className="max-w-xl mx-auto px-6 pt-2 pb-4 lg:p-0 lg:max-w-none lg:absolute lg:left-[6%] lg:top-[calc(var(--stage-cy)_+_40px)] lg:-translate-y-1/2 lg:w-[40%] lg:pointer-events-auto"
          >
            <button
              ref={backButtonRef}
              onClick={closeDetail}
              style={stagger(0)}
              className="archive-detail-in group inline-flex items-center gap-2 text-[11px] font-sans uppercase tracking-[0.2em] text-[#6A5F56] hover:text-[#1D1714] transition-colors"
            >
              <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
              <span>Back to the archive</span>
            </button>

            <p
              style={stagger(1)}
              className="archive-detail-in mt-6 lg:mt-8 text-[11px] font-sans font-semibold uppercase tracking-[0.22em] text-[#9E7D53]"
            >
              Look {lookNumber(ARCHIVE_LOOKS.indexOf(detailLook))} of {ARCHIVE_LOOKS.length}
            </p>

            <h3
              style={stagger(2)}
              className="archive-detail-in mt-3 font-serif font-medium text-[clamp(2.5rem,4.2vw,3.9rem)] leading-[0.95] tracking-tight text-[#1D1714]"
            >
              {detailLook.title}
            </h3>

            <p
              style={stagger(3)}
              className="archive-detail-in mt-5 font-serif italic text-base text-[#6A5F56]"
            >
              Makeup &amp; hair by {BUSINESS_INFO.artist}
            </p>

            <div style={stagger(4)} className="archive-detail-in mt-6 flex items-center gap-3 max-w-md">
              <button
                onClick={() => {
                  if (onSelectLookForBooking) onSelectLookForBooking(detailLook);
                  onOpenBooking();
                }}
                className="px-5 py-3 border border-[#1D1714] rounded-[2px] text-[11px] font-sans font-semibold uppercase tracking-[0.2em] text-[#1D1714] hover:bg-[#1D1714] hover:text-[#FAF7F2] transition-colors"
              >
                Book this look
              </button>
              <button
                onClick={(e) => toggleLike(detailLook.id, e)}
                aria-label={likedLooks[detailLook.id] ? 'Remove from favorites' : 'Save to favorites'}
                aria-pressed={!!likedLooks[detailLook.id]}
                className="w-11 h-11 rounded-full border border-[#D9D0C5] flex items-center justify-center text-[#1D1714] hover:border-[#C5A880] transition-colors"
              >
                <Heart
                  className={`w-4 h-4 ${likedLooks[detailLook.id] ? 'fill-[#C5A880] text-[#C5A880]' : ''}`}
                />
              </button>
            </div>
          </div>
        </div>
      )}
      </div>

      {/* Caption & Navigation Controls (hidden while a look is open; keeps its space on wide screens) */}
      <div
        aria-hidden={isDetailOpen}
        className={`max-w-3xl mx-auto px-5 text-center mt-2 relative z-20 space-y-4 transition-[opacity,visibility] duration-300 ${
          isDetailOpen ? 'opacity-0 invisible max-lg:hidden' : 'opacity-100 visible'
        }`}
      >
        {/* Caption Grid with Navigation Arrows */}
        <div className="flex items-center justify-center gap-6 sm:gap-12">
          {/* Left Arrow Button */}
          <button
            onClick={stepPrev}
            aria-label="Previous Bridal Look"
            className="w-11 h-11 rounded-full border border-[#D9D0C5] bg-[#FAF7F2] hover:bg-[#E7DFD6] text-[#1D1714] hover:text-[#9E7D53] transition-colors flex items-center justify-center shrink-0 shadow-sm"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          {/* Active Look Caption */}
          <div className="flex-1 space-y-2 min-w-0">
            <h3 className="font-serif text-2xl sm:text-3xl text-[#1D1714] font-medium tracking-tight truncate">
              {currentLook.title}
            </h3>

            <div className="w-8 h-[1px] bg-[#C5A880] mx-auto" />

            <p className="text-xs font-sans tracking-[0.18em] uppercase text-[#9E7D53]">
              Look {lookNumber(activeLookIndex)} of {ARCHIVE_LOOKS.length}
            </p>
          </div>

          {/* Right Arrow Button */}
          <button
            onClick={stepNext}
            aria-label="Next Bridal Look"
            className="w-11 h-11 rounded-full border border-[#D9D0C5] bg-[#FAF7F2] hover:bg-[#E7DFD6] text-[#1D1714] hover:text-[#9E7D53] transition-colors flex items-center justify-center shrink-0 shadow-sm"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>

        {/* Action button to inspect current look */}
        <div>
          <button
            onClick={() => openDetail(stateRef.current.T)}
            className="btn-gold px-6 py-2.5 rounded-full text-xs uppercase tracking-[0.15em] font-sans font-medium inline-flex items-center gap-2"
          >
            <span>Open Look</span>
            <Sparkles className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Timeline Ruler at bottom */}
        <div className="pt-4 max-w-xl mx-auto">
          <div className="relative h-9 flex items-center">
            {/* Horizontal timeline track */}
            <div className="absolute left-0 right-0 h-[1px] bg-[#C5A880]/40" />

            {/* Year ticks */}
            <div className="absolute inset-0 flex justify-between items-center pointer-events-none px-2">
              {ARCHIVE_LOOKS.map((item, idx) => {
                const isActive = idx === activeLookIndex;
                return (
                  <div
                    key={item.id}
                    className="flex flex-col items-center cursor-pointer pointer-events-auto"
                    onClick={() => {
                      // Glide to this look
                      const diff = idx - activeLookIndex;
                      stateRef.current.T = Math.round(stateRef.current.T + diff);
                    }}
                    title={item.title}
                  >
                    <div
                      className={`w-[1px] transition-all duration-300 ${
                        isActive ? 'h-4 bg-[#1D1714] w-[2px]' : 'h-2 bg-[#A89F93]'
                      }`}
                    />
                    <span
                      className={`text-[9px] font-sans mt-1.5 transition-colors ${
                        isActive ? 'font-bold text-[#1D1714]' : 'text-[#8E7D6B]'
                      }`}
                    >
                      {idx + 1}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Gliding dot */}
            <div
              className="absolute w-3 h-3 rounded-full bg-[#1D1714] border-2 border-[#FAF7F2] shadow-md transition-all duration-300 pointer-events-none -ml-1.5"
              style={{
                left: `${(activeLookIndex / (ARCHIVE_LOOKS.length - 1)) * 100}%`
              }}
            />
          </div>
        </div>
      </div>
    </section>
  );
};
