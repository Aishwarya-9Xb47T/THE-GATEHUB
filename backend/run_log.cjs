const puppeteer = require('puppeteer');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const jwt = require('jsonwebtoken');

async function run() {
  const targetUniverseId = 'cmqoqxg5u00035menp5pobgqc';
  const url = 'http://localhost:5173/student/learning-universe/' + targetUniverseId + '/learn';

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));

  const user = await prisma.user.findFirst();
  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'supersecret_jwt_key_123_456_789');
  const authState = { state: { token, user }, version: 0 };

  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
  await page.evaluate((state) => {
    localStorage.setItem('lms-auth', JSON.stringify(state));
  }, authState);

  await page.goto(url, { waitUntil: 'networkidle0' });
  
  await new Promise(r => setTimeout(r, 5000));
  const html = await page.evaluate(() => document.body.innerHTML);
  console.log(html.substring(0, 1000));
  
  await browser.close();
  await prisma.$disconnect();
}
run().catch(console.error);
