"use client";

import { useState } from "react";
import type { University } from "@/lib/data";

export function UniversityLogo({
  university,
  size = "card",
}: {
  university: University;
  size?: "card" | "row" | "hero";
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const fallback = university.shortName.replace(/[^А-ЯA-Z]/g, "").slice(0, 2);

  return (
    <span
      className={`official-university-logo ${size}`}
      style={{ "--university-color": university.color } as React.CSSProperties}
      title={`Логотип ${university.shortName} с официального сайта`}
    >
      {(!loaded || failed || !university.logoUrl) && (
        <b aria-label={university.shortName}>{fallback}</b>
      )}
      {!failed && university.logoUrl && (
        // Official university assets have different aspect ratios, so a native
        // img keeps their marks intact without Next Image transformations.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className={loaded ? "loaded" : ""}
          src={university.logoUrl}
          alt={`Логотип ${university.shortName}`}
          onError={() => setFailed(true)}
          onLoad={() => setLoaded(true)}
        />
      )}
    </span>
  );
}
