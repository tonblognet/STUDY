-- Different faculties and profiles legitimately share a specialty code.
-- Keep the existing unique slug as the stable identity; retain indexed filtering.
DROP INDEX "EducationProgram_universityId_code_level_form_key";
CREATE INDEX "EducationProgram_universityId_code_level_form_idx"
  ON "EducationProgram"("universityId", "code", "level", "form");
