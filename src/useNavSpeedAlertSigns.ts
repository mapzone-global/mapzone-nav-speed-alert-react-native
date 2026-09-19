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

  // Runs after each commit: everything delivered so far except the committed
  // value is stale. On unmount `current` itself is released by the cleanup.
  useEffect(() => {
    const stale = pending.current.filter((e) => e !== current);
    pending.current = current ? [current] : [];
    stale.forEach((e) => releaseAll(e, slots));
    return () => {
      if (current) releaseAll(current, slots);
    };
  }, [current, slots]);

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
