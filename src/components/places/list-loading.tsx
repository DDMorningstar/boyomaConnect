import { PlaceCardSkeleton } from "@/components/places/place-card";

export default function Loading() {
  return (
    <div className="space-y-3 py-6" aria-busy="true" aria-label="Chargement">
      <div className="skeleton h-8 w-1/2 rounded-lg" />
      {Array.from({ length: 5 }, (_, i) => (
        <PlaceCardSkeleton key={i} />
      ))}
    </div>
  );
}
