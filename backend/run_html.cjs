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
  await new Promise(r => setTimeout(r, 2000));

  const clickRes = await page.evaluate(() => {
    const sections = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Lesson'));
    if (sections) {
        sections.click();
        return 'Clicked';
    }
    return 'Not Found';
  });

  await new Promise(r => setTimeout(r, 3000));
  
  const html = await page.evaluate(() => document.body.innerHTML);
  console.log('Video tag exists?', html.includes('<video'));
  console.log('Source tag exists?', html.includes('<source'));
  console.log('Video not available exists?', html.includes('Video not available'));
  
  await browser.close();
  await prisma.$disconnect();
}
run().catch(console.error);
