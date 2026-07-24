export interface RubricCriterionInput {
  id: string;
  title: string;
  pointsPossible: number;
}

export interface CriterionScoreInput {
  criterionId: string;
  score: number;
}

export interface RubricScoreSummary {
  totalScore: number;
  totalPossible: number;
  percentage: number | null;
  missingCriterionIds: string[];
  invalidScores: Array<{ criterionId: string; reason: string }>;
}

export function calculateRubricScore(criteria: RubricCriterionInput[], scores: CriterionScoreInput[]): RubricScoreSummary {
  const scoreByCriterion = new Map(scores.map((score) => [score.criterionId, score.score]));
  const invalidScores: RubricScoreSummary["invalidScores"] = [];
  const missingCriterionIds: string[] = [];
  let totalScore = 0;
  let totalPossible = 0;

  for (const criterion of criteria) {
    totalPossible += criterion.pointsPossible;
    const score = scoreByCriterion.get(criterion.id);

    if (score === undefined) {
      missingCriterionIds.push(criterion.id);
      continue;
    }

    if (score < 0 || score > criterion.pointsPossible) {
      invalidScores.push({
        criterionId: criterion.id,
        reason: `${criterion.title} score must be between 0 and ${criterion.pointsPossible}.`
      });
      continue;
    }

    totalScore += score;
  }

  return {
    totalScore,
    totalPossible,
    percentage: totalPossible > 0 ? (totalScore / totalPossible) * 100 : null,
    missingCriterionIds,
    invalidScores
  };
}

export function rubricRequiresTeacherReview(summary: RubricScoreSummary): boolean {
  return summary.invalidScores.length > 0 || summary.missingCriterionIds.length > 0;
}
