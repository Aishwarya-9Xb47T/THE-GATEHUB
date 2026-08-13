/**
 * CSV / Excel / PDF formatters consuming CanonicalSessionReport only.
 */

import * as XLSX from 'xlsx';
import { csvEscape, stringifyExportValue } from './contentSerialize.js';
import {
  buildCanonicalSessionReport,
  buildCanonicalStudentReport,
  reviewItemToExportRow,
  type CanonicalSessionReport,
} from './sessionReportService.js';
import {
  buildAllLiveParticipantReviews,
  type AttemptReviewDTO,
} from './attemptReviewService.js';

function fmtTime(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

/** Safe download filename — no path traversal, no reserved characters. */
export function sanitizeReportFilename(name: string, ext: string): string {
  const base = String(name || 'Quiz_Report')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 120)
    .replace(/[_.]+$/g, '');
  const safeExt = ext.replace(/^\./, '').replace(/[^a-z0-9]/gi, '') || 'bin';
  const date = new Date().toISOString().slice(0, 10);
  return `${base || 'Quiz_Report'}_${date}.${safeExt}`;
}

function applySheetPresentation(
  ws: XLSX.WorkSheet,
  opts?: { freezeHeader?: boolean; colWidths?: number[]; filter?: boolean },
) {
  if (opts?.colWidths?.length) {
    ws['!cols'] = opts.colWidths.map((wch) => ({ wch }));
  }
  if (opts?.freezeHeader) {
    (ws as any)['!freeze'] = { xSplit: 0, ySplit: 1 };
  }
  if (opts?.filter) {
    const ref = ws['!ref'];
    if (ref) ws['!autofilter'] = { ref };
  }
}

export function formatSessionReportCsv(report: CanonicalSessionReport): string {
  const lines: string[] = [];
  lines.push('=== QUIZ PERFORMANCE REPORT ===');
  lines.push(
    ['Quiz', 'Room Code', 'Instructor', 'Hosted At', 'Total Marks', 'Questions']
      .map(csvEscape)
      .join(','),
  );
  lines.push(
    [
      report.quiz.title,
      report.session.roomCode || '',
      report.quiz.instructorName || '',
      report.session.hostedAt || report.session.createdAt,
      report.summary.totalMarks,
      report.summary.totalQuestions,
    ]
      .map(csvEscape)
      .join(','),
  );
  lines.push('');
  lines.push('=== SUMMARY ===');
  lines.push(
    [
      'Participants',
      'Completed',
      'Average Score',
      'Average %',
      'Average Accuracy',
      'Highest',
      'Lowest',
      'Average Time',
    ].join(','),
  );
  lines.push(
    [
      report.summary.participantCount,
      report.summary.completedCount,
      `${report.summary.averageScore} / ${report.summary.totalMarks}`,
      report.summary.averagePercentage,
      report.summary.averageAccuracy,
      report.summary.highestScore,
      report.summary.lowestScore,
      fmtTime(report.summary.averageTimeMs),
    ]
      .map(csvEscape)
      .join(','),
  );
  lines.push('');
  lines.push('=== STUDENT PERFORMANCE ===');
  lines.push(
    [
      'Rank',
      'Student',
      'Email',
      'Score',
      'Maximum Marks',
      'Percentage',
      'Accuracy',
      'Correct',
      'Incorrect',
      'Unanswered',
      'Time Taken',
      'Status',
      'Submitted At',
    ].join(','),
  );
  for (const s of report.students) {
    lines.push(
      [
        s.rank,
        s.displayName,
        s.email || '',
        s.academicScore,
        s.maxScore,
        s.percentage,
        s.accuracy,
        s.correctCount,
        s.incorrectCount,
        s.unansweredCount,
        fmtTime(s.timeTakenMs),
        s.status,
        s.finishedAt || '',
      ]
        .map(csvEscape)
        .join(','),
    );
  }
  lines.push('');
  lines.push('=== QUESTION ANALYSIS ===');
  lines.push(
    [
      '#',
      'Question',
      'Type',
      'Marks',
      'Correct %',
      'Incorrect %',
      'Unanswered %',
      'Avg Time',
      'Difficulty',
      'Content Notes',
    ].join(','),
  );
  for (const q of report.questionAnalysis) {
    lines.push(
      [
        q.number,
        q.content.exportText,
        q.type,
        q.marks,
        q.correctPercent,
        q.incorrectPercent,
        q.unansweredPercent,
        fmtTime(q.averageTimeMs),
        q.difficulty || '',
        [
          q.content.imageUrls.length ? 'Image' : '',
          q.content.codeBlocks.length ? 'Code' : '',
          q.content.formulas.length ? 'Formula' : '',
          q.content.tables.length ? 'Table' : '',
          q.content.videoUrls.length ? 'Video' : '',
        ]
          .filter(Boolean)
          .join('|'),
      ]
        .map(csvEscape)
        .join(','),
    );
  }
  return lines.join('\n');
}

/** Full CSV: summary + students + question analysis + detailed responses (entire dataset). */
export async function formatFullSessionReportCsv(sessionId: string): Promise<string> {
  const report = await buildCanonicalSessionReport(sessionId);
  const parts = [formatSessionReportCsv(report)];
  if (report.students.length === 0) {
    parts.push('');
    parts.push('=== DETAILED RESPONSES ===');
    parts.push('No attempts yet.');
    return parts.join('\n');
  }
  const detailed = await formatDetailedResponsesCsv(sessionId, report);
  // Strip header-only first line duplication by appending body after a blank
  parts.push('');
  parts.push(detailed);
  return parts.join('\n');
}

export async function formatDetailedResponsesCsv(
  sessionId: string,
  existingReport?: CanonicalSessionReport,
): Promise<string> {
  const report = existingReport || (await buildCanonicalSessionReport(sessionId));
  const reviews = await buildAllLiveParticipantReviews(sessionId);
  const lines: string[] = [];
  lines.push('=== DETAILED RESPONSES ===');
  lines.push(
    [
      'Student',
      'Email',
      'Question Number',
      'Question',
      'Question Type',
      'Marks Available',
      'Options',
      'Student Answer',
      'Correct Answer',
      'Status',
      'Marks Earned',
      'Explanation',
      'Time Taken',
      'Attempt Date',
      'Media References',
    ].join(','),
  );
  if (report.students.length === 0) {
    lines.push(['No attempts yet.'].map(csvEscape).join(','));
    return lines.join('\n');
  }
  for (const student of report.students) {
    const review = reviews.get(student.participantId);
    if (!review) continue;
    for (const item of review.questions) {
      const row = reviewItemToExportRow(item, student.displayName);
      lines.push(
        [
          row.student,
          student.email || '',
          row.questionNumber,
          row.question,
          row.type,
          row.marks,
          row.options,
          row.studentAnswer,
          row.correctAnswer,
          row.status,
          row.marksAwarded,
          row.explanation,
          fmtTime(row.timeTakenMs),
          review.summary.submittedAt || review.summary.attemptDate || '',
          row.media,
        ]
          .map(csvEscape)
          .join(','),
      );
    }
  }
  return lines.join('\n');
}

export function formatSessionReportExcel(report: CanonicalSessionReport): Buffer {
  const wb = XLSX.utils.book_new();

  const summaryAoA = [
    ['QUIZ PERFORMANCE REPORT'],
    [],
    ['Quiz', report.quiz.title],
    ['Room Code', report.session.roomCode || ''],
    ['Instructor', report.quiz.instructorName || ''],
    ['Hosted At', report.session.hostedAt || report.session.createdAt],
    ['Status', report.session.status],
    [],
    ['Total Participants', report.summary.participantCount],
    ['Completed', report.summary.completedCount],
    ['In Progress', report.summary.inProgressCount],
    ['Completion Rate %', report.summary.participantCount
      ? Math.round((report.summary.completedCount / report.summary.participantCount) * 10000) / 100
      : 0],
    ['Average Score', `${report.summary.averageScore} / ${report.summary.totalMarks}`],
    ['Average %', report.summary.averagePercentage],
    ['Average Accuracy', report.summary.averageAccuracy],
    ['Highest Score', report.summary.highestScore],
    ['Lowest Score', report.summary.lowestScore],
    ['Median Score', (report.summary as { medianScore?: number }).medianScore ?? ''],
    ['Average Time', fmtTime(report.summary.averageTimeMs)],
    ['Total Marks', report.summary.totalMarks],
    ['Total Questions', report.summary.totalQuestions],
    [],
    ['Score Distribution'],
    ['Bucket', 'Students'],
    ...report.summary.scoreDistribution.map((b) => [b.bucket, b.count]),
    [],
    ['Insights'],
    [
      'Strongest Question',
      report.insights.strongestQuestion
        ? `Q${report.insights.strongestQuestion.number} (${report.insights.strongestQuestion.correctPercent}%)`
        : '—',
    ],
    [
      'Weakest Question',
      report.insights.weakestQuestion
        ? `Q${report.insights.weakestQuestion.number} (${report.insights.weakestQuestion.correctPercent}%)`
        : '—',
    ],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryAoA);
  applySheetPresentation(wsSummary, { colWidths: [28, 60] });
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

  const studentsRows =
    report.students.length > 0
      ? report.students.map((s) => ({
          Rank: s.rank,
          Student: s.displayName,
          Email: s.email || '',
          'Marks Earned': s.academicScore,
          'Max Marks': s.maxScore,
          Percentage: s.percentage,
          Accuracy: s.accuracy,
          Correct: s.correctCount,
          Incorrect: s.incorrectCount,
          Unanswered: s.unansweredCount,
          Time: fmtTime(s.timeTakenMs),
          Status: s.status,
          'Submitted At': s.finishedAt || '',
          'Live Points (gamification)': s.livePoints,
        }))
      : [{ Note: 'No attempts yet.' }];
  const wsStudents = XLSX.utils.json_to_sheet(studentsRows);
  applySheetPresentation(wsStudents, {
    freezeHeader: true,
    filter: report.students.length > 0,
    colWidths: [8, 22, 28, 12, 12, 12, 12, 10, 10, 12, 12, 14, 22, 14],
  });
  XLSX.utils.book_append_sheet(wb, wsStudents, 'Student Performance');

  const qRows =
    report.questionAnalysis.length > 0
      ? report.questionAnalysis.map((q) => ({
          '#': q.number,
          Question: q.content.exportText,
          Type: q.type,
          Marks: q.marks,
          'Correct %': q.correctPercent,
          'Incorrect %': q.incorrectPercent,
          'Unanswered %': q.unansweredPercent,
          'Avg Marks': q.averageMarks,
          'Avg Time': fmtTime(q.averageTimeMs),
          Difficulty: q.difficulty || '',
          Bloom: q.bloomLevel || '',
          Topic: q.topic,
          'Correct Answer': q.options
            .filter((o) => o.isCorrect)
            .map((o) => o.text)
            .join(' | '),
        }))
      : [{ Note: 'No questions.' }];
  const wsQ = XLSX.utils.json_to_sheet(qRows);
  applySheetPresentation(wsQ, {
    freezeHeader: true,
    filter: report.questionAnalysis.length > 0,
    colWidths: [6, 48, 16, 10, 12, 12, 14, 12, 12, 12, 12, 16, 28],
  });
  XLSX.utils.book_append_sheet(wb, wsQ, 'Question Analysis');

  const contentRows = report.questionAnalysis.map((q) => ({
    '#': q.number,
    Type: q.type,
    Marks: q.marks,
    Content: q.content.exportText,
    Options: q.options.map((o) => `${o.isCorrect ? '[✓] ' : ''}${o.text}`).join(' | '),
    'Correct Options': q.options
      .filter((o) => o.isCorrect)
      .map((o) => o.text)
      .join(' | '),
    Images: q.content.imageUrls.join(' | '),
    Videos: q.content.videoUrls.join(' | '),
    Code: q.content.codeBlocks.map((c) => c.content).join('\n---\n'),
    Formulas: q.content.formulas.join(' | '),
    Tables: q.content.tables
      .map((t) => [t.headers.join('|'), ...t.rows.map((r) => r.join('|'))].join('\n'))
      .join('\n\n'),
  }));
  if (contentRows.length) {
    const wsContent = XLSX.utils.json_to_sheet(contentRows);
    applySheetPresentation(wsContent, {
      freezeHeader: true,
      colWidths: [6, 14, 10, 40, 36, 24, 24, 24, 36, 24, 28],
    });
    XLSX.utils.book_append_sheet(wb, wsContent, 'Question Content');
  }

  const topicRows = report.learningAnalytics.byTopic.map((t) => ({
    Topic: t.topic,
    Questions: t.questions,
    'Correct %': t.correctPercent,
    'Avg Time': fmtTime(t.averageTimeMs),
  }));
  if (topicRows.length) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(topicRows), 'Learning Analytics');
  }

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return buffer;
}

export async function formatDetailedExcel(sessionId: string): Promise<Buffer> {
  const report = await buildCanonicalSessionReport(sessionId);
  const wb = XLSX.utils.book_new();
  const core = formatSessionReportExcel(report);
  const coreWb = XLSX.read(core, { type: 'buffer' });
  for (const name of coreWb.SheetNames) {
    XLSX.utils.book_append_sheet(wb, coreWb.Sheets[name]!, name);
  }

  const reviews = await buildAllLiveParticipantReviews(sessionId);
  const detailRows: Record<string, unknown>[] = [];
  for (const student of report.students) {
    const review = reviews.get(student.participantId);
    if (!review) continue;
    for (const item of review.questions) {
      const row = reviewItemToExportRow(item, student.displayName);
      detailRows.push({
        Student: row.student,
        Email: student.email || '',
        'Question #': row.questionNumber,
        Question: row.question,
        Type: row.type,
        Options: row.options,
        'Student Answer': row.studentAnswer,
        'Correct Answer': row.correctAnswer,
        Status: row.status,
        'Marks Available': row.marks,
        'Marks Earned': row.marksAwarded,
        Explanation: row.explanation,
        'Time Taken': fmtTime(row.timeTakenMs),
        'Attempt Date': review.summary.submittedAt || review.summary.attemptDate || '',
      });
    }
  }
  const wsDetail = XLSX.utils.json_to_sheet(
    detailRows.length ? detailRows : [{ Note: 'No detailed responses — no attempts yet.' }],
  );
  applySheetPresentation(wsDetail, {
    freezeHeader: true,
    filter: detailRows.length > 0,
    colWidths: [20, 26, 10, 40, 14, 32, 24, 24, 12, 12, 12, 28, 12, 20],
  });
  XLSX.utils.book_append_sheet(wb, wsDetail, 'Detailed Responses');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

function escHtml(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderQuestionHtml(q: CanonicalSessionReport['questionAnalysis'][0]): string {
  const opts = q.options
    .map(
      (o) =>
        `<li style="margin:4px 0;padding:6px 10px;border:1px solid #e2e8f0;border-radius:6px;${
          o.isCorrect ? 'background:#ecfdf5;border-color:#6ee7b7;' : ''
        }">${escHtml(o.text)}${o.isCorrect ? ' <strong style="color:#047857">(Correct)</strong>' : ''}</li>`,
    )
    .join('');
  const imgs = q.content.imageUrls
    .map(
      (u) =>
        `<div style="margin:8px 0"><img src="${escHtml(u)}" alt="Question image" style="max-width:100%;max-height:220px;border-radius:8px;border:1px solid #e2e8f0"/></div>`,
    )
    .join('');
  const videos = q.content.videoUrls
    .map((u) => `<p style="font-size:12px;color:#475569"><strong>Video:</strong> ${escHtml(u)}</p>`)
    .join('');
  const code = q.content.codeBlocks
    .map(
      (c) =>
        `<pre style="background:#0f172a;color:#e2e8f0;padding:12px;border-radius:8px;overflow:auto;font-size:11px;white-space:pre-wrap">${escHtml(
          c.content,
        )}</pre>`,
    )
    .join('');
  const formulas = q.content.formulas
    .map(
      (f) =>
        `<p style="text-align:center;font-size:16px;margin:8px 0" data-formula-src="${escHtml(
          f,
        )}">$$${escHtml(f)}$$</p>`,
    )
    .join('');
  const tables = q.content.tables
    .map((t) => {
      const head = `<tr>${t.headers.map((h) => `<th style="border:1px solid #cbd5e1;padding:6px;background:#f8fafc">${escHtml(h)}</th>`).join('')}</tr>`;
      const body = t.rows
        .map(
          (r) =>
            `<tr>${r.map((c) => `<td style="border:1px solid #cbd5e1;padding:6px">${escHtml(c)}</td>`).join('')}</tr>`,
        )
        .join('');
      return `<table style="border-collapse:collapse;width:100%;margin:8px 0;font-size:12px">${head}${body}</table>`;
    })
    .join('');

  return `
    <section style="page-break-inside:avoid;margin:0 0 18px;padding:14px;border:1px solid #e2e8f0;border-radius:12px">
      <div style="display:flex;justify-content:space-between;gap:12px;margin-bottom:8px">
        <strong>Q${q.number} · ${escHtml(q.type)} · ${q.marks} marks</strong>
        <span style="font-size:12px;color:#64748b">${q.correctPercent}% correct · Avg ${fmtTime(q.averageTimeMs)}</span>
      </div>
      <div style="white-space:pre-wrap;font-size:13px;line-height:1.5;margin-bottom:8px">${escHtml(
        q.text.replace(/!\[[^\]]*\]\([^)]+\)/g, '').replace(/```[\s\S]*?```/g, '[code]'),
      )}</div>
      ${imgs}${videos}${formulas}${code}${tables}
      <ol style="list-style:none;padding:0;margin:8px 0 0">${opts}</ol>
    </section>
  `;
}

export function buildSessionReportHtml(
  report: CanonicalSessionReport,
  detailedReviews?: Map<string, AttemptReviewDTO>,
): string {
  const completionRate =
    report.summary.participantCount > 0
      ? Math.round((report.summary.completedCount / report.summary.participantCount) * 1000) / 10
      : 0;
  const median =
    (report.summary as { medianScore?: number }).medianScore ?? '—';

  const distBars = report.summary.scoreDistribution
    .map((b) => {
      const max = Math.max(1, ...report.summary.scoreDistribution.map((x) => x.count));
      const w = Math.round((b.count / max) * 100);
      return `<div style="margin:6px 0"><div style="font-size:11px;display:flex;justify-content:space-between"><span>${escHtml(
        b.bucket,
      )}</span><span>${b.count}</span></div><div style="height:8px;background:#e2e8f0;border-radius:999px;overflow:hidden"><div style="height:100%;width:${w}%;background:#2563eb"></div></div></div>`;
    })
    .join('');

  const studentRows = report.students
    .map(
      (s) => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0">#${s.rank}</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0">${escHtml(s.displayName)}<div style="font-size:10px;color:#64748b">${escHtml(
          s.email || '',
        )}</div></td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:700">${s.academicScore} / ${s.maxScore}</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0">${s.percentage}%</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0">${s.accuracy}%</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0">${s.correctCount}/${s.incorrectCount}/${s.unansweredCount}</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0">${fmtTime(s.timeTakenMs)}</td>
      </tr>`,
    )
    .join('');

  const detailedHtml =
    detailedReviews && detailedReviews.size > 0
      ? `<h2 style="page-break-before:always">Detailed Responses</h2>${[...detailedReviews.values()]
          .map((review) => {
            const cards = review.questions
              .map((q) => {
                const statusColor =
                  q.status === 'correct'
                    ? '#047857'
                    : q.status === 'incorrect'
                      ? '#b91c1c'
                      : '#64748b';
                const opts = q.options
                  .map((o) => {
                    const selected = q.selectedOptionIds.includes(o.id);
                    const bg = o.isCorrect
                      ? 'background:#ecfdf5;border-color:#6ee7b7'
                      : selected
                        ? 'background:#fef2f2;border-color:#fecaca'
                        : '';
                    return `<div style="padding:6px 8px;border:1px solid #e2e8f0;border-radius:6px;margin:3px 0;font-size:11px;${bg}">${escHtml(
                      o.text,
                    )}${selected ? ' <em>(Selected)</em>' : ''}${
                      o.isCorrect ? ' <strong>(Correct)</strong>' : ''
                    }</div>`;
                  })
                  .join('');
                return `<section style="page-break-inside:avoid;border:1px solid #e2e8f0;border-radius:10px;padding:12px;margin:0 0 10px">
                  <div style="display:flex;justify-content:space-between;font-size:12px"><strong>Q${
                    q.questionNumber
                  }</strong><span style="color:${statusColor};font-weight:800;text-transform:uppercase">${escHtml(
                    q.status,
                  )}</span></div>
                  <p style="white-space:pre-wrap;font-size:12px">${escHtml(q.questionText)}</p>
                  ${opts}
                  <p style="font-size:11px;margin-top:6px"><strong>Student answer:</strong> ${
                    q.status === 'unanswered'
                      ? 'Not answered'
                      : escHtml(
                          String(
                            (q.selectedAnswer as any)?.text ||
                              stringifyExportValue(q.selectedAnswer) ||
                              '—',
                          ),
                        )
                  }</p>
                  <p style="font-size:11px"><strong>Correct answer:</strong> ${escHtml(
                    String(
                      (q.correctAnswer as any)?.text ||
                        stringifyExportValue(q.correctAnswer) ||
                        '—',
                    ),
                  )}</p>
                  <p style="font-size:11px"><strong>Marks:</strong> ${q.marksAwarded} / ${q.maxMarks}</p>
                  ${
                    q.explanation
                      ? `<p style="font-size:11px;color:#475569"><strong>Explanation:</strong> ${escHtml(
                          q.explanation,
                        )}</p>`
                      : ''
                  }
                </section>`;
              })
              .join('');
            return `<div style="page-break-before:always;margin-bottom:18px">
              <h3 style="margin:0 0 8px">${escHtml(review.summary.studentName)}</h3>
              <p class="muted">${escHtml(review.summary.studentEmail || '')} · ${
                review.summary.score
              } / ${review.summary.maxScore} (${review.summary.percentage}%)</p>
              ${cards}
            </div>`;
          })
          .join('')}`
      : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${escHtml(report.quiz.title)} — Quiz Report</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css"/>
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"
    onload="renderMathInElement(document.body,{delimiters:[{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}]})"></script>
  <style>
    body{font-family:Inter,Segoe UI,Arial,sans-serif;color:#0f172a;margin:0;padding:28px;background:#fff}
    h1{font-size:24px;margin:0 0 4px}
    h2{font-size:16px;margin:24px 0 10px;border-bottom:2px solid #e2e8f0;padding-bottom:6px}
    .muted{color:#64748b;font-size:12px}
    .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:16px 0}
    .kpi{border:1px solid #e2e8f0;border-radius:12px;padding:12px}
    .kpi .label{font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#64748b;font-weight:700}
    .kpi .value{font-size:20px;font-weight:800;margin-top:4px}
    table{width:100%;border-collapse:collapse;font-size:12px}
    @page{margin:16mm}
  </style>
</head>
<body>
  <header>
    <div class="muted">QUIZ PERFORMANCE REPORT</div>
    <h1>${escHtml(report.quiz.title)}</h1>
    <p class="muted">
      Room ${escHtml(report.session.roomCode || '—')} ·
      Instructor ${escHtml(report.quiz.instructorName || '—')} ·
      ${escHtml(report.session.hostedAt || report.session.createdAt)}
    </p>
  </header>

  <div class="kpis">
    <div class="kpi"><div class="label">Participants</div><div class="value">${report.summary.participantCount}</div><div class="muted">${report.summary.completedCount} completed · ${completionRate}% rate</div></div>
    <div class="kpi"><div class="label">Average Score</div><div class="value">${report.summary.averageScore} / ${report.summary.totalMarks}</div><div class="muted">${report.summary.averagePercentage}% · Median ${median}</div></div>
    <div class="kpi"><div class="label">Accuracy</div><div class="value">${report.summary.averageAccuracy}%</div><div class="muted">Highest ${report.summary.highestScore} · Lowest ${report.summary.lowestScore}</div></div>
    <div class="kpi"><div class="label">Avg Time</div><div class="value">${fmtTime(report.summary.averageTimeMs)}</div><div class="muted">${report.summary.totalQuestions} questions</div></div>
  </div>

  ${
    report.summary.participantCount === 0
      ? '<p class="muted" style="padding:16px;border:1px dashed #cbd5e1;border-radius:10px">No attempts yet.</p>'
      : ''
  }

  <h2>Score Distribution</h2>
  ${distBars || '<p class="muted">No score data yet.</p>'}

  <h2>Student Performance</h2>
  ${
    report.students.length
      ? `<table>
    <thead><tr style="background:#f8fafc;text-align:left">
      <th style="padding:8px">Rank</th><th style="padding:8px">Student</th><th style="padding:8px">Score</th>
      <th style="padding:8px">%</th><th style="padding:8px">Accuracy</th><th style="padding:8px">C/I/U</th><th style="padding:8px">Time</th>
    </tr></thead>
    <tbody>${studentRows}</tbody>
  </table>`
      : '<p class="muted">No students have completed this quiz yet.</p>'
  }

  <h2 style="page-break-before:always">Question Performance</h2>
  ${
    report.questionAnalysis.length
      ? report.questionAnalysis.map(renderQuestionHtml).join('')
      : '<p class="muted">No questions.</p>'
  }

  ${detailedHtml}

  <footer class="muted" style="margin-top:28px;border-top:1px solid #e2e8f0;padding-top:10px">
    Generated from authoritative LiveAnswer academic marks · Live points are tracked separately for leaderboards.
  </footer>
</body>
</html>`;
}

async function htmlToPdfBuffer(html: string): Promise<Buffer> {
  const puppeteer = await import('puppeteer');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });
    // Wait for KaTeX auto-render when CDN scripts are present (visual PDF formulas).
    await page
      .waitForFunction(
        () => {
          const katexReady =
            typeof (window as any).renderMathInElement === 'function' ||
            document.querySelector('.katex') != null ||
            !document.querySelector('script[src*="katex"]');
          return katexReady;
        },
        { timeout: 8000 },
      )
      .catch(() => undefined);
    // Give deferred KaTeX onload a beat to paint formulas into the DOM.
    await new Promise((r) => setTimeout(r, 600));
    // Ensure source formulas remain visible even if KaTeX fails (accessibility / text layer).
    await page.evaluate(() => {
      document.querySelectorAll('[data-formula-src]').forEach((el) => {
        const src = el.getAttribute('data-formula-src');
        if (src && !el.querySelector('.katex')) {
          const note = document.createElement('code');
          note.style.fontSize = '11px';
          note.style.color = '#475569';
          note.textContent = src;
          el.appendChild(note);
        }
      });
    });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '14mm', right: '12mm', bottom: '14mm', left: '12mm' },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate:
        '<div style="font-size:9px;width:100%;text-align:center;color:#64748b;padding:0 12mm"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

export async function renderSessionReportPdf(report: CanonicalSessionReport): Promise<Buffer> {
  let reviews: Map<string, AttemptReviewDTO> | undefined;
  if (report.students.length > 0) {
    try {
      reviews = await buildAllLiveParticipantReviews(report.session.id);
    } catch {
      reviews = undefined;
    }
  }
  const html = buildSessionReportHtml(report, reviews);
  return htmlToPdfBuffer(html);
}

/** Academic student attempt PDF from AttemptReviewDTO (quiz attempt or live). */
export function renderQuizAttemptHtmlFromReview(review: AttemptReviewDTO): string {
  const s = review.summary;
  const cards = review.questions
    .map((q) => {
      const statusColor =
        q.status === 'correct' ? '#047857' : q.status === 'incorrect' ? '#b91c1c' : '#64748b';
      const opts = q.options
        .map((o) => {
          const selected = q.selectedOptionIds.includes(o.id);
          const bg = o.isCorrect
            ? 'background:#ecfdf5;border-color:#6ee7b7'
            : selected
              ? 'background:#fef2f2;border-color:#fecaca'
              : '';
          return `<div style="padding:8px;border:1px solid #e2e8f0;border-radius:8px;margin:4px 0;${bg}">${escHtml(
            o.text,
          )}${selected ? ' <em>(Selected)</em>' : ''}${o.isCorrect ? ' <strong>(Correct)</strong>' : ''}</div>`;
        })
        .join('');
      return `<section style="page-break-inside:avoid;border:1px solid #e2e8f0;border-radius:12px;padding:14px;margin:0 0 14px">
        <div style="display:flex;justify-content:space-between"><strong>Q${q.questionNumber} · ${escHtml(
          q.questionType,
        )}</strong><span style="color:${statusColor};font-weight:800;text-transform:uppercase">${escHtml(
          q.status,
        )}</span></div>
        <p style="white-space:pre-wrap">${escHtml(q.questionText)}</p>
        ${opts}
        <p style="font-size:12px;margin-top:8px"><strong>Your answer:</strong> ${
          q.status === 'unanswered'
            ? 'Not answered'
            : escHtml(
                String(
                  (q.selectedAnswer as any)?.text || stringifyExportValue(q.selectedAnswer) || '—',
                ),
              )
        }</p>
        <p style="font-size:12px"><strong>Correct answer:</strong> ${escHtml(
          String((q.correctAnswer as any)?.text || stringifyExportValue(q.correctAnswer) || '—'),
        )}</p>
        <p style="font-size:12px"><strong>Marks:</strong> ${q.marksAwarded} / ${q.maxMarks}</p>
        ${
          q.explanation
            ? `<p style="font-size:12px;color:#475569"><strong>Explanation:</strong> ${escHtml(
                q.explanation,
              )}</p>`
            : ''
        }
      </section>`;
    })
    .join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escHtml(
    s.quizTitle,
  )} — Attempt Report</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css"/>
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"
    onload="renderMathInElement(document.body,{delimiters:[{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}]})"></script>
  <style>body{font-family:Inter,Segoe UI,Arial,sans-serif;padding:28px;color:#0f172a}h1{margin:0 0 8px}.kpi{display:inline-block;border:1px solid #e2e8f0;border-radius:10px;padding:10px 14px;margin:4px 6px 4px 0}</style>
  </head><body>
  <div style="font-size:11px;color:#64748b;letter-spacing:.08em">STUDENT ATTEMPT REPORT</div>
  <h1>${escHtml(s.quizTitle)}</h1>
  <p style="color:#64748b;font-size:13px">${escHtml(s.studentName)} · ${escHtml(
    s.studentEmail || '',
  )} · ${escHtml(s.attemptDate)}</p>
  <div>
    <div class="kpi"><div style="font-size:10px;color:#64748b">ACADEMIC MARKS</div><div style="font-size:22px;font-weight:800">${s.score} / ${s.maxScore}</div></div>
    <div class="kpi"><div style="font-size:10px;color:#64748b">PERCENTAGE</div><div style="font-size:22px;font-weight:800">${s.percentage}%</div></div>
    <div class="kpi"><div style="font-size:10px;color:#64748b">ACCURACY</div><div style="font-size:22px;font-weight:800">${s.accuracy}%</div></div>
    <div class="kpi"><div style="font-size:10px;color:#64748b">C / I / U</div><div style="font-size:18px;font-weight:800">${s.correctCount} / ${s.incorrectCount} / ${s.unansweredCount}</div></div>
    ${
      s.livePoints != null
        ? `<div class="kpi"><div style="font-size:10px;color:#64748b">LIVE POINTS (separate)</div><div style="font-size:18px;font-weight:800">${s.livePoints}</div></div>`
        : ''
    }
  </div>
  <h2>Question Review</h2>
  ${cards || '<p style="color:#64748b">No questions in this attempt.</p>'}
  </body></html>`;
}

export async function renderQuizAttemptPdfFromReview(review: AttemptReviewDTO): Promise<Buffer> {
  return htmlToPdfBuffer(renderQuizAttemptHtmlFromReview(review));
}

export async function renderStudentAttemptPdfHtml(
  sessionId: string,
  participantId: string,
): Promise<string> {
  const { sessionReport, review } = await buildCanonicalStudentReport(sessionId, participantId);
  const s = review.summary;
  const cards = review.questions
    .map((q) => {
      const statusColor =
        q.status === 'correct' ? '#047857' : q.status === 'incorrect' ? '#b91c1c' : '#64748b';
      const opts = q.options
        .map((o) => {
          const selected = q.selectedOptionIds.includes(o.id);
          const bg = o.isCorrect
            ? 'background:#ecfdf5;border-color:#6ee7b7'
            : selected
              ? 'background:#fef2f2;border-color:#fecaca'
              : '';
          return `<div style="padding:8px;border:1px solid #e2e8f0;border-radius:8px;margin:4px 0;${bg}">${escHtml(
            o.text,
          )}${selected ? ' <em>(Selected)</em>' : ''}${o.isCorrect ? ' <strong>(Correct)</strong>' : ''}</div>`;
        })
        .join('');
      return `<section style="page-break-inside:avoid;border:1px solid #e2e8f0;border-radius:12px;padding:14px;margin:0 0 14px">
        <div style="display:flex;justify-content:space-between"><strong>Q${q.questionNumber}</strong><span style="color:${statusColor};font-weight:800;text-transform:uppercase">${escHtml(
          q.status,
        )}</span></div>
        <p style="white-space:pre-wrap">${escHtml(q.questionText)}</p>
        ${opts}
        <p style="font-size:12px;margin-top:8px"><strong>Your answer:</strong> ${
          q.status === 'unanswered' ? 'Not answered' : escHtml(String((q.selectedAnswer as any)?.text || stringifyExportValue(q.selectedAnswer) || '—'))
        }</p>
        <p style="font-size:12px"><strong>Correct answer:</strong> ${escHtml(
          String((q.correctAnswer as any)?.text || stringifyExportValue(q.correctAnswer) || '—'),
        )}</p>
        <p style="font-size:12px"><strong>Score:</strong> ${q.marksAwarded} / ${q.maxMarks}</p>
        ${q.explanation ? `<p style="font-size:12px;color:#475569"><strong>Explanation:</strong> ${escHtml(q.explanation)}</p>` : ''}
      </section>`;
    })
    .join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escHtml(
    s.quizTitle,
  )} — Student Result</title>
  <style>body{font-family:Inter,Segoe UI,Arial,sans-serif;padding:28px;color:#0f172a}h1{margin:0 0 8px}.kpi{display:inline-block;border:1px solid #e2e8f0;border-radius:10px;padding:10px 14px;margin:4px 6px 4px 0}</style>
  </head><body>
  <div style="font-size:11px;color:#64748b;letter-spacing:.08em">STUDENT RESULT</div>
  <h1>${escHtml(s.quizTitle)}</h1>
  <p style="color:#64748b;font-size:13px">${escHtml(s.studentName)} · ${escHtml(s.studentEmail || '')} · Room ${escHtml(
    sessionReport.session.roomCode || '',
  )}</p>
  <div>
    <div class="kpi"><div style="font-size:10px;color:#64748b">SCORE</div><div style="font-size:22px;font-weight:800">${s.score} / ${s.maxScore}</div></div>
    <div class="kpi"><div style="font-size:10px;color:#64748b">PERCENTAGE</div><div style="font-size:22px;font-weight:800">${s.percentage}%</div></div>
    <div class="kpi"><div style="font-size:10px;color:#64748b">ACCURACY</div><div style="font-size:22px;font-weight:800">${s.accuracy}%</div></div>
    <div class="kpi"><div style="font-size:10px;color:#64748b">C / I / U</div><div style="font-size:18px;font-weight:800">${s.correctCount} / ${s.incorrectCount} / ${s.unansweredCount}</div></div>
  </div>
  <h2>Question Review</h2>
  ${cards}
  </body></html>`;
}

export async function renderStudentAttemptPdf(
  sessionId: string,
  participantId: string,
): Promise<Buffer> {
  const html = await renderStudentAttemptPdfHtml(sessionId, participantId);
  const puppeteer = await import('puppeteer');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '14mm', right: '12mm', bottom: '14mm', left: '12mm' },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate:
        '<div style="font-size:9px;width:100%;text-align:center;color:#64748b"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
