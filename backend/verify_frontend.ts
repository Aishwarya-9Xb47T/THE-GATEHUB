import puppeteer from 'puppeteer';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  const assets = await prisma.learningUniverseAsset.findMany();
  const targetAsset = assets.find(a => a.filename === 'Media Player 2025-12-14 00-07-09.mp4');
  if (!targetAsset) {
    console.log('Target asset not found in database.');
    return;
  }

  const universeId = targetAsset.learningUniverseId;
  const url = `http://localhost:5173/learning-universe/${universeId}/learn`;
  console.log(`1. Opening universe: ${url}`);

  const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
  const page = await browser.newPage();

  // 3. Catch browser console errors
  const browserErrors = [];
  const networkErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') browserErrors.push(`[Console Error] ${msg.text()}`);
  });
  page.on('pageerror', err => {
    browserErrors.push(`[Page Error] ${err.toString()}`);
  });
  page.on('requestfailed', request => {
    networkErrors.push(`[Network Error] ${request.url()} - ${request.failure()?.errorText}`);
  });
  page.on('response', response => {
    if (!response.ok() && response.request().resourceType() === 'media') {
      networkErrors.push(`[Media Network Error] ${response.url()} - Status: ${response.status()}`);
    }
  });

  // Inject a script to listen to events BEFORE navigation
  await page.evaluateOnNewDocument(() => {
    window.videoEventsFired = [];
    document.addEventListener('loadedmetadata', e => { if(e.target.tagName === 'VIDEO') window.videoEventsFired.push('loadedmetadata') }, true);
    document.addEventListener('loadeddata', e => { if(e.target.tagName === 'VIDEO') window.videoEventsFired.push('loadeddata') }, true);
    document.addEventListener('canplay', e => { if(e.target.tagName === 'VIDEO') window.videoEventsFired.push('canplay') }, true);
    document.addEventListener('canplaythrough', e => { if(e.target.tagName === 'VIDEO') window.videoEventsFired.push('canplaythrough') }, true);
    document.addEventListener('error', e => { if(e.target.tagName === 'VIDEO') window.videoEventsFired.push('error') }, true);
  });

  await page.goto(url, { waitUntil: 'networkidle0' });

  // Wait for video element to exist
  try {
    await page.waitForSelector('video', { timeout: 10000 });
  } catch (e) {
    console.log("Could not find video element after 10s.");
  }

  console.log("\n2. Inspect the rendered video DOM");
  const domInfo = await page.evaluate(() => {
    const v = document.querySelector('video');
    if (!v) return null;
    
    const computed = window.getComputedStyle(v);
    const parentComputed = window.getComputedStyle(v.parentElement);
    const parentRect = v.parentElement.getBoundingClientRect();
    const rect = v.getBoundingClientRect();
    
    return {
      outerHTML: v.outerHTML,
      computedWidth: computed.width,
      computedHeight: computed.height,
      display: computed.display,
      visibility: computed.visibility,
      opacity: computed.opacity,
      objectFit: computed.objectFit,
      parentWidth: parentComputed.width,
      parentHeight: parentComputed.height,
      parentDisplay: parentComputed.display
    };
  });
  
  if (domInfo) {
    console.log("* outerHTML:", domInfo.outerHTML);
    console.log("* computed width:", domInfo.computedWidth);
    console.log("* computed height:", domInfo.computedHeight);
    console.log("* display:", domInfo.display);
    console.log("* visibility:", domInfo.visibility);
    console.log("* opacity:", domInfo.opacity);
    console.log("* object-fit:", domInfo.objectFit);
    console.log("* parent container dimensions:", domInfo.parentWidth, "x", domInfo.parentHeight, "display:", domInfo.parentDisplay);
  } else {
    console.log("Video element not found in DOM.");
  }

  console.log("\n3. Check browser console");
  if (browserErrors.length === 0 && networkErrors.length === 0) {
    console.log("No errors detected.");
  } else {
    browserErrors.forEach(e => console.log(e));
    networkErrors.forEach(e => console.log(e));
  }

  console.log("\n4. Run this directly in browser console:");
  const videoProps = await page.evaluate(() => {
    const v = document.querySelector('video');
    if (!v) return null;
    return {
      src: v.src,
      readyState: v.readyState,
      networkState: v.networkState,
      duration: v.duration,
      videoWidth: v.videoWidth,
      videoHeight: v.videoHeight,
      paused: v.paused,
      error: v.error ? v.error.message : null
    };
  });
  console.log(videoProps);

  console.log("\n5. Verify whether metadata loads:");
  const events = await page.evaluate(() => window.videoEventsFired);
  console.log("Events fired:", events.length > 0 ? events.join(", ") : "None");

  await browser.close();
  await prisma.$disconnect();
}

run().catch(console.error);
