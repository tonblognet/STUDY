export type DataStatus =
  | "verified"
  | "not_published"
  | "pending_review"
  | "outdated"
  | "conflicting_sources"
  | "not_applicable";

export type SourceKind = "html" | "pdf" | "xlsx" | "csv" | "docx";

export type SourcedValue<T> = {
  value: T | null;
  year: number;
  status: DataStatus;
  sourceUrl: string;
  sourceName: string;
  sourceDocumentTitle?: string;
  sourcePage?: number;
  sourceSheet?: string;
  sourceRange?: string;
  sourceSection?: string;
  retrievedAt: string;
  checkedAt: string;
  checkedBy: string;
  nextReviewAt?: string;
  note?: string;
};

export type ExamRequirement = {
  id: string;
  subjects: string[];
  minimum: SourcedValue<number>;
  required: boolean;
  label: string;
};

export type HistoricalPoint = SourcedValue<number>;

export type ProgramTrust = {
  dataYear: number;
  status: DataStatus;
  completeness: number;
  checkedAt: string;
  checkedBy: string;
  nextReviewAt?: string;
  sourceName: string;
  sourceDocumentTitle?: string;
  sourcePage?: number;
  sourceSection?: string;
  note?: string;
};

export type ScoreSet = {
  id: string;
  name: string;
  scores: Record<string, number>;
  individualAchievements: number;
  dviScore?: number;
  updatedAt: string;
};

export type MatchCategory = "high" | "competitive" | "ambitious" | "insufficient";

export type MatchResult = {
  category: MatchCategory;
  consideredScore: number | null;
  passingScore: number | null;
  margin: number | null;
  trend: number | null;
  reasons: string[];
  missing: string[];
};
