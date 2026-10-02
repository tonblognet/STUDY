import type { MatchResult } from "@/lib/admissions/types";
import { ELIGIBILITY_LABELS, MATCH_LABELS } from "@/lib/admissions/constants";

export function MatchExplanation({ match }: { match: MatchResult }) {
  return (
    <div className="match-explanation">
      <strong>{ELIGIBILITY_LABELS[match.eligibility]}</strong>
      {match.blockers.map((reason) => (
        <p className="missing" key={reason}>
          {reason}
        </p>
      ))}
      {match.requirementsMissing.map((reason) => (
        <p className="missing" key={reason}>
          {reason}
        </p>
      ))}
      {match.reasons.map((reason) => (
        <p key={reason}>{reason}</p>
      ))}
      <strong>{MATCH_LABELS[match.category]}</strong>
      {match.comparisonMissing.map((reason) => (
        <p className="missing" key={reason}>
          {reason}
        </p>
      ))}
    </div>
  );
}
