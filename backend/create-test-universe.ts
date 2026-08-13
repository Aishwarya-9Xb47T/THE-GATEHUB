import { PrismaClient } from "@prisma/client";
import { publishLearningUniverse } from "./src/controllers/learning-universe-controller";

const prisma = new PrismaClient();

const testDsl = `
\\learninguniverse{
  title={Final Verification Universe},
  description={A comprehensive test of all blocks},
  difficulty={Advanced},
  estimatedhours={10}
}

\\track{
  title={Verification Track},
  description={Track description}
  
  \\module{
    title={Verification Module},
    description={Module description}
    
    \\lesson{
      title={Complete Verification Lesson}
      
      \\overview{
        # Overview
        This is an overview.
      }
      
      \\theory{
        # Theory
        This is the theory section.
      }
      
      \\note{
        This is a note.
      }
      
      \\tip{
        This is a tip.
      }
      
      \\warning{
        This is a warning.
      }
      
      \\image{
        file={test-image.png},
        alt={A test image}
      }
      
      \\video{
        type={youtube},
        url={https://www.youtube.com/watch?v=dQw4w9WgXcQ}
      }
      
      \\video{
        file={test-video.mp4}
      }
      
      \\codeexample{
        language={javascript},
        code={console.log("Hello World");}
      }
      
      \\practice{
        title={Practice Lab},
        language={javascript},
        initialcode={function add(a, b) {\n  // your code here\n}},
        expectedoutput={5}
      }
      
      \\quiz{
        title={Verification Quiz},
        question={What is 2 + 2?},
        optionA={3},
        optionB={4},
        optionC={5},
        optionD={6},
        correct={B}
      }
      
      \\project{
        title={Final Project},
        description={Build a full stack app},
        colab={https://colab.research.google.com/},
        github={https://github.com/},
        instructions={Follow these instructions.}
      }
      
      \\resource{
        title={Test Resource},
        url={https://example.com}
      }
      
      \\download{
        title={Test Download},
        file={test-download.pdf}
      }
      
      \\checkpoint{
        content={Have you completed everything?}
      }
      
      \\discussion{
        prompt={Discuss your findings.}
      }
    }
  }
}
`;

async function main() {
  const user = await prisma.user.findFirst({ where: { role: "instructor" } });
  if (!user) {
    console.error("No instructor user found");
    return;
  }
  
  // Dummy files
  const files = [
    { originalname: "test-image.png", buffer: Buffer.from("image content"), mimetype: "image/png", size: 100 },
    { originalname: "test-video.mp4", buffer: Buffer.from("video content"), mimetype: "video/mp4", size: 100 },
    { originalname: "test-download.pdf", buffer: Buffer.from("pdf content"), mimetype: "application/pdf", size: 100 }
  ];
  
  const universe = await publishLearningUniverse(testDsl, user.id, files as any);
  console.log("SUCCESSFULLY PUBLISHED UNIVERSE: " + universe.id);
}

main().catch(console.error).finally(() => prisma.$disconnect());
