import fs from 'fs';
import { AntiGravityV2Engine } from '../src/services/antigravityV2/AntiGravityV2Engine.js';

async function fullTrace() {
  const filePath = 'C:/Users/texta/Downloads/Word Import Test Suite.docx';
  if (!fs.existsSync(filePath)) {
    console.error('FILE NOT FOUND:', filePath);
    process.exit(1);
  }

  const buffer = fs.readFileSync(filePath);
  const result = await AntiGravityV2Engine.processDocument({ name: 'Word Import Test Suite.docx', buffer });

  // === STAGE 1: PARSER OUTPUT ===
  console.log('\n========== STAGE 1: PARSER BLOCK TYPES ==========');
  const typeCounts: Record<string, number> = {};
  for (const b of result.blocks) {
    const t = (b as any).type || 'unknown';
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  }
  console.log('Block type counts:', JSON.stringify(typeCounts, null, 2));
  console.log('Total blocks:', result.blocks.length);
  console.log('Total tables:', result.tables.length);
  console.log('Total code blocks:', result.codeBlocks.length);
  console.log('Total equations:', result.equations.length);
  console.log('Total images:', result.document?.images?.length ?? 'N/A');

  // === STAGE 2: QUESTION GRAPH TRACE ===
  console.log('\n========== STAGE 2: QUESTION GRAPH ==========');
  for (const q of result.questions) {
    console.log(`\n  Q[${q.id}] stem="${q.stem.substring(0,60)}" type=${q.type}`);
    console.log(`    children (${q.children.length}):`, q.children.map((c: any) => c.type).join(', '));
    console.log(`    tables:${q.associatedTables.length} code:${q.associatedCode.length} math:${q.associatedMath.length} images:${q.associatedImages.length} hyperlinks:${q.hyperlinks.length}`);
    if (q.associatedImages.length > 0) {
      q.associatedImages.forEach((img: any, i: number) => {
        console.log(`    IMAGE[${i}] id=${img.id} url=${img.url?.substring(0,50)} base64=${img.base64?.substring(0,30)}`);
      });
    }
    if (q.associatedCode.length > 0) {
      q.associatedCode.forEach((c: any, i: number) => {
        const lines = c.code?.split('\n').length || 0;
        console.log(`    CODE[${i}] lang=${c.language} lines=${lines} code="${c.code?.substring(0,60)}"`);
      });
    }
    if (q.associatedMath.length > 0) {
      q.associatedMath.forEach((m: any, i: number) => {
        console.log(`    MATH[${i}] latex="${m.latex}"`);
      });
    }
    if (q.associatedTables.length > 0) {
      q.associatedTables.forEach((t: any, i: number) => {
        console.log(`    TABLE[${i}] headers=${JSON.stringify(t.headers)} rows=${t.grid?.length}`);
      });
    }
    if (q.hyperlinks.length > 0) {
      console.log(`    HYPERLINKS:`, q.hyperlinks);
    }
    const listChildren = q.children.filter((c: any) => c.type === 'list');
    if (listChildren.length > 0) {
      listChildren.forEach((l: any, i: number) => {
        console.log(`    LIST[${i}] ordered=${l.ordered} items=${l.items?.length}`);
      });
    }
  }

  // === STAGE 3: ADAPTER METADATA TRACE ===
  console.log('\n========== STAGE 3: ADAPTER METADATA (what reaches DB) ==========');
  const { DocumentIntelligenceAdapter } = await import('../src/services/assessmentStudio/import/extractors/DocumentIntelligenceAdapter.js');
  const drafts = await DocumentIntelligenceAdapter.extract({ name: 'Word Import Test Suite.docx', buffer });

  for (const d of drafts) {
    const meta = d.metadata as any;
    const hasImage = !!(meta?.mediaUrl || (Array.isArray(meta?.images) && meta.images.length > 0));
    const hasCode = !!(meta?.code || meta?.starterCode || (Array.isArray(meta?.codeBlocks) && meta.codeBlocks.length > 0));
    const hasTable = !!(meta?.table || (Array.isArray(meta?.tables) && meta.tables.length > 0));
    const hasFormula = !!(Array.isArray(meta?.formulas) && meta.formulas.length > 0 || Array.isArray(meta?.equations) && meta.equations.length > 0);
    const hasLink = !!(Array.isArray(meta?.hyperlinks) && meta.hyperlinks.length > 0);
    const hasList = !!(meta?.lists || meta?.list);
    const children = meta?.children || [];
    const childTypes = children.map((c: any) => c.type).join(', ');

    const flags = [
      hasImage ? '🖼️IMG' : '',
      hasCode ? '💻CODE' : '',
      hasTable ? '📋TABLE' : '',
      hasFormula ? '∑FORMULA' : '',
      hasLink ? '🔗LINK' : '',
      hasList ? '📝LIST' : '',
    ].filter(Boolean).join(' ');

    console.log(`  D[${d.id}] text="${(d.text || '').substring(0,50)}" type=${d.type} ${flags || '(text only)'}`);
    if (childTypes) console.log(`    children types: ${childTypes}`);
    if (hasImage) {
      const imgs = meta?.images || (meta?.mediaUrl ? [{ url: meta.mediaUrl }] : []);
      console.log(`    images:`, imgs.map((img: any) => img.url?.substring(0,40) || img.dataUrl?.substring(0,40)));
    }
    if (hasCode) {
      const codeStr = (meta?.starterCode || meta?.code?.code || '').substring(0,80);
      console.log(`    code (${meta?.language}):`, codeStr);
    }
    if (hasTable) {
      const tbl = meta?.table || meta?.tables?.[0];
      console.log(`    table headers:`, tbl?.headers, 'rows:', tbl?.rows?.length);
    }
    if (hasFormula) {
      console.log(`    formulas:`, meta?.formulas || meta?.equations?.map((e: any) => e.latex));
    }
    if (hasLink) {
      console.log(`    hyperlinks:`, meta?.hyperlinks);
    }
  }

  // Summary of what is LOST
  console.log('\n========== LOSS SUMMARY ==========');
  const q8 = result.questions.find((q: any) => q.id === 'v2_q_8');
  const d8 = drafts.find((d: any) => d.id === 'v2_q_8');
  console.log('Q8 (code question):');
  console.log('  Parser code blocks:', q8?.associatedCode.length);
  console.log('  Adapter starterCode:', (d8?.metadata as any)?.starterCode?.substring(0,60));

  const q10 = result.questions.find((q: any) => q.id === 'v2_q_10');
  const d10 = drafts.find((d: any) => d.id === 'v2_q_10');
  console.log('Q10 (formula question):');
  console.log('  Parser math:', q10?.associatedMath.length, q10?.associatedMath.map((m: any) => m.latex));
  console.log('  Adapter formulas:', (d10?.metadata as any)?.formulas);

  const q7 = result.questions.find((q: any) => q.id === 'v2_q_7');
  const d7 = drafts.find((d: any) => d.id === 'v2_q_7');
  console.log('Q7 (table question):');
  console.log('  Parser tables:', q7?.associatedTables.length);
  console.log('  Adapter table headers:', (d7?.metadata as any)?.table?.headers);
  console.log('  Adapter table rows:', (d7?.metadata as any)?.table?.rows?.length);

  const q16 = result.questions.find((q: any) => q.id === 'v2_q_16');
  const d16 = drafts.find((d: any) => d.id === 'v2_q_16');
  console.log('Q16 (image question):');
  console.log('  Parser images:', q16?.associatedImages.length);
  console.log('  Adapter images:', (d16?.metadata as any)?.images?.length, 'mediaUrl:', (d16?.metadata as any)?.mediaUrl?.substring(0,30));
}

fullTrace().catch(console.error);
