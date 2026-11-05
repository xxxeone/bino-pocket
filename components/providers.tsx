"use client";

import { listMyTrips, listTripMembers } from "@/lib/data";
import type { Profile, Trip, TripMember } from "@/lib/types";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ToastProvider } from "./ui";

interface AppCtx {
  profile: Profile;
  isReviewer: boolean;
  isAdmin: boolean;
  trips: Trip[];
  tripsLoading: boolean;
  trip: Trip | null;
  setTripId: (id: string) => void;
  refreshTrips: () => Promise<void>;
  /** The signed-in user's membership row for the current trip (cash rate lives here). */
  membership: TripMember | null;
  refreshMembership: () => Promise<void>;
}

const Ctx = createContext<AppCtx | null>(null);
export function useApp() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useApp outside AppProvider");
  return c;
}

const KEY = "bino.tripId";

export function AppProvider({ profile, children }: { profile: Profile; children: ReactNode }) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [tripsLoading, setTripsLoading] = useState(true);
  const [tripId, setTripIdState] = useState<string | null>(null);
  const [membership, setMembership] = useState<TripMember | null>(null);

  const refreshTrips = useCallback(
    () =>
      listMyTrips()
        .then((t) => {
          setTrips(t);
          setTripIdState((cur) => {
            const saved = cur ?? (typeof window !== "undefined" ? localStorage.getItem(KEY) : null);
            if (saved && t.some((x) => x.id === saved)) return saved;
            const active = t.find((x) => x.status === "active") ?? t[0];
            return active?.id ?? null;
          });
        })
        .catch(() => {})
        .then(() => setTripsLoading(false)),
    [],
  );

  useEffect(() => {
    void refreshTrips();
  }, [refreshTrips]);

  const setTripId = useCallback((id: string) => {
    setTripIdState(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {}
  }, []);

  const trip = useMemo(() => trips.find((t) => t.id === tripId) ?? null, [trips, tripId]);

  const refreshMembership = useCallback(
    () =>
      (tripId ? listTripMembers(tripId).catch(() => []) : Promise.resolve([])).then((members) =>
        setMembership(members.find((m) => m.user_id === profile.id) ?? null),
      ),
    [tripId, profile.id],
  );

  useEffect(() => {
    void refreshMembership();
  }, [refreshMembership]);

  const value: AppCtx = {
    profile,
    isReviewer: profile.role === "lead" || profile.role === "admin",
    isAdmin: profile.role === "admin",
    trips,
    tripsLoading,
    trip,
    setTripId,
    refreshTrips,
    membership,
    refreshMembership,
  };
  return (
    <Ctx value={value}>
      <ToastProvider>{children}</ToastProvider>
    </Ctx>
  );
}
