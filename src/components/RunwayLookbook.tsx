/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';
import { RUNWAY_LOOKS } from '../data/portfolioData';

interface RunwayLookbookProps {
  onOpenBooking: () => void;
}

/** Wheel / trackpad swipe: this much travel (px) steps to the next look — one look per swipe. */
const SWIPE_STEP_PX = 18;
/** A pause this long (ms) between wheel events ends a swipe. */
const SWIPE_GAP_MS = 160;
/** Trackpad momentum keeps sending (decaying) wheel events after a swipe; a sharp surge only counts as a
    new swipe — and a still-spinning mouse wheel only steps again — once the last step has had this
    long (ms) to play out. */
const SWIPE_COOLDOWN_MS = 350;
/** Wheel events at least this big that aren't shrinking are mouse-wheel notches, not a momentum tail. */
const WHEEL_NOTCH_PX = 40;
/** A drag of at least this many px moves on to the next look when released. */
const DRAG_STEP_PX = 24;

export const RunwayLookbook: React.FC<RunwayLookbookProps> = ({ onOpenBooking }) => {
  const stageRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const rollRef = useRef<HTMLDivElement>(null);

  const [activeLookIndex, setActiveLookIndex] = useState(0);

  // Physics state
  const stateRef = useRef({
    p: 0,
    target: 0,
    lastTime: performance.now(),
    isDown: false,
    startX: 0,
    startTarget: 0,
    moved: 0,
    dragDx: 0,
    // Current wheel / trackpad swipe
    wheelAcc: 0,
    wheelDir: 0,
    wheelHorizontal: false,
    wheelLastTime: 0,
    wheelLastAbs: 0,
    wheelStepped: false,
    wheelOwned: false, // false: this swipe scrolls the page instead (vertical, past the first/last look)
    lastStepTime: 0,
    W: 800,
    H: 600,
    side: false,
  });

  /** Walk the shortest way round the (looping) line to look `idx`. */
  const goToLook = (idx: number) => {
    const N = RUNWAY_LOOKS.length;
    const current = Math.round(stateRef.current.target);
    let d = (((idx - current) % N) + N) % N;
    if (d > N / 2) d -= N;
    stateRef.current.target = current + d;
  };

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    let animId: number;
    const N = RUNWAY_LOOKS.length; // 6 looks

    // Depth table constants from specification
    const KX = [1.2, 0.744, 0.496, 0.346, 0.235, 0.15, 0.085];
    const KF = [1.14, 0.89, 0.777, 0.704, 0.651, 0.616, 0.59];
    const KH = [1.18, 0.832, 0.574, 0.436, 0.334, 0.258, 0.19];
    const KB = [0, 0, 1.5, 4, 8, 12, 17];
    const KO = [1, 1, 1, 1, 0.86, 0.5, 0];

    const wrap = (x: number, n: number) => ((x % n) + n) % n;
    const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

    const updateSize = () => {
      const rect = stage.getBoundingClientRect();
      stateRef.current.W = rect.width;
      stateRef.current.H = rect.height;
      stateRef.current.side = window.innerWidth <= 820;
    };

    updateSize();
    window.addEventListener('resize', updateSize);

    // Render loop
    const frame = (now: number) => {
      const state = stateRef.current;
      const dt = Math.min(50, now - state.lastTime);
      state.lastTime = now;

      // Exponential ease
      state.p += (state.target - state.p) * (1 - Math.exp(-dt * 0.0072));
      if (Math.abs(state.target - state.p) < 0.0004) {
        state.p = state.target;
      }

      const p = state.p;
      const W = state.W;
      const H = state.H;
      const baseHeight = H * 1.05;

      // Update models
      RUNWAY_LOOKS.forEach((_, i) => {
        const modelEl = document.getElementById(`runway-model-${i}`);
        if (!modelEl) return;

        let d = wrap(i - p, N);
        if (d > N - 1) d -= N;

        const k = clamp(d + 1, 0, 6);
        const a = Math.floor(k);
        const b = Math.min(6, a + 1);
        const t = k - a;

        const mix = (arr: number[]) => arr[a] + (arr[b] - arr[a]) * t;

        const h = mix(KH) * H;
        const s = h / baseHeight;
        const aspect = 3 / 4; // aspect ratio of image portrait
        const w = h * aspect;
        const x = mix(KX) * W - w / 2;
        const y = mix(KF) * H - h;

        modelEl.style.width = `${baseHeight * aspect}px`;
        modelEl.style.height = `${baseHeight}px`;
        modelEl.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${s.toFixed(4)})`;

        const blurPx = mix(KB) / Math.max(0.1, s);
        modelEl.style.filter = blurPx < 0.2 ? 'none' : `blur(${blurPx.toFixed(1)}px)`;
        modelEl.style.opacity = `${mix(KO).toFixed(3)}`;
        modelEl.style.zIndex = `${100 - Math.round(d * 10)}`;
      });

      // Update rolling look number
      const rollEl = rollRef.current;
      if (rollEl) {
        const lineHeight = 38;
        const offset = -wrap(p, N) * lineHeight;
        rollEl.style.transform = `translate3d(0, ${offset.toFixed(1)}px, 0)`;
      }

      // Update active look index
      const currIndex = Math.round(wrap(p, N)) % N;
      if (currIndex !== activeLookIndex) {
        setActiveLookIndex(currIndex);
      }

      animId = requestAnimationFrame(frame);
    };

    animId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', updateSize);
    };
  }, [activeLookIndex]);

  // Wheel and trackpad: one swipe (or wheel notch) = one look. Native listener because React's wheel
  // handlers are passive, and preventDefault is needed to hold the page still while the looks change.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const N = RUNWAY_LOOKS.length;

    const onWheel = (e: WheelEvent) => {
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? stage.clientWidth : 1;
      const dx = e.deltaX * unit;
      const dy = e.deltaY * unit;
      const horizontal = Math.abs(dx) > Math.abs(dy);
      // The line walks left → right, so horizontal swipes follow the fingers: a swipe to the right (deltaX < 0
      // with natural scrolling) brings the next look, same as dragging right. Vertical scrolling and
      // Shift+wheel follow the wheel: down = next.
      const dir = horizontal ? (e.shiftKey ? Math.sign(dx) : -Math.sign(dx)) : Math.sign(dy);
      const abs = Math.abs(horizontal ? dx : dy);
      if (dir === 0) return;

      const s = stateRef.current;
      // When the event was generated, not handled: if the page stalls mid-swipe, queued events still
      // read as one continuous swipe instead of several.
      const now = e.timeStamp || performance.now();
      const sinceStep = now - s.lastStepTime;
      // New swipe after a pause, on a change of direction or axis, or on a sharp surge once the last step has
      // played out (momentum only decays, so a surge means the fingers are moving again).
      const isNewSwipe =
        now - s.wheelLastTime > SWIPE_GAP_MS ||
        dir !== s.wheelDir ||
        horizontal !== s.wheelHorizontal ||
        (sinceStep > SWIPE_COOLDOWN_MS && abs > s.wheelLastAbs * 2 + 4);
      // A mouse wheel that keeps spinning sends steady full notches (not a shrinking momentum tail).
      const isRepeatNotch =
        !isNewSwipe && s.wheelStepped && sinceStep > SWIPE_COOLDOWN_MS && abs >= WHEEL_NOTCH_PX && abs >= s.wheelLastAbs;
      s.wheelDir = dir;
      s.wheelHorizontal = horizontal;
      s.wheelLastTime = now;
      s.wheelLastAbs = abs;

      if (isNewSwipe || isRepeatNotch) {
        s.wheelAcc = 0;
        s.wheelStepped = false;
        // Vertical scrolling walks through the looks, then hands back to the page past either end, so a
        // visitor scrolling down the page isn't held in the (looping) runway.
        const idx = (((Math.round(s.target) % N) + N) % N);
        s.wheelOwned = horizontal || (dir > 0 ? idx < N - 1 : idx > 0);
      }
      if (!s.wheelOwned) return; // let the page scroll
      e.preventDefault();

      s.wheelAcc += abs;

      if (!s.wheelStepped && s.wheelAcc >= SWIPE_STEP_PX) {
        s.wheelStepped = true;
        s.lastStepTime = now;
        s.target = Math.round(s.target) + dir;
      }
    };

    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, []);

  // Pointer drag on stage
  const handlePointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('a')) return;
    stateRef.current.isDown = true;
    stateRef.current.startX = e.clientX;
    stateRef.current.startTarget = stateRef.current.target;
    stateRef.current.moved = 0;
    stateRef.current.dragDx = 0;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!stateRef.current.isDown) return;
    const dx = e.clientX - stateRef.current.startX;
    stateRef.current.dragDx = dx;
    stateRef.current.moved = Math.max(stateRef.current.moved, Math.abs(dx));
    const pull = Math.max(150, stateRef.current.W * 0.25);
    stateRef.current.target = stateRef.current.startTarget + dx / pull;
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!stateRef.current.isDown) return;
    stateRef.current.isDown = false;

    if (stateRef.current.moved < 6) {
      // Clicked on a model
      const hit = (document.elementsFromPoint(e.clientX, e.clientY) as HTMLElement[]).find(
        el => el.classList && el.classList.contains('runway-model-card')
      );
      if (hit && hit.dataset.index) {
        const clickedIndex = parseInt(hit.dataset.index, 10);
        const N = RUNWAY_LOOKS.length;
        let d = ((clickedIndex - stateRef.current.target) % N + N) % N;
        d = Math.round(d);
        if (d > 0 && d < N) {
          stateRef.current.target = Math.round(stateRef.current.target) + d;
        }
      } else {
        stateRef.current.target = Math.round(stateRef.current.target);
      }
    } else {
      // Settle in the drag direction: a short deliberate drag moves on one look; on longer drags,
      // a third of a look past the last whole one carries on to the next.
      // (Uses the last pointermove distance — pointercancel events can report clientX 0.)
      const s = stateRef.current;
      const base = Math.round(s.startTarget);
      const travelled = s.target - base;
      const whole = Math.trunc(travelled);
      const rest = travelled - whole;
      s.target =
        whole === 0
          ? base + (Math.abs(s.dragDx) >= DRAG_STEP_PX ? Math.sign(travelled) : 0)
          : base + whole + (Math.abs(rest) >= 0.3 ? Math.sign(rest) : 0);
    }
  };

  const stepNext = () => {
    stateRef.current.target = Math.round(stateRef.current.target) + 1;
  };

  const stepPrev = () => {
    stateRef.current.target = Math.round(stateRef.current.target) - 1;
  };

  const currentLook = RUNWAY_LOOKS[activeLookIndex] || RUNWAY_LOOKS[0];

  return (
    <section
      id="runway-lookbook"
      className="relative py-20 bg-[#F4EFEA] border-t border-[#E7DFD6] overflow-hidden"
      aria-label="Our Signature Looks"
    >
      <div className="max-w-7xl mx-auto px-5 sm:px-8">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-10 border-b border-[#E7DFD6]">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 text-xs font-sans tracking-[0.2em] uppercase text-[#9E7D53]">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Lookbook · 6 Looks</span>
            </div>
            <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl text-[#1D1714]">
              Our Signature Looks
            </h2>
            <p className="text-xs sm:text-sm text-[#6A5F56] max-w-xl font-sans">
              Swipe, scroll or use the arrows to see each look up close.
            </p>
          </div>

          {/* Quick Step Buttons */}
          <div className="flex items-center gap-3">
            <button
              onClick={stepPrev}
              className="w-11 h-11 rounded-full border border-[#D9D0C5] bg-[#FAF7F2] hover:bg-[#E7DFD6] text-[#1D1714] flex items-center justify-center transition-colors shadow-xs"
              aria-label="Previous Runway Look"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <button
              onClick={stepNext}
              className="w-11 h-11 rounded-full border border-[#D9D0C5] bg-[#FAF7F2] hover:bg-[#E7DFD6] text-[#1D1714] flex items-center justify-center transition-colors shadow-xs"
              aria-label="Next Runway Look"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Main Stage & Product Rail Grid */}
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          {/* Left / Center 3D Runway Stage */}
          <div
            ref={stageRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="lg:col-span-8 relative h-[480px] sm:h-[560px] rounded-2xl overflow-hidden cursor-grab active:cursor-grabbing select-none touch-pan-y border border-[#E7DFD6] bg-gradient-to-r from-[#FAF7F2] via-[#EFECE6] to-[#FAF7F2] shadow-inner"
          >
            {/* Ambient Haze Layer */}
            <div className="absolute inset-0 bg-gradient-to-t from-white/40 via-transparent to-transparent pointer-events-none z-10" />

            {/* Model Depth Stage Container */}
            <div className="absolute inset-0">
              {RUNWAY_LOOKS.map((item, idx) => (
                <div
                  key={item.id}
                  id={`runway-model-${idx}`}
                  data-index={idx}
                  className="runway-model-card absolute left-0 top-0 origin-top-left will-change-transform cursor-pointer"
                >
                  {/* Soft elliptical floor shadow below feet */}
                  <div
                    className="absolute bottom-[-1.5%] left-[8%] right-[8%] h-[3.8%] rounded-full pointer-events-none"
                    style={{
                      background: 'radial-gradient(closest-side, rgba(40, 32, 20, 0.28), transparent)'
                    }}
                  />

                  {/* Model Artwork Container */}
                  <div className="relative w-full h-full rounded-2xl overflow-hidden shadow-2xl border border-[#D9D0C5] bg-[#1D1714]">
                    <img
                      src={item.image}
                      alt={item.title}
                      className="w-full h-full object-cover object-top select-none pointer-events-none"
                      referrerPolicy="no-referrer"
                    />

                    {/* Gradient scrim — only behind the caption so the photo stays clear */}
                    <div className="absolute inset-x-0 bottom-0 h-[32%] bg-gradient-to-t from-[#1D1714]/85 via-[#1D1714]/35 to-transparent" />

                    {/* Card overlay info */}
                    <div className="absolute bottom-5 left-5 right-5 text-white space-y-1">
                      <p className="text-[10px] uppercase font-sans tracking-[0.2em] text-[#C5A880]">
                        Look {item.lookNum}
                      </p>
                      <h4 className="font-serif text-xl sm:text-2xl font-medium leading-tight">
                        {item.title}
                      </h4>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Rolling Look Number Counter at bottom-left */}
            <div className="absolute bottom-6 left-6 z-[150] bg-[#FAF7F2]/90 backdrop-blur-md px-5 py-3 rounded-xl border border-[#E7DFD6] shadow-lg flex items-center gap-3">
              <span className="text-xs font-sans tracking-[0.2em] uppercase text-[#9E7D53] font-bold">
                Look
              </span>
              <div className="h-[38px] overflow-hidden">
                <div ref={rollRef} className="will-change-transform font-serif text-3xl font-medium text-[#1D1714]">
                  {RUNWAY_LOOKS.map(look => (
                    <div key={look.id} className="h-[38px] flex items-center">
                      {look.lookNum}
                    </div>
                  ))}
                  {/* Duplicate first item for loop transition */}
                  <div className="h-[38px] flex items-center">
                    {RUNWAY_LOOKS[0].lookNum}
                  </div>
                </div>
              </div>
            </div>

            {/* Instruction tooltip. Bottom-right, clear of the front photo; z above the photos (they use z-index up to
                ~110), which used to hide it at the top-right. */}
            <div className="absolute bottom-6 right-6 z-[150] hidden sm:block bg-[#FAF7F2]/80 backdrop-blur-sm px-3.5 py-1.5 rounded-full border border-[#E7DFD6] text-[10px] font-sans tracking-[0.12em] uppercase text-[#6A5F56]">
              Drag horizontal to walk the line
            </div>
          </div>

          {/* Right Column: Synced Beauty Elements & Products Rail */}
          <div
            ref={railRef}
            className="lg:col-span-4 bg-[#FAF7F2] rounded-2xl border border-[#E7DFD6] p-6 flex flex-col justify-between space-y-6 shadow-sm"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#E7DFD6]">
                <div>
                  <span className="text-[10px] font-sans uppercase tracking-[0.2em] text-[#9E7D53]">
                    Now Showing
                  </span>
                  <h3 className="font-serif text-2xl text-[#1D1714] font-medium">
                    {currentLook.title}
                  </h3>
                </div>
                <span className="text-xs font-sans font-bold px-2.5 py-1 bg-[#F4EFEA] border border-[#C5A880] rounded-full text-[#1D1714] shrink-0">
                  {currentLook.lookNum} / {String(RUNWAY_LOOKS.length).padStart(2, '0')}
                </span>
              </div>

              {/* All looks: tap one to bring it to the front */}
              <ol className="space-y-1.5">
                {RUNWAY_LOOKS.map((look, idx) => {
                  const isActive = idx === activeLookIndex;
                  return (
                    <li key={look.id}>
                      <button
                        type="button"
                        onClick={() => goToLook(idx)}
                        aria-current={isActive ? 'true' : undefined}
                        className={`w-full flex items-center gap-3 p-2 rounded-xl border text-left transition-colors ${
                          isActive ? 'bg-white border-[#C5A880] shadow-xs' : 'border-transparent hover:bg-white/70'
                        }`}
                      >
                        <img
                          src={look.image}
                          alt=""
                          aria-hidden="true"
                          loading="lazy"
                          className="w-10 h-12 rounded-lg object-cover object-top shrink-0"
                        />
                        <span className="text-[10px] font-sans font-bold tracking-wider text-[#9E7D53]">
                          {look.lookNum}
                        </span>
                        <span className={`text-xs font-sans ${isActive ? 'font-semibold text-[#1D1714]' : 'text-[#4A3F38]'}`}>
                          {look.title}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>

            {/* Direct Action */}
            <div className="pt-4 border-t border-[#E7DFD6]">
              <button
                onClick={onOpenBooking}
                className="w-full btn-gold py-3 rounded-full text-xs uppercase tracking-[0.14em] font-sans font-medium text-center block"
              >
                Inquire For Look {currentLook.lookNum}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
