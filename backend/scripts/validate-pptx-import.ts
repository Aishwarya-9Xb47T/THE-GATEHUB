import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const TOLERANCE = 100_000;

function getPos(el) {
  return el.transform ?? el.position ?? { x:0, y:0, width:0, height:0 };
}

function validateEl(el, sw, sh, warns, errs, imgStats, types, depth=0) {
  const prefix = "  ".repeat(depth);
  const pos = getPos(el);
  const tag = "[" + el.type + " id=" + el.id + "]";
  types[el.type] = (types[el.type] ?? 0) + 1;
  if (pos.width===0 && pos.height===0) warns.push(prefix+tag+" zero size");
  if (pos.x < -TOLERANCE) errs.push(prefix+tag+" x="+pos.x+" negative");
  if (pos.y < -TOLERANCE) errs.push(prefix+tag+" y="+pos.y+" negative");
  if (pos.x + pos.width > sw + TOLERANCE) warns.push(prefix+tag+" right edge overflow");
  if (pos.y + pos.height > sh + TOLERANCE) warns.push(prefix+tag+" bottom edge overflow");
  if (el.type==="image") {
    imgStats.total++;
    if (!el.src) { imgStats.broken++; warns.push(prefix+tag+" NO src"); }
    else if (el.src.startsWith("asset://")) errs.push(prefix+tag+" unresolved asset:// src");
    else imgStats.withSrc++;
  }
  if (el.type==="text") {
    const hasText = (el.paragraphs||[]).some(p => (p.runs||[]).some(r => r.text && r.text.trim()) || (p.text && p.text.trim()));
    if (!hasText) warns.push(prefix+tag+" text element with no actual text");
  }
  if (el.type==="table") {
    if (!(el.columns && el.columns.length)) warns.push(prefix+tag+" table no columns");
    if (!(el.rows && el.rows.length)) warns.push(prefix+tag+" table no rows");
  }
  if (el.type==="group" && el.children) {
    for (const c of el.children) validateEl(c, sw, sh, warns, errs, imgStats, types, depth+1);
  }
}

async function run(presentationId) {
  console.log("Validating: " + presentationId);
  const pres = await prisma.presentation.findUnique({
    where: { id: presentationId },
    include: { slides: { orderBy: { order: "asc" } } }
  });
  if (!pres) { console.error("NOT FOUND"); process.exit(1); }
  console.log("Title: " + pres.title + " | Slides: " + pres.slides.length);
  let totalErr=0, totalWarn=0, totalEls=0;
  const gTypes = {}, gImg = { total:0, withSrc:0, broken:0 };
  for (const slide of pres.slides) {
    const c = slide.content;
    if (!c) { console.warn("Slide "+slide.order+" no content"); continue; }
    const sw = Number(c.size?.width ?? 12192000);
    const sh = Number(c.size?.height ?? 6858000);
    const els = c.elements ?? [];
    const warns=[], errs=[], types={}, imgStats={total:0,withSrc:0,broken:0};
    if (sw<=0) errs.push("invalid slideWidth");
    if (sh<=0) errs.push("invalid slideHeight");
    if (!els.length) warns.push("blank slide");
    for (const el of els) validateEl(el,sw,sh,warns,errs,imgStats,types);
    totalErr+=errs.length; totalWarn+=warns.length; totalEls+=els.length;
    for (const [k,v] of Object.entries(types)) gTypes[k]=(gTypes[k]??0)+v;
    gImg.total+=imgStats.total; gImg.withSrc+=imgStats.withSrc; gImg.broken+=imgStats.broken;
    const icon = errs.length?"FAIL":warns.length?"WARN":"OK  ";
    const sw_in = (sw/914400).toFixed(2), sh_in = (sh/914400).toFixed(2);
    console.log("["+icon+"] Slide "+slide.order+": \""+slide.title+"\" "+els.length+" els | "+sw_in+'"x'+sh_in+'"');
    if (imgStats.total) console.log("       Images: "+imgStats.total+" total, "+imgStats.withSrc+" OK, "+imgStats.broken+" broken");
    for (const e of errs) console.log("       ERR: "+e);
    for (const w of warns) console.log("       WRN: "+w);
  }
  console.log("--- SUMMARY ---");
  console.log("Slides: "+pres.slides.length+" | Elements: "+totalEls+" | Errors: "+totalErr+" | Warnings: "+totalWarn);
  const typeStr = Object.entries(gTypes).map(function(kv){ return kv[0]+"="+kv[1]; }).join(" ");
  console.log("Types: " + typeStr);
  if (gImg.total) console.log("Images: "+gImg.total+" total, "+gImg.withSrc+" OK, "+gImg.broken+" broken");
  if (!totalErr && !totalWarn) console.log("ALL PASSED");
  else if (!totalErr) console.log("PASSED WITH "+totalWarn+" WARNINGS");
  else console.log("FAILED: "+totalErr+" errors, "+totalWarn+" warnings");
}

async function main() {
  const id = process.argv[2];
  if (!id) {
    console.log("Usage: npx tsx backend/scripts/validate-pptx-import.ts <presentationId>");
    const recents = await prisma.presentation.findMany({
      take:10, orderBy:{createdAt:"desc"},
      select:{id:true,title:true,sourceType:true,status:true,_count:{select:{slides:true}}}
    });
    console.log("\nRecent presentations:");
    for (const p of recents) console.log("  "+p.id+"  \""+p.title+"\"  ["+p.sourceType+"] "+p._count.slides+" slides");
    await prisma.$disconnect();
    return;
  }
  try { await run(id); }
  catch(e) { console.error("Error:",e.message); }
  finally { await prisma.$disconnect(); }
}
main();
