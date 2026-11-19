import Link from "next/link";
import { educationTracks, type EducationTrack } from "@/lib/education-pathways";
import styles from "./education-pathway-navigation.module.css";

export function EducationPathwayNavigation({
  selected,
}: {
  selected: EducationTrack;
}) {
  return (
    <nav className={styles.navigation} aria-label="Уровень образования">
      {educationTracks.map((track) => (
        <Link
          key={track.key}
          href={
            track.key === "undergraduate"
              ? "/programs"
              : `/programs?track=${track.key}`
          }
          aria-current={track.key === selected ? "page" : undefined}
        >
          {track.label}
        </Link>
      ))}
    </nav>
  );
}
