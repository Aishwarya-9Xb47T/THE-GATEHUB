import { prisma } from "../src/utils/prisma.js";
import { runLuPublishPipeline } from "../src/services/luProject/luPublishPipeline.js";

const projectId = "cmr1t3kgu00032biyhmh22894";
const universeId = "cmr1t3kg100012biy19hs4d1l";

async function main() {
  const project = await prisma.latexProject.findUnique({
    where: { id: projectId },
    select: { ownerId: true, title: true },
  });
  if (!project) {
    console.error("project not found");
    process.exit(1);
  }
  console.log("project:", project.title, "owner:", project.ownerId);

  const started = Date.now();
  const result = await runLuPublishPipeline({
    projectId,
    universeId,
    userId: project.ownerId,
    skipPdfCompile: true,
  });
  console.log("durationMs:", Date.now() - started);
  console.log("success:", result.success);

  if (!result.success) {
    for (const stage of result.stages.filter((s) => !s.success)) {
      console.log("FAILED STAGE:", stage.stage, stage.error);
    }
    for (const issue of result.issues.filter((i) => i.severity === "error").slice(0, 10)) {
      console.log("ISSUE:", issue.code, issue.message);
    }
  } else {
    console.log("universe id:", result.universe?.id);
  }
}

main()
  .catch((e) => {
    console.error("THREW:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
