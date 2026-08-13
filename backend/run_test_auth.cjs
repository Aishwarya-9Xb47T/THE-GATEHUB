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
  await page.evaluate((state, t) => {
    localStorage.setItem('lms-auth', JSON.stringify(state));
    localStorage.setItem('lms_token', t);
  }, authState, token);

  await page.goto(url, { waitUntil: 'networkidle0' });
  
  await new Promise(r => setTimeout(r, 2000));

  const clicked = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => b.textContent.includes('Lesson'));
    if (btn) {
      btn.click();
      return btn.textContent;
    }
    return null;
  });

  if (clicked) {
    console.log('Clicked lesson:', clicked.trim());
    await new Promise(r => setTimeout(r, 2000));
  }
  
  const videoStats = await page.evaluate(() => {
    const v = document.querySelector('video');
    if (!v) return null;
    return {
      readyState: v.readyState,
      duration: v.duration,
      src: v.currentSrc
    };
  });

  console.log('Video stats:', videoStats);

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
