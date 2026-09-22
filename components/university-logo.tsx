"use client";

import { useCallback, useState } from "react";
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
  // A cached image may finish before React hydrates and attaches onLoad.
  const imageRef = useCallback((node: HTMLImageElement | null) => {
    if (node?.complete && node.naturalWidth > 0) setLoaded(true);
  }, []);
  const fallback = university.shortName.replace(/[^А-ЯA-Z]/g, "").slice(0, 2);

  return (
    <span
      className={`official-university-logo ${size}`}
      style={
        {
          "--university-color": university.color,
          backgroundColor: university.logoBackground,
        } as React.CSSProperties
      }
      title={
        university.logoUrl
          ? `Логотип ${university.shortName} с официального сайта`
          : `${university.shortName}: логотип пока не получен`
      }
    >
      {(!loaded || failed || !university.logoUrl) && (
        <b aria-label={university.shortName}>{fallback}</b>
      )}
      {!failed && university.logoUrl && (
        // Official university assets have different aspect ratios, so a native
        // img keeps their marks intact without Next Image transformations.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imageRef}
          className={loaded ? "loaded" : ""}
          src={university.logoUrl}
          loading={size === "hero" ? "eager" : "lazy"}
          alt={`Логотип ${university.shortName}`}
          onError={() => setFailed(true)}
          onLoad={() => setLoaded(true)}
        />
      )}
    </span>
  );
}
