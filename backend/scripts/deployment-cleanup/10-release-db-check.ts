import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

async function main() {
  const counts = {
    users: await p.user.count(),
    courses: await p.course.count(),
    lus: await p.learningUniverse.count(),
    products: await p.product.count(),
    quizzes: await p.quiz.count(),
    presentations: await p.presentation.count(),
    enrollments: await p.enrollment.count(),
    luEnrollments: await p.learningUniverseEnrollment.count(),
    certs: await p.learningUniverseCertificate.count(),
    payments: await p.payment.count(),
  };
  const hist = await p.learningUniverseCertificate.findFirst({
    where: { certificateId: "GH-CERT-2026-000012" },
  });
  const users = await p.user.findMany({ select: { email: true, role: true } });

  // unique index check
  const indexes = await p.$queryRawUnsafe<any[]>(
    `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'LearningUniverseCertificate' ORDER BY indexname`
  );

  // orphan checks (empty DB should be clean)
  const orphanProducts = await p.product.findMany({
    where: { AND: [{ courseId: null }, { learningUniverseId: null }] },
    select: { id: true },
  });

  console.log(
    JSON.stringify(
      {
        counts,
        historicalCert: hist ? "EXISTS" : "MISSING",
        users,
        certIndexes: indexes,
        orphanProducts: orphanProducts.length,
      },
      null,
      2
    )
  );
}

main().finally(() => p.$disconnect());
