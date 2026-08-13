// Emergency fix to set compiledPdfUrl for student PDF viewing
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function emergencyStudentPdfFix() {
  console.log("🚨 EMERGENCY: Fixing student PDF viewing...");
  
  try {
    const lectureId = "cmofaz2ro000313qxsu9wwgoj";
    
    // Set a known working PDF URL
    const workingPdfUrl = "/uploads/latex/pdfs/compiled-cmofaz2ro000313qxsu9wwgoj.pdf";
    
    console.log("🔧 Updating lecture with working PDF URL...");
    
    const updated = await prisma.lecture.update({
      where: { id: lectureId },
      data: { 
        compiledPdfUrl: workingPdfUrl,
        updatedAt: new Date()
      }
    });
    
    console.log("✅ Database updated successfully!");
    console.log("   Lecture ID:", updated.id);
    console.log("   Title:", updated.title);
    console.log("   compiledPdfUrl:", updated.compiledPdfUrl);
    console.log("   Updated at:", updated.updatedAt);
    
    // Verify the update
    console.log("🔍 Verifying update...");
    const verified = await prisma.lecture.findUnique({
      where: { id: lectureId }
    });
    
    if (verified && verified.compiledPdfUrl === workingPdfUrl) {
      console.log("✅ Verification successful!");
      console.log("🚀 STUDENT SHOULD NOW SEE PDF!");
      console.log("✅ Refresh student page to see PDF");
      console.log("✅ PDF will be accessible at:", workingPdfUrl);
    } else {
      console.log("❌ Verification failed");
    }
    
  } catch (error) {
    console.error("❌ Emergency fix failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

emergencyStudentPdfFix();
