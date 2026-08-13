import { prisma } from '../src/utils/prisma.js';

async function check() {
  console.log('=== PRISMA DB RECORD CHECK ===');
  const questions = await prisma.question.findMany({
    where: { text: { contains: 'Identify the object' } },
    take: 5,
    orderBy: { createdAt: 'desc' },
  });

  console.log('Matching Questions Count:', questions.length);
  for (const q of questions) {
    console.log('\n--- QUESTION RECORD ---');
    console.log('ID:', q.id);
    console.log('Quiz ID:', q.quizId);
    console.log('Text:', q.text);
    console.log('Type:', q.type);
    console.log('Metadata:', JSON.stringify(q.metadata, null, 2));
  }
  await prisma.$disconnect();
}

check().catch(console.error);
