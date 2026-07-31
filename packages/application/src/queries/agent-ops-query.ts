import { prisma } from "@agentic-edu/db";

export async function getAgentOperationsOverview() {
  const [manifests, recommendations, evaluations, workerJobs, recentRuns] = await Promise.all([
    prisma.agentManifest.findMany({ orderBy: [{ agentType: "asc" }, { version: "desc" }] }),
    prisma.agentRecommendation.findMany({
      include: { agentRun: true, approvedBy: true },
      orderBy: { createdAt: "desc" },
      take: 25
    }),
    /*
     * More than one page's worth on purpose: the latest result per
     * (agentType, version, fixtureName) is computed below, and taking only 20
     * rows would silently drop fixtures once history accumulates — reporting a
     * pass rate over whichever fixtures happened to run most recently.
     */
    prisma.agentEvaluation.findMany({ orderBy: { createdAt: "desc" }, take: 500 }),
    prisma.backgroundJob.findMany({
      where: { status: { in: ["Queued", "Retrying", "Running", "Failed", "DeadLettered"] } },
      include: { workerLock: true },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      take: 25
    }),
    prisma.agentRun.findMany({ orderBy: { createdAt: "desc" }, take: 10 })
  ]);

  /*
   * The latest result per fixture, not every result ever recorded.
   *
   * agents:eval inserts a new row every run and never updates — regression over
   * time is the point of the table. But "is this agent healthy right now" is a
   * question about the most recent run of each fixture, and counting every
   * historical row would make a fixture that was fixed months ago keep dragging
   * the pass rate down forever.
   *
   * The rows arrive newest-first, so the first occurrence of each key is the
   * latest one.
   */
  const latestByFixture = new Map<string, (typeof evaluations)[number]>();
  for (const evaluation of evaluations) {
    const key = `${evaluation.agentType}::${evaluation.version}::${evaluation.fixtureName}`;
    if (!latestByFixture.has(key)) latestByFixture.set(key, evaluation);
  }
  const latestEvaluations = [...latestByFixture.values()];

  const failingAgentTypes = new Set(
    latestEvaluations.filter((evaluation) => !evaluation.passed).map((evaluation) => evaluation.agentType)
  );

  return {
    manifests,
    recommendations,
    evaluations,
    latestEvaluations,
    failingAgentTypes,
    workerJobs,
    recentRuns,
    metrics: {
      activeManifests: manifests.filter((manifest) => manifest.isActive).length,
      proposedRecommendations: recommendations.filter((recommendation) => recommendation.status === "Proposed").length,
      // Counted over the latest result per fixture, so a fixture that has since
      // been fixed stops being counted as failing.
      failedEvaluations: latestEvaluations.filter((evaluation) => !evaluation.passed).length,
      evaluatedFixtures: latestEvaluations.length,
      passRate:
        latestEvaluations.length === 0
          ? null
          : Math.round((latestEvaluations.filter((evaluation) => evaluation.passed).length / latestEvaluations.length) * 100),
      runnableJobs: workerJobs.filter((job) => job.status === "Queued" || job.status === "Retrying").length
    }
  };
}
