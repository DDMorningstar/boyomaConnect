import type { Metadata } from "next";
import { NearbyClient } from "./nearby-client";

export const metadata: Metadata = { title: "À proximité", robots: { index: false } };

export default function NearbyPage() {
  return (
    <div className="pt-5">
      <h1 className="text-2xl font-extrabold tracking-tight">À proximité</h1>
      <p className="text-muted mt-1 text-sm">
        Les lieux publiés autour de vous. Distances à vol d&apos;oiseau.
      </p>
      <NearbyClient />
    </div>
  );
}
