import { PrismaClient } from '@prisma/client';

import path from 'path';

import {

  validateDeckFidelity,

  formatFidelityReport,

} from '../src/services/classroomStudio/presentationFidelityValidator.js';



const prisma = new PrismaClient();



async function main() {

  const id = process.argv[2];

  if (!id) {

    console.log('Usage: npx tsx backend/scripts/validate-presentation-visuals.ts <presentationId>');

    process.exit(0);

  }



  const pres = await prisma.presentation.findUnique({

    where: { id },

    include: { slides: { orderBy: { order: 'asc' } } },

  });



  if (!pres) {

    console.error('Presentation not found');

    process.exit(1);

  }



  const root = path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'uploads', 'classroom', id);

  const result = validateDeckFidelity({

    slides: pres.slides.map((s) => ({

      order: s.order,

      title: s.title,

      content: s.content as any,

    })),

    assetRoot: root,

    presentationId: id,

    originalPptxPath: path.join(root, 'source/original.pptx'),

    sourceSlideCount: pres.slides.length,

  });



  console.log(formatFidelityReport(result));

  process.exit(result.passed ? 0 : 1);

}



main().finally(() => prisma.$disconnect());

