import type { EventSubscription } from 'expo-modules-core';
import { useEffect, useRef, useState } from 'react';

import type { AlertSignRef, RestrictionEvent, SignsEvent } from './NavSpeedAlert.types';
import NavSpeedAlertModule from './NavSpeedAlertModule';

const subscribeSigns = (l: (e: SignsEvent) => void) =>
  NavSpeedAlertModule.addListener('onSigns', l);
const subscribeRestriction = (l: (e: RestrictionEvent) => void) =>
  NavSpeedAlertModule.addListener('onRestriction', l);

// Module-level constants keep the effect deps stable.
const SIGN_SLOTS: (keyof SignsEvent)[] = ['current', 'next', 'camera', 'toll'];
const RESTRICTION_SLOTS: (keyof RestrictionEvent)[] = ['stop', 'closed', 'vehicle', 'bua', 'turn'];

function releaseAll<T>(event: T, slots: (keyof T)[]) {
  for (const slot of slots) {
    (event[slot] as AlertSignRef | null)?.release();
  }
}

/**
 * Keeps one event kind in state and releases the native image refs of every
 * delivered event once React has committed a newer one. Events that arrive
 * between two commits (batched) never become state, so they are tracked in a
 * ref and released together with the committed predecessor.
 */
function useLatestTick<T>(
  subscribe: (listener: (event: T) => void) => EventSubscription,
  slots: (keyof T)[]
): T | null {
  const [current, setCurrent] = useState<T | null>(null);
  const pending = useRef<T[]>([]);

  useEffect(() => {
    const sub = subscribe((event) => {
      pending.current.push(event);
      setCurrent(event);
    });
    return () => sub.remove();
  }, [subscribe]);

  // Runs after each commit: everything delivered *before* the committed value
  // is stale and is released exactly once here. Anything after it (an event
  // that landed between the commit and this effect) is left alone — it is
  // about to become `current` itself.
  useEffect(() => {
    if (!current) return;
    const idx = pending.current.indexOf(current);
    if (idx <= 0) return;
    pending.current.splice(0, idx).forEach((e) => releaseAll(e, slots));
  }, [current, slots]);

  // Unmount only (the subscription above is already removed by then): release
  // the committed value plus anything that arrived after the last commit.
  useEffect(
    () => () => {
      pending.current.forEach((e) => releaseAll(e, slots));
      pending.current = [];
    },
    [slots]
  );

  return current;
}

/**
 * Latest `onSigns` / `onRestriction` tick. Subscribing to `onRestriction`
 * here is what makes native start producing restriction signs; unmounting
 * stops it again.
 */
export function useNavSpeedAlertSigns(): {
  signs: SignsEvent | null;
  restriction: RestrictionEvent | null;
} {
  const signs = useLatestTick<SignsEvent>(subscribeSigns, SIGN_SLOTS);
  const restriction = useLatestTick<RestrictionEvent>(subscribeRestriction, RESTRICTION_SLOTS);
  return { signs, restriction };
}
