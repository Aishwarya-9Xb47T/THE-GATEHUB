/**
 * Analytics Service
 * Real-time and post-class analytics for Interactive Classroom Studio
 */

import { prisma } from '../../utils/prisma.js';
import { AppError } from '../../middlewares/errorHandler.js';

export interface RealTimeAnalytics {
  sessionId: string;
  totalParticipants: number;
  activeParticipants: number;
  currentSlideId?: string;
  activeInteractionId?: string;
  totalResponses: number;
  averageResponseTime?: number;
  participationRate?: number;
  accuracyRate?: number;
  engagementScore?: number;
  raisedHands: number;
  recentActivity: Array<{
    type: string;
    timestamp: Date;
    participantId?: string;
  }>;
}

export interface SlideAnalytics {
  slideId: string;
  slideOrder: number;
  viewCount: number;
  averageViewDuration: number;
  interactionCount: number;
  totalResponses: number;
  participationRate: number;
  averageScore: number;
  confusionScore: number;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface SessionReport {
  sessionId: string;
  sessionTitle: string;
  instructorName: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  totalParticipants: number;
  peakParticipants: number;
  averageEngagement: number;
  totalSlides: number;
  slidesCompleted: number;
  totalInteractions: number;
  totalResponses: number;
  averageAccuracy: number;
  mostEngagedSlide: string;
  leastEngagedSlide: string;
  fastestResponder: string;
  slowestResponder: string;
  participantBreakdown: {
    joined: number;
    left: number;
    raisedHands: number;
  };
  interactionBreakdown: Record<string, number>;
  timeline: Array<{
    timestamp: Date;
    slideId?: string;
    interactionId?: string;
    participantCount: number;
  }>;
}

export async function getRealTimeAnalytics(sessionId: string): Promise<RealTimeAnalytics> {
  const session = await prisma.classroomSession.findUnique({
    where: { id: sessionId },
    include: {
      analytics: true,
      participants: true,
      responses: {
        orderBy: { submittedAt: 'desc' },
        take: 10,
      },
    },
  });

  if (!session) {
    throw new AppError(404, 'Session not found');
  }

  const totalParticipants = session.participants.length;
  const activeParticipants = session.participants.filter((p) => p.status === 'online').length;
  const raisedHands = session.participants.filter((p) => p.raisedHand).length;

  const recentActivity = session.responses.map((response) => ({
    type: 'response',
    timestamp: response.submittedAt,
    participantId: response.participantId,
  }));

  return {
    sessionId: session.id,
    totalParticipants,
    activeParticipants,
    currentSlideId: session.currentSlideId || undefined,
    activeInteractionId: session.activeInteractionId || undefined,
    totalResponses: session.analytics?.totalResponses || 0,
    averageResponseTime: session.analytics?.averageResponseTime ?? undefined,
    participationRate: session.analytics?.participationRate ?? undefined,
    accuracyRate: session.analytics?.accuracyRate ?? undefined,
    engagementScore: session.analytics?.engagementScore ?? undefined,
    raisedHands,
    recentActivity,
  };
}

export async function updateRealTimeAnalytics(sessionId: string): Promise<void> {
  const session = await prisma.classroomSession.findUnique({
    where: { id: sessionId },
    include: {
      participants: true,
      responses: true,
    },
  });

  if (!session) return;

  const totalParticipants = session.participants.length;
  const activeParticipants = session.participants.filter((p) => p.status === 'online').length;
  const totalResponses = session.responses.length;

  // Calculate average response time
  const responseTimes = session.responses
    .map((r) => r.duration)
    .filter((d): d is number => d !== null && d !== undefined);
  const averageResponseTime =
    responseTimes.length > 0 ? responseTimes.reduce((sum, d) => sum + d, 0) / responseTimes.length : 0;

  // Calculate participation rate
  const participationRate = totalParticipants > 0 ? (totalResponses / totalParticipants) * 100 : 0;

  // Calculate accuracy rate
  const correctResponses = session.responses.filter((r) => r.isCorrect === true).length;
  const accuracyRate =
    session.responses.length > 0 ? (correctResponses / session.responses.length) * 100 : 0;

  // Calculate engagement score
  const engagementScore = calculateEngagementScore({
    totalParticipants,
    activeParticipants,
    totalResponses,
    participationRate,
    accuracyRate,
  });

  await prisma.classroomSessionAnalytics.update({
    where: { sessionId },
    data: {
      totalParticipants,
      activeParticipants,
      totalResponses,
      averageResponseTime,
      participationRate,
      accuracyRate,
      engagementScore,
    },
  });
}

export async function getSlideAnalytics(sessionId: string): Promise<SlideAnalytics[]> {
  const session = await prisma.classroomSession.findUnique({
    where: { id: sessionId },
    include: {
      participants: true,
      presentation: {
        include: {
          slides: {
            include: {
              interactions: true,
            },
            orderBy: { order: 'asc' },
          },
        },
      },
      responses: {
        include: {
          interaction: true,
        },
      },
    },
  });

  if (!session) {
    throw new AppError(404, 'Session not found');
  }

  const slideAnalytics: SlideAnalytics[] = [];

  for (const slide of session.presentation.slides) {
    const slideResponses = session.responses.filter(
      (r) => r.interaction.slideId === slide.id
    );

    const interactionCount = slide.interactions.length;
    const totalResponses = slideResponses.length;

    // Calculate participation rate for this slide
    const participationRate =
      session.participants.length > 0 ? (totalResponses / session.participants.length) * 100 : 0;

    // Calculate average score
    const pointsAwarded = slideResponses
      .map((r) => r.pointsAwarded)
      .filter((p): p is number => p !== null && p !== undefined);
    const averageScore =
      pointsAwarded.length > 0 ? pointsAwarded.reduce((sum, p) => sum + p, 0) / pointsAwarded.length : 0;

    // Calculate confusion score (based on wrong answers)
    const wrongAnswers = slideResponses.filter((r) => r.isCorrect === false).length;
    const confusionScore =
      totalResponses > 0 ? (wrongAnswers / totalResponses) * 100 : 0;

    // Determine difficulty
    let difficulty: 'easy' | 'medium' | 'hard' = 'medium';
    if (confusionScore < 30) difficulty = 'easy';
    else if (confusionScore > 60) difficulty = 'hard';

    slideAnalytics.push({
      slideId: slide.id,
      slideOrder: slide.order,
      viewCount: 0, // Would need slide view tracking
      averageViewDuration: 0, // Would need timing data
      interactionCount,
      totalResponses,
      participationRate,
      averageScore,
      confusionScore,
      difficulty,
    });
  }

  return slideAnalytics;
}

export async function generateSessionReport(sessionId: string): Promise<SessionReport> {
  const session = await prisma.classroomSession.findUnique({
    where: { id: sessionId },
    include: {
      presentation: {
        include: {
          slides: {
            include: {
              interactions: true,
            },
          },
        },
      },
      instructor: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
      participants: true,
      responses: true,
      analytics: true,
    },
  });

  if (!session) {
    throw new AppError(404, 'Session not found');
  }

  const startTime = session.startedAt || session.createdAt;
  const endTime = session.endedAt || new Date();
  const duration = Math.floor((endTime.getTime() - startTime.getTime()) / 1000 / 60); // minutes

  const totalParticipants = session.participants.length;
  const peakParticipants = totalParticipants; // Would need historical data
  const averageEngagement = session.analytics?.engagementScore || 0;

  const totalSlides = session.presentation.slides.length;
  const slidesCompleted = session.currentSlideId
    ? session.presentation.slides.findIndex((s) => s.id === session.currentSlideId) + 1
    : 0;

  const totalInteractions = session.presentation.slides.reduce(
    (sum, slide) => sum + slide.interactions.length,
    0
  );

  const totalResponses = session.responses.length;

  const correctResponses = session.responses.filter((r) => r.isCorrect === true).length;
  const averageAccuracy =
    session.responses.length > 0 ? (correctResponses / session.responses.length) * 100 : 0;

  // Find most/least engaged slides
  const slideAnalytics = await getSlideAnalytics(sessionId);
  const mostEngagedSlide =
    slideAnalytics.length > 0
      ? slideAnalytics.reduce((max, slide) =>
          slide.participationRate > max.participationRate ? slide : max
        ).slideId
      : '';
  const leastEngagedSlide =
    slideAnalytics.length > 0
      ? slideAnalytics.reduce((min, slide) =>
          slide.participationRate < min.participationRate ? slide : min
        ).slideId
      : '';

  // Find fastest/slowest responders
  const responseTimes = session.responses
    .filter((r) => r.duration !== null && r.duration !== undefined)
    .map((r) => ({ participantId: r.participantId, duration: r.duration! }));
  const fastestResponder =
    responseTimes.length > 0
      ? responseTimes.reduce((min, r) => (r.duration < min.duration ? r : min)).participantId
      : '';
  const slowestResponder =
    responseTimes.length > 0
      ? responseTimes.reduce((max, r) => (r.duration > max.duration ? r : max)).participantId
      : '';

  const participantBreakdown = {
    joined: session.participants.length,
    left: session.participants.filter((p) => p.status === 'left').length,
    raisedHands: session.participants.filter((p) => p.raisedHand).length,
  };

  // Interaction breakdown
  const interactionBreakdown: Record<string, number> = {};
  for (const slide of session.presentation.slides) {
    for (const interaction of slide.interactions) {
      interactionBreakdown[interaction.type] = (interactionBreakdown[interaction.type] || 0) + 1;
    }
  }

  // Timeline (simplified - would need event tracking)
  const timeline = [
    {
      timestamp: startTime,
      participantCount: 0,
    },
    {
      timestamp: endTime,
      participantCount: totalParticipants,
    },
  ];

  return {
    sessionId: session.id,
    sessionTitle: session.title || session.presentation.title,
    instructorName: `${session.instructor.firstName} ${session.instructor.lastName}`,
    startTime,
    endTime,
    duration,
    totalParticipants,
    peakParticipants,
    averageEngagement,
    totalSlides,
    slidesCompleted,
    totalInteractions,
    totalResponses,
    averageAccuracy,
    mostEngagedSlide,
    leastEngagedSlide,
    fastestResponder,
    slowestResponder,
    participantBreakdown,
    interactionBreakdown,
    timeline,
  };
}

export async function exportSessionReport(
  sessionId: string,
  format: 'pdf' | 'excel' | 'json'
): Promise<Buffer> {
  const report = await generateSessionReport(sessionId);

  switch (format) {
    case 'json':
      return Buffer.from(JSON.stringify(report, null, 2));

    case 'excel':
      return await exportToExcel(report);

    case 'pdf':
      return await generateSessionReportPDF(report);

    default:
      throw new AppError(400, 'Unsupported export format');
  }
}

async function exportToExcel(report: SessionReport): Promise<Buffer> {
  // Use xlsx library to generate Excel file
  const XLSX = await import('xlsx');
  
  const workbook = XLSX.utils.book_new();

  // Summary sheet
  const summaryData = [
    ['Session Report'],
    ['Session Title', report.sessionTitle],
    ['Instructor', report.instructorName],
    ['Start Time', report.startTime.toISOString()],
    ['End Time', report.endTime.toISOString()],
    ['Duration (minutes)', report.duration],
    ['Total Participants', report.totalParticipants],
    ['Peak Participants', report.peakParticipants],
    ['Average Engagement', report.averageEngagement],
    ['Total Slides', report.totalSlides],
    ['Slides Completed', report.slidesCompleted],
    ['Total Interactions', report.totalInteractions],
    ['Total Responses', report.totalResponses],
    ['Average Accuracy', report.averageAccuracy],
  ];

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

  // Participant breakdown sheet
  const participantData = [
    ['Participant Breakdown'],
    ['Joined', report.participantBreakdown.joined],
    ['Left', report.participantBreakdown.left],
    ['Raised Hands', report.participantBreakdown.raisedHands],
  ];

  const participantSheet = XLSX.utils.aoa_to_sheet(participantData);
  XLSX.utils.book_append_sheet(workbook, participantSheet, 'Participants');

  // Interaction breakdown sheet
  const interactionData = [
    ['Interaction Type', 'Count'],
    ...Object.entries(report.interactionBreakdown),
  ];

  const interactionSheet = XLSX.utils.aoa_to_sheet(interactionData);
  XLSX.utils.book_append_sheet(workbook, interactionSheet, 'Interactions');

  const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  return Buffer.from(excelBuffer);
}

export async function generateSessionReportPDF(report: SessionReport): Promise<Buffer> {
  // Use Puppeteer to generate PDF
  const puppeteer = await import('puppeteer');
  
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  const html = generateReportHTML(report);
  await page.setContent(html);

  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: {
      top: '20px',
      right: '20px',
      bottom: '20px',
      left: '20px',
    },
  });

  await browser.close();
  return Buffer.from(pdfBuffer);
}

function generateReportHTML(report: SessionReport): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Session Report - ${report.sessionTitle}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        h1 { color: #333; }
        h2 { color: #666; margin-top: 30px; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
        .metric { display: inline-block; margin: 10px; padding: 15px; background: #f9f9f9; border-radius: 5px; }
        .metric-value { font-size: 24px; font-weight: bold; color: #333; }
        .metric-label { font-size: 14px; color: #666; }
      </style>
    </head>
    <body>
      <h1>Session Report</h1>
      <h2>${report.sessionTitle}</h2>
      <p><strong>Instructor:</strong> ${report.instructorName}</p>
      <p><strong>Duration:</strong> ${report.duration} minutes</p>
      
      <h2>Key Metrics</h2>
      <div class="metric">
        <div class="metric-value">${report.totalParticipants}</div>
        <div class="metric-label">Total Participants</div>
      </div>
      <div class="metric">
        <div class="metric-value">${report.averageEngagement.toFixed(1)}%</div>
        <div class="metric-label">Average Engagement</div>
      </div>
      <div class="metric">
        <div class="metric-value">${report.totalResponses}</div>
        <div class="metric-label">Total Responses</div>
      </div>
      <div class="metric">
        <div class="metric-value">${report.averageAccuracy.toFixed(1)}%</div>
        <div class="metric-label">Average Accuracy</div>
      </div>
      
      <h2>Participant Breakdown</h2>
      <table>
        <tr><th>Metric</th><th>Count</th></tr>
        <tr><td>Joined</td><td>${report.participantBreakdown.joined}</td></tr>
        <tr><td>Left</td><td>${report.participantBreakdown.left}</td></tr>
        <tr><td>Raised Hands</td><td>${report.participantBreakdown.raisedHands}</td></tr>
      </table>
      
      <h2>Interaction Breakdown</h2>
      <table>
        <tr><th>Interaction Type</th><th>Count</th></tr>
        ${Object.entries(report.interactionBreakdown)
          .map(([type, count]) => `<tr><td>${type}</td><td>${count}</td></tr>`)
          .join('')}
      </table>
    </body>
    </html>
  `;
}

function calculateEngagementScore(metrics: {
  totalParticipants: number;
  activeParticipants: number;
  totalResponses: number;
  participationRate: number;
  accuracyRate: number;
}): number {
  // Weighted engagement score calculation
  const activeParticipationRatio =
    metrics.totalParticipants > 0 ? metrics.activeParticipants / metrics.totalParticipants : 0;
  
  const engagementScore =
    activeParticipationRatio * 0.3 +
    (metrics.participationRate / 100) * 0.4 +
    (metrics.accuracyRate / 100) * 0.3;

  return Math.round(engagementScore * 100);
}

export async function exportSessionCSV(sessionId: string): Promise<string> {
  const session = await prisma.classroomSession.findUnique({
    where: { id: sessionId },
    include: {
      presentation: {
        include: {
          slides: {
            orderBy: { order: 'asc' },
            include: { interactions: { orderBy: { order: 'asc' } } },
          },
        },
      },
      instructor: true,
      participants: {
        include: {
          user: true,
          responses: {
            include: { interaction: { include: { slide: true } } },
            orderBy: { submittedAt: 'asc' },
          },
        },
      },
    },
  });

  if (!session) {
    throw new AppError(404, 'Session not found');
  }

  const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows: string[] = [];

  rows.push('SESSION SUMMARY');
  rows.push('Session Title,Instructor,Room Code,Status,Started At,Total Participants,Total Responses');
  rows.push(
    [
      esc(session.title || session.presentation.title),
      esc(`${session.instructor.firstName} ${session.instructor.lastName}`),
      esc(session.roomCode),
      esc(session.status),
      esc((session.startedAt ?? session.createdAt).toISOString()),
      session.participants.length,
      session.participants.reduce((n, p) => n + p.responses.length, 0),
    ].join(','),
  );

  rows.push('');
  rows.push('PARTICIPANT SUMMARY');
  rows.push('Participant Name,Email,Status,Joined At,Responses Submitted,Correct Answers,Accuracy %');
  for (const p of session.participants) {
    const name = `${p.user?.firstName ?? 'Guest'} ${p.user?.lastName ?? ''}`.trim();
    const totalResp = p.responses.length;
    const correctResp = p.responses.filter((r) => r.isCorrect === true).length;
    const acc = totalResp > 0 ? `${((correctResp / totalResp) * 100).toFixed(1)}%` : '0%';
    rows.push(
      [esc(name), esc(p.user?.email ?? 'N/A'), esc(p.status), esc(p.joinedAt.toISOString()), totalResp, correctResp, esc(acc)].join(','),
    );
  }

  // Interaction-level summaries
  rows.push('');
  rows.push('INTERACTION SUMMARY (per question)');
  rows.push('Slide #,Slide Title,Interaction Type,Question,Total Responses,Response Rate %,Option,Response Count');

  const allInteractions = session.presentation.slides.flatMap((slide) =>
    slide.interactions.map((interaction) => ({ slide, interaction })),
  );

  for (const { slide, interaction } of allInteractions) {
    const settings = (interaction.settings as Record<string, unknown>) ?? {};
    const question = String(settings.question ?? interaction.title ?? slide.title ?? '').replace(/"/g, '""');
    const responses = session.participants.flatMap((p) =>
      p.responses.filter((r) => r.interactionId === interaction.id),
    );
    const totalResponses = responses.length;
    const responseRate =
      session.participants.length > 0
        ? ((totalResponses / session.participants.length) * 100).toFixed(1)
        : '0';

    const optionCounts: Record<string, number> = {};
    for (const r of responses) {
      if (Array.isArray(r.response)) {
        for (const sel of r.response) {
          const key = String(sel);
          optionCounts[key] = (optionCounts[key] ?? 0) + 1;
        }
      } else {
        const key = String(r.response);
        optionCounts[key] = (optionCounts[key] ?? 0) + 1;
      }
    }

    const optionEntries = Object.entries(optionCounts);
    if (optionEntries.length === 0) {
      rows.push(
        [slide.order, esc(slide.title), esc(interaction.type), esc(question), totalResponses, responseRate, esc('(no responses)'), 0].join(','),
      );
    } else {
      for (const [option, count] of optionEntries) {
        rows.push(
          [slide.order, esc(slide.title), esc(interaction.type), esc(question), totalResponses, responseRate, esc(option), count].join(','),
        );
      }
    }
  }

  rows.push('');
  rows.push('DETAILED RESPONSE LOG');
  rows.push('Slide #,Slide Title,Interaction Type,Question,Participant Name,Email,Response,Submitted At,Correct');

  for (const p of session.participants) {
    const name = `${p.user?.firstName ?? 'Guest'} ${p.user?.lastName ?? ''}`.trim();
    for (const r of p.responses) {
      const slide = r.interaction.slide;
      const settings = (r.interaction.settings as Record<string, unknown>) ?? {};
      const question = String(settings.question ?? r.interaction.title ?? slide?.title ?? '');
      const respVal =
        typeof r.response === 'string'
          ? r.response
          : Array.isArray(r.response)
            ? r.response.join('; ')
            : JSON.stringify(r.response);
      rows.push(
        [
          slide?.order ?? '',
          esc(slide?.title ?? ''),
          esc(r.interaction.type),
          esc(question),
          esc(name),
          esc(p.user?.email ?? 'N/A'),
          esc(respVal),
          esc(r.submittedAt.toISOString()),
          r.isCorrect === true ? 'Yes' : r.isCorrect === false ? 'No' : 'N/A',
        ].join(','),
      );
    }
  }

  return rows.join('\n');
}

export async function generateDetailedSessionPDF(sessionId: string): Promise<Buffer> {
  const session = await prisma.classroomSession.findUnique({
    where: { id: sessionId },
    include: {
      presentation: {
        include: {
          slides: {
            orderBy: { order: 'asc' },
            include: { interactions: { orderBy: { order: 'asc' } } },
          },
        },
      },
      instructor: true,
      participants: {
        include: {
          user: true,
          responses: {
            include: { interaction: { include: { slide: true } } },
            orderBy: { submittedAt: 'asc' },
          },
        },
      },
    },
  });

  if (!session) {
    throw new AppError(404, 'Session not found');
  }

  const report = await generateSessionReport(sessionId);
  const html = generateDetailedReportHTML(session, report);
  return generatePDFfromHTML(html);
}

async function generatePDFfromHTML(html: string): Promise<Buffer> {
  const puppeteer = await import('puppeteer');
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' },
  });
  await browser.close();
  return Buffer.from(pdfBuffer);
}

function generateDetailedReportHTML(
  session: {
    roomCode: string;
    status: string;
    startedAt: Date | null;
    createdAt: Date;
    participants: Array<{
      user: { firstName: string; lastName: string; email: string | null } | null;
      status: string;
      joinedAt: Date;
      responses: Array<{
        response: unknown;
        submittedAt: Date;
        isCorrect: boolean | null;
        interaction: {
          type: string;
          title: string | null;
          settings: unknown;
          slide: { order: number; title: string } | null;
        };
      }>;
    }>;
    presentation: {
      slides: Array<{
        order: number;
        title: string;
        interactions: Array<{ id: string; type: string; title: string | null; settings: unknown }>;
      }>;
    };
  },
  report: SessionReport,
): string {
  const interactionSections = session.presentation.slides
    .flatMap((slide) =>
      slide.interactions.map((interaction) => {
        const settings = (interaction.settings as Record<string, unknown>) ?? {};
        const question = String(settings.question ?? interaction.title ?? slide.title);
        const interactionResponses = session.participants.flatMap((p) =>
          p.responses
            .filter((r) => r.interaction.id === interaction.id)
            .map((r) => ({ p, r })),
        );

        if (interactionResponses.length === 0) return '';

        const optionCounts: Record<string, number> = {};
        for (const { r } of interactionResponses) {
          if (Array.isArray(r.response)) {
            for (const sel of r.response) optionCounts[String(sel)] = (optionCounts[String(sel)] ?? 0) + 1;
          } else {
            optionCounts[String(r.response)] = (optionCounts[String(r.response)] ?? 0) + 1;
          }
        }

        const optionsHtml = Object.entries(optionCounts)
          .map(([opt, count]) => {
            const pct = Math.round((count / interactionResponses.length) * 100);
            return `<tr><td>${escapeHtml(opt)}</td><td>${count}</td><td>${pct}%</td><td><div class="bar"><div class="fill" style="width:${pct}%"></div></div></td></tr>`;
          })
          .join('');

        const detailRows = interactionResponses
          .map(({ p, r }) => {
            const name = `${p.user?.firstName ?? 'Guest'} ${p.user?.lastName ?? ''}`.trim();
            const val = Array.isArray(r.response) ? r.response.join(', ') : String(r.response);
            return `<tr><td>${escapeHtml(name)}</td><td>${escapeHtml(val)}</td><td>${r.submittedAt.toLocaleString()}</td><td>${r.isCorrect === true ? '✓' : r.isCorrect === false ? '✗' : '—'}</td></tr>`;
          })
          .join('');

        return `
        <div class="section">
          <h3>Slide ${slide.order} · ${escapeHtml(slide.title)}</h3>
          <p class="meta">${escapeHtml(interaction.type.replace(/_/g, ' '))} · ${interactionResponses.length} response(s)</p>
          <p class="question">${escapeHtml(question)}</p>
          ${optionsHtml ? `<table><tr><th>Option</th><th>Count</th><th>%</th><th>Distribution</th></tr>${optionsHtml}</table>` : ''}
          <h4>Individual Responses</h4>
          <table><tr><th>Student</th><th>Answer</th><th>Submitted</th><th>Correct</th></tr>${detailRows}</table>
        </div>`;
      }),
    )
    .filter(Boolean)
    .join('');

  const participantRows = session.participants
    .map((p) => {
      const name = `${p.user?.firstName ?? 'Guest'} ${p.user?.lastName ?? ''}`.trim();
      return `<tr><td>${escapeHtml(name)}</td><td>${escapeHtml(p.user?.email ?? '—')}</td><td>${p.responses.length}</td><td>${p.joinedAt.toLocaleString()}</td></tr>`;
    })
    .join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Session Report</title>
<style>
  body{font-family:Segoe UI,Arial,sans-serif;padding:28px;color:#1a1a2e;line-height:1.5}
  h1{color:#4f46e5;margin-bottom:4px} h2{color:#374151;margin-top:28px;border-bottom:2px solid #e5e7eb;padding-bottom:6px}
  h3{color:#111827;margin:0 0 6px} h4{color:#6b7280;font-size:13px;margin:16px 0 8px;text-transform:uppercase;letter-spacing:.05em}
  .meta{color:#6b7280;font-size:13px;margin-bottom:8px}
  .question{font-size:15px;font-weight:600;margin-bottom:12px;color:#111827}
  .metrics{display:flex;flex-wrap:wrap;gap:12px;margin:16px 0}
  .metric{background:#f3f4f6;border-radius:8px;padding:14px 18px;min-width:120px}
  .metric .val{font-size:22px;font-weight:700;color:#4f46e5}.metric .lbl{font-size:12px;color:#6b7280}
  table{width:100%;border-collapse:collapse;margin:10px 0 20px;font-size:13px}
  th,td{border:1px solid #e5e7eb;padding:8px 10px;text-align:left}
  th{background:#f9fafb;font-weight:600}
  .section{margin:24px 0;padding:16px;background:#fafafa;border-radius:8px;border:1px solid #e5e7eb}
  .bar{background:#e5e7eb;border-radius:4px;height:8px;width:100px;display:inline-block;vertical-align:middle}
  .fill{background:linear-gradient(90deg,#7c3aed,#4f46e5);height:100%;border-radius:4px}
</style></head><body>
  <h1>${escapeHtml(report.sessionTitle)}</h1>
  <p><strong>Instructor:</strong> ${escapeHtml(report.instructorName)} &nbsp;·&nbsp; <strong>Room:</strong> ${escapeHtml(session.roomCode)} &nbsp;·&nbsp; <strong>Duration:</strong> ${report.duration} min</p>
  <div class="metrics">
    <div class="metric"><div class="val">${report.totalParticipants}</div><div class="lbl">Participants</div></div>
    <div class="metric"><div class="val">${report.totalResponses}</div><div class="lbl">Total Responses</div></div>
    <div class="metric"><div class="val">${report.averageAccuracy.toFixed(0)}%</div><div class="lbl">Avg Accuracy</div></div>
    <div class="metric"><div class="val">${report.totalInteractions}</div><div class="lbl">Interactions</div></div>
  </div>
  <h2>Participants</h2>
  <table><tr><th>Name</th><th>Email</th><th>Responses</th><th>Joined</th></tr>${participantRows}</table>
  <h2>Question-by-Question Results</h2>
  ${interactionSections || '<p>No responses recorded yet.</p>'}
</body></html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}