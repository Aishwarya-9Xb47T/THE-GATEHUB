export interface ExtractionSummaryMetrics {
  questionsFound: number;
  imagesImported: number;
  tablesImported: number;
  formulaeImported: number;
  codeBlocksImported: number;
  linksImported: number;
  audioImported: number;
  videoImported: number;
  highConfidence: number;
  mediumConfidence: number;
  lowConfidence: number;
  overallConfidence: number;
  processingTime?: number;
  pagesProcessed?: number;
  sourceType?: string;
}

export function computeExtractionMetrics(questions: any[]): ExtractionSummaryMetrics {
  if (!Array.isArray(questions) || questions.length === 0) {
    return {
      questionsFound: 0,
      imagesImported: 0,
      tablesImported: 0,
      formulaeImported: 0,
      codeBlocksImported: 0,
      linksImported: 0,
      audioImported: 0,
      videoImported: 0,
      highConfidence: 0,
      mediumConfidence: 0,
      lowConfidence: 0,
      overallConfidence: 0,
    };
  }

  const seenImageUrls = new Set<string>();
  let tableCount = 0;
  let formulaCount = 0;
  let codeCount = 0;
  let linkCount = 0;
  let audioCount = 0;
  let videoCount = 0;

  let highConf = 0;
  let medConf = 0;
  let lowConf = 0;
  let totalConfSum = 0;

  for (const q of questions) {
    const meta = (q?.metadata || q || {}) as Record<string, any>;
    const qAttr = (q?.attributes || {}) as Record<string, any>;

    // 1. Unique non-placeholder Image count
    const imgUrl = String(
      meta.mediaUrl ||
      meta.media?.url ||
      meta.diagram?.dataUrl ||
      meta.diagram?.url ||
      (Array.isArray(meta.images) ? meta.images[0]?.dataUrl || meta.images[0]?.url : undefined) ||
      q.mediaUrl ||
      q.media?.url ||
      q.diagram?.dataUrl ||
      q.diagram?.url ||
      (Array.isArray(q.images) ? q.images[0]?.dataUrl || q.images[0]?.url : undefined) ||
      qAttr.mediaUrl ||
      ""
    ).trim();

    if (imgUrl && imgUrl !== "https://" && !seenImageUrls.has(imgUrl)) {
      seenImageUrls.add(imgUrl);
    }

    // 2. Table count (reconstructed native tables with valid headers/rows)
    const rawTable =
      meta.table ||
      (Array.isArray(meta.tables) && meta.tables.length > 0 ? meta.tables[0] : null) ||
      q.table ||
      (Array.isArray(q.tables) && q.tables.length > 0 ? q.tables[0] : null) ||
      qAttr.table;

    if (rawTable && typeof rawTable === "object") {
      const headers = Array.isArray(rawTable.headers) ? rawTable.headers.filter((h: any) => String(h).trim().length > 0) : [];
      const rows = Array.isArray(rawTable.rows) ? rawTable.rows : Array.isArray(rawTable.cells) ? rawTable.cells : [];
      const validRows = Array.isArray(rows) ? rows.filter((r: any) => Array.isArray(r) && r.some((c: any) => String(c).trim().length > 0)) : [];
      const hasHtml = typeof rawTable.html === "string" && rawTable.html.trim().length > 0;
      if (headers.length > 0 || validRows.length > 0 || hasHtml) {
        tableCount++;
      }
    }

    // 3. Formula count
    const rawFormulas =
      meta.formulas ||
      meta.equations ||
      q.formulas ||
      q.equations ||
      qAttr.formulas ||
      qAttr.equations;

    if (Array.isArray(rawFormulas) && rawFormulas.length > 0) {
      if (rawFormulas.some((f: any) => typeof f === "string" ? f.trim().length > 0 : Boolean(f?.latex || f?.content || f?.formula))) {
        formulaCount++;
      }
    } else if (typeof rawFormulas === "string" && rawFormulas.trim().length > 0) {
      formulaCount++;
    }

    // 4. Code count
    const codeObj = meta.code || q.code || qAttr.code || (Array.isArray(meta.codeBlocks) ? meta.codeBlocks[0] : null);
    const starterCode = String(meta.starterCode || q.starterCode || (codeObj?.code || codeObj?.content) || "").trim();
    const isCodingType = q.type === "coding" || q.type === "code_question" || q.type === "sql";
    if (starterCode.length > 0 || isCodingType) {
      codeCount++;
    }

    // 5. Link count
    const rawLinks = meta.hyperlinks || meta.hyperlink || q.hyperlinks || q.hyperlink || qAttr.hyperlinks;
    if (Array.isArray(rawLinks) && rawLinks.length > 0) {
      if (rawLinks.some((l: any) => typeof l === "string" ? l.trim().length > 0 : Boolean(l?.url || l?.text))) {
        linkCount++;
      }
    } else if (typeof rawLinks === "string" && rawLinks.trim().length > 0) {
      linkCount++;
    }

    // 6. Audio / Video count
    const mediaKind = meta.media?.kind || q.media?.kind;
    if (mediaKind === "audio" || q.type === "audio_based") audioCount++;
    if (mediaKind === "video" || q.type === "video_based") videoCount++;

    // 7. Dynamic confidence score calculation
    let rawConf = q.confidence;
    if (typeof rawConf === "object" && rawConf !== null) {
      rawConf = rawConf.overall ?? 0.9;
    }
    let confNum = typeof rawConf === "number" ? rawConf : 0.9;
    if (confNum <= 1) confNum = confNum * 100;
    confNum = Math.round(confNum);

    if (confNum >= 85) highConf++;
    else if (confNum >= 60) medConf++;
    else lowConf++;

    totalConfSum += confNum;
  }

  const overallConfidence = Math.round(totalConfSum / questions.length);

  return {
    questionsFound: questions.length,
    imagesImported: seenImageUrls.size,
    tablesImported: tableCount,
    formulaeImported: formulaCount,
    codeBlocksImported: codeCount,
    linksImported: linkCount,
    audioImported: audioCount,
    videoImported: videoCount,
    highConfidence: highConf,
    mediumConfidence: medConf,
    lowConfidence: lowConf,
    overallConfidence,
  };
}
