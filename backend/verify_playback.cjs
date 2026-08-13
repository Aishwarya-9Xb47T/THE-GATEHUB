const puppeteer = require('puppeteer');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const jwt = require('jsonwebtoken');

async function run() {
  const targetUniverseId = 'cmqoqxg5u00035menp5pobgqc';
  const url = 'http://localhost:5173/student/learning-universe/' + targetUniverseId + '/learn';

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();

  const user = await prisma.user.findFirst();
  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'supersecret_jwt_key_123_456_789');
  const authState = { state: { token, user }, version: 0 };

  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
  await page.evaluate((state) => {
    localStorage.setItem('lms-auth', JSON.stringify(state));
  }, authState);

  await page.goto(url, { waitUntil: 'networkidle0' });
  
  // Wait explicitly for the video to appear
  try {
    await page.waitForSelector('video', { timeout: 10000 });
  } catch (e) {
    console.log('Video element did not appear within 10s');
    const html = await page.evaluate(() => document.body.innerHTML);
    if (html.includes('Video not available')) console.log('Found "Video not available" text');
  }

  const videoStats = await page.evaluate(() => {
    const v = document.querySelector('video');
    if (!v) return null;
    return {
      readyState: v.readyState,
      networkState: v.networkState,
      duration: v.duration,
      videoWidth: v.videoWidth,
      videoHeight: v.videoHeight,
      error: v.error ? v.error.message : null,
      src: v.currentSrc,
      html: v.outerHTML
    };
  });

  console.log('Video state:', videoStats);

  if (videoStats) {
    const playResult = await page.evaluate(async () => {
      const v = document.querySelector('video');
      try {
        await v.play();
        return 'Played successfully';
      } catch (e) {
        return 'Play error: ' + e.message;
      }
    });

    console.log(playResult);
    await new Promise(r => setTimeout(r, 3000));

    const finalStats = await page.evaluate(() => {
      const v = document.querySelector('video');
      return {
        currentTime: v.currentTime,
        paused: v.paused
      };
    });

    console.log('Final state:', finalStats);
    
    if (finalStats.currentTime > 0 && !finalStats.paused) {
      console.log('SUCCESS: currentTime increased. playback proof achieved.');
    } else {
      console.log('FAILED: video did not play.');
    }
  }

  await browser.close();
  await prisma.$disconnect();
}
run().catch(console.error);
