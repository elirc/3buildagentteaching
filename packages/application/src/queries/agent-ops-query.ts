import { prisma } from "@agentic-edu/db";

export async function getAgentOperationsOverview() {
  const [manifests, recommendations, evaluations, workerJobs, recentRuns] = await Promise.all([
    prisma.agentManifest.findMany({ orderBy: [{ agentType: "asc" }, { version: "desc" }] }),
    prisma.agentRecommendation.findMany({
      include: { agentRun: true, approvedBy: true },
      orderBy: { createdAt: "desc" },
      take: 25
    }),
    prisma.agentEvaluation.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.backgroundJob.findMany({
      where: { status: { in: ["Queued", "Retrying", "Running", "Failed", "DeadLettered"] } },
      include: { workerLock: true },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      take: 25
    }),
    prisma.agentRun.findMany({ orderBy: { createdAt: "desc" }, take: 10 })
  ]);

  return {
    manifests,
    recommendations,
    evaluations,
    workerJobs,
    recentRuns,
    metrics: {
      activeManifests: manifests.filter((manifest) => manifest.isActive).length,
      proposedRecommendations: recommendations.filter((recommendation) => recommendation.status === "Proposed").length,
      failedEvaluations: evaluations.filter((evaluation) => !evaluation.passed).length,
      runnableJobs: workerJobs.filter((job) => job.status === "Queued" || job.status === "Retrying").length
    }
  };
}
