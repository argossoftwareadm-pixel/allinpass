import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const CARD_MAX_WIDTH = 340;
const CARD_GAP = 14;
const SPOTLIGHT_PADDING = 8;

function isVisible(element) {
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  const style = window.getComputedStyle(element);
  return style.visibility !== 'hidden' && style.display !== 'none';
}

// target: function | { selector, text, tag, within, closest, up }
export function resolveTarget(target) {
  if (!target || typeof document === 'undefined') return null;
  if (typeof target === 'function') return target();
  const { selector, text, tag = '*', within = 'body', closest, up = 0 } = target;
  const root = document.querySelector(within) || document.body;
  let candidates = [];
  if (selector) {
    candidates = Array.from(root.querySelectorAll(selector));
  } else if (text) {
    const wanted = String(text).trim().toLowerCase();
    candidates = Array.from(root.querySelectorAll(tag)).filter(
      (el) => String(el.textContent || '').trim().toLowerCase() === wanted,
    );
  }
  for (const candidate of candidates) {
    let el = candidate;
    if (closest) el = el.closest(closest) || el;
    for (let i = 0; i < up && el?.parentElement; i += 1) el = el.parentElement;
    if (isVisible(el)) return el;
  }
  return null;
}

function computeCardPosition(rect, cardHeight) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(CARD_MAX_WIDTH, vw - 24);
  if (!rect) return { width, left: (vw - width) / 2, top: Math.max(12, (vh - cardHeight) / 2) };
  const clampLeft = (value) => Math.min(Math.max(12, value), vw - width - 12);
  const centeredLeft = clampLeft(rect.left + rect.width / 2 - width / 2);
  if (rect.bottom + CARD_GAP + cardHeight <= vh - 12) return { width, left: centeredLeft, top: rect.bottom + CARD_GAP };
  if (rect.top - CARD_GAP - cardHeight >= 12) return { width, left: centeredLeft, top: rect.top - CARD_GAP - cardHeight };
  if (rect.right + CARD_GAP + width <= vw - 12) {
    return { width, left: rect.right + CARD_GAP, top: Math.min(Math.max(12, rect.top), vh - cardHeight - 12) };
  }
  if (rect.left - CARD_GAP - width >= 12) {
    return { width, left: rect.left - CARD_GAP - width, top: Math.min(Math.max(12, rect.top), vh - cardHeight - 12) };
  }
  return { width, left: clampLeft((vw - width) / 2), top: Math.max(12, vh - cardHeight - 12) };
}

const OnboardingTour = ({ open, steps, onClose }) => {
  const [stepIndex, setStepIndex] = useState(0);
  const [targetEl, setTargetEl] = useState(null);
  const [targetRect, setTargetRect] = useState(null);
  const [cardHeight, setCardHeight] = useState(220);
  const cardRef = useRef(null);
  const step = open ? steps[stepIndex] : null;
  const isLast = stepIndex === steps.length - 1;

  useEffect(() => {
    if (open) setStepIndex(0);
  }, [open]);

  const close = useCallback((completed) => {
    setTargetEl(null);
    setTargetRect(null);
    onClose?.(completed);
  }, [onClose]);

  const goTo = useCallback((index) => {
    if (index >= steps.length) {
      close(true);
      return;
    }
    setStepIndex(Math.max(0, index));
  }, [close, steps.length]);

  useEffect(() => {
    if (!step) return undefined;
    setTargetEl(null);
    setTargetRect(null);
    if (!step.target) return undefined;
    let cancelled = false;
    const startedAt = Date.now();
    const find = () => {
      if (cancelled) return;
      const el = resolveTarget(step.target);
      if (el) {
        el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
        setTargetEl(el);
        return;
      }
      if (Date.now() - startedAt < (step.waitMs ?? 3000)) window.setTimeout(find, 150);
    };
    find();
    return () => {
      cancelled = true;
    };
  }, [step]);

  useEffect(() => {
    if (!open) return undefined;
    let frame;
    const track = () => {
      if (targetEl && document.body.contains(targetEl)) {
        const r = targetEl.getBoundingClientRect();
        setTargetRect((prev) => (
          prev && prev.top === r.top && prev.left === r.left && prev.width === r.width && prev.height === r.height
            ? prev
            : { top: r.top, left: r.left, width: r.width, height: r.height, right: r.right, bottom: r.bottom }
        ));
      } else {
        setTargetRect(null);
      }
      frame = window.requestAnimationFrame(track);
    };
    frame = window.requestAnimationFrame(track);
    return () => window.cancelAnimationFrame(frame);
  }, [open, targetEl]);

  useEffect(() => {
    if (!step?.advanceWhen) return undefined;
    const interval = window.setInterval(() => {
      if (step.advanceWhen()) goTo(stepIndex + 1);
    }, 250);
    return () => window.clearInterval(interval);
  }, [goTo, stepIndex, step]);

  useLayoutEffect(() => {
    if (cardRef.current) setCardHeight(cardRef.current.offsetHeight);
  }, [stepIndex, targetRect, open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') close(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close, open]);

  if (!open || !step || typeof document === 'undefined') return null;

  const handleNext = () => {
    if (step.onNext) step.onNext({ target: targetEl });
    if (step.advanceWhen && !step.advanceWhen()) return;
    goTo(stepIndex + 1);
  };

  const position = computeCardPosition(targetRect, cardHeight);
  const maxTop = Math.max(12, window.innerHeight - cardHeight - 12);
  const cardStyle = { ...position, top: Math.min(Math.max(12, position.top), maxTop) };
  const spotlight = targetRect
    ? {
      top: targetRect.top - SPOTLIGHT_PADDING,
      left: targetRect.left - SPOTLIGHT_PADDING,
      width: targetRect.width + SPOTLIGHT_PADDING * 2,
      height: targetRect.height + SPOTLIGHT_PADDING * 2,
    }
    : null;

  return createPortal(
    <div className="fixed inset-0 z-[300]" aria-live="polite">
      {spotlight ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed rounded-xl ring-2 ring-purple-400 transition-all duration-200 ease-out"
          style={{ ...spotlight, boxShadow: '0 0 0 9999px rgba(17, 12, 40, 0.55)' }}
        />
      ) : (
        <div aria-hidden="true" className="fixed inset-0 bg-[rgba(17,12,40,0.55)]" />
      )}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby="onboarding-tour-title"
        className="fixed rounded-2xl border border-purple-100 bg-white p-5 text-slate-900 shadow-2xl transition-[top,left] duration-200 ease-out"
        style={{ top: cardStyle.top, left: cardStyle.left, width: cardStyle.width }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {step.eyebrow ? (
              <p className="text-[11px] font-bold uppercase tracking-wide text-purple-600">{step.eyebrow}</p>
            ) : null}
            <h2 id="onboarding-tour-title" className="mt-0.5 text-base font-bold leading-snug">{step.title}</h2>
          </div>
          <button
            type="button"
            onClick={() => close(false)}
            aria-label="Fechar tutorial"
            className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{step.body}</p>
        {step.hint ? (
          <p className="mt-2 rounded-lg bg-purple-50 px-3 py-2 text-xs font-medium text-purple-800">{step.hint}</p>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <span className="text-xs font-medium tabular-nums text-slate-400">{stepIndex + 1} / {steps.length}</span>
          <div className="flex shrink-0 items-center gap-2">
            {step.secondaryLabel ? (
              <button
                type="button"
                onClick={() => close(false)}
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
              >
                {step.secondaryLabel}
              </button>
            ) : stepIndex > 0 && !step.hideBack ? (
              <button
                type="button"
                onClick={() => goTo(stepIndex - 1)}
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
              >
                Voltar
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleNext}
              className="rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:from-purple-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-purple-300"
            >
              {step.nextLabel || (isLast ? 'Concluir' : 'Próximo')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default OnboardingTour;
