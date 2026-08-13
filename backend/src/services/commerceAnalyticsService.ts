import { prisma } from "../utils/prisma.js";

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return startOfDay(d);
}

export async function getCommerceAnalytics() {
  const now = new Date();
  const todayStart = startOfDay(now);
  const weekStart = daysAgo(7);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);

  const completed = await prisma.payment.findMany({
    where: { status: "completed" },
    include: {
      course: { select: { id: true, title: true, categoryId: true } },
      learningUniverse: { select: { id: true, title: true, categoryId: true } },
      user: { select: { id: true } },
    },
  });

  const failed = await prisma.payment.count({ where: { status: "failed" } });
  const refunded = await prisma.payment.findMany({ where: { status: "refunded" } });
  const pending = await prisma.payment.count({ where: { status: "pending" } });
  const totalAttempts = completed.length + failed + pending + refunded.length;

  const sumInRange = (from: Date) =>
    completed.filter((p) => p.createdAt >= from).reduce((s, p) => s + p.amount, 0);

  const courseSales = new Map<string, { id: string; title: string; revenue: number; count: number }>();
  const luSales = new Map<string, { id: string; title: string; revenue: number; count: number }>();
  const instructorSales = new Map<string, number>();
  const categorySales = new Map<string, number>();

  for (const p of completed) {
    if (p.instructorId) {
      instructorSales.set(p.instructorId, (instructorSales.get(p.instructorId) ?? 0) + p.amount);
    }
    if (p.course) {
      const cur = courseSales.get(p.course.id) || {
        id: p.course.id,
        title: p.course.title,
        revenue: 0,
        count: 0,
      };
      cur.revenue += p.amount;
      cur.count += 1;
      courseSales.set(p.course.id, cur);
      if (p.course.categoryId) {
        categorySales.set(p.course.categoryId, (categorySales.get(p.course.categoryId) ?? 0) + p.amount);
      }
    }
    if (p.learningUniverse) {
      const cur = luSales.get(p.learningUniverse.id) || {
        id: p.learningUniverse.id,
        title: p.learningUniverse.title,
        revenue: 0,
        count: 0,
      };
      cur.revenue += p.amount;
      cur.count += 1;
      luSales.set(p.learningUniverse.id, cur);
      if (p.learningUniverse.categoryId) {
        categorySales.set(
          p.learningUniverse.categoryId,
          (categorySales.get(p.learningUniverse.categoryId) ?? 0) + p.amount
        );
      }
    }
  }

  const topInstructorIds = [...instructorSales.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id]) => id);

  const instructors = topInstructorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: topInstructorIds } },
        select: { id: true, firstName: true, lastName: true, email: true },
      })
    : [];

  const categories = categorySales.size
    ? await prisma.category.findMany({
        where: { id: { in: [...categorySales.keys()] } },
        select: { id: true, name: true },
      })
    : [];

  const coupons = await prisma.coupon.findMany({ select: { code: true, usedCount: true, maxUses: true } });
  const couponUsage = coupons.reduce((s, c) => s + c.usedCount, 0);

  const ordersToday = await prisma.order.count({ where: { createdAt: { gte: todayStart } } });
  const enrollments = await prisma.enrollment.count();
  const conversionRate = enrollments > 0 ? Math.round((completed.length / enrollments) * 10000) / 100 : 0;

  const chartDays = 30;
  const chart: { date: string; revenue: number }[] = [];
  for (let i = chartDays - 1; i >= 0; i--) {
    const dayStart = daysAgo(i);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const revenue = completed
      .filter((p) => p.createdAt >= dayStart && p.createdAt < dayEnd)
      .reduce((s, p) => s + p.amount, 0);
    chart.push({ date: dayStart.toISOString().slice(0, 10), revenue });
  }

  const recentOrders = await prisma.order.findMany({
    take: 15,
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { firstName: true, lastName: true, email: true } },
      payment: { select: { status: true, amount: true } },
    },
  });

  return {
    revenue: {
      today: sumInRange(todayStart),
      week: sumInRange(weekStart),
      month: sumInRange(monthStart),
      year: sumInRange(yearStart),
      allTime: completed.reduce((s, p) => s + p.amount, 0),
    },
    topCourses: [...courseSales.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10),
    topLearningUniverses: [...luSales.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10),
    topInstructors: topInstructorIds.map((id) => ({
      ...instructors.find((u) => u.id === id),
      revenue: instructorSales.get(id) ?? 0,
    })),
    topCategories: categories
      .map((c) => ({ ...c, revenue: categorySales.get(c.id) ?? 0 }))
      .sort((a, b) => b.revenue - a.revenue),
    conversionRate,
    couponUsage,
    refundRate:
      completed.length > 0 ? Math.round((refunded.length / completed.length) * 10000) / 100 : 0,
    paymentSuccessRate:
      totalAttempts > 0 ? Math.round((completed.length / totalAttempts) * 10000) / 100 : 0,
    paymentFailureRate: totalAttempts > 0 ? Math.round((failed / totalAttempts) * 10000) / 100 : 0,
    ordersToday,
    revenueChart: chart,
    recentOrders,
    counts: {
      products: await prisma.product.count({ where: { published: true } }),
      coupons: coupons.length,
      refunds: refunded.length,
      pendingPayouts: await prisma.payoutWithdrawal.count({ where: { status: "pending" } }),
      bundles: await prisma.productBundle.count({ where: { published: true } }),
    },
  };
}

export function analyticsToCsv(analytics: Awaited<ReturnType<typeof getCommerceAnalytics>>): string {
  const lines = [
    "Metric,Value",
    `Today Revenue,${analytics.revenue.today}`,
    `Week Revenue,${analytics.revenue.week}`,
    `Month Revenue,${analytics.revenue.month}`,
    `Year Revenue,${analytics.revenue.year}`,
    `All Time Revenue,${analytics.revenue.allTime}`,
    `Conversion Rate,${analytics.conversionRate}%`,
    `Refund Rate,${analytics.refundRate}%`,
    `Payment Success,${analytics.paymentSuccessRate}%`,
    `Payment Failure,${analytics.paymentFailureRate}%`,
    "",
    "Top Courses",
    "Title,Revenue,Count",
    ...analytics.topCourses.map((c) => `"${c.title}",${c.revenue},${c.count}`),
  ];
  return lines.join("\n");
}
