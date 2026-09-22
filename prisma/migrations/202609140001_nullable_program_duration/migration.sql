-- Unknown duration must remain unknown instead of NaN or an invented default.
ALTER TABLE "EducationProgram" ALTER COLUMN "durationMonths" DROP NOT NULL;
