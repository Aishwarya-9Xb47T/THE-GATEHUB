// Direct database fix for PDF URL
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixPdfUrl() {
  console.log("🚨 DIRECT DATABASE FIX - Fixing PDF URL...");
  
  try {
    const lectureId = "cmofaz2ro000313qxsu9wwgoj";
    const pdfUrl = "/uploads/latex/pdfs/compiled-cmofaz2ro000313qxsu9wwgoj.pdf";
    
    // Direct database update
    const updated = await prisma.lecture.update({
      where: { id: lectureId },
      data: { 
        content: pdfUrl,
        updatedAt: new Date()
      }
    });
    
    console.log("✅ Lecture updated successfully:");
    console.log("   ID:", updated.id);
    console.log("   Title:", updated.title);
    console.log("   Content:", updated.content);
    console.log("   Type:", updated.type);
    
    // Verify the update
    const verified = await prisma.lecture.findUnique({
      where: { id: lectureId }
    });
    
    console.log("🔍 Verification:");
    console.log("   Content is PDF URL:", verified.content?.startsWith('/uploads/'));
    console.log("   PDF URL:", verified.content);
    
    console.log("🎉 DATABASE FIX COMPLETED!");
    console.log("✅ PDF URL now stored in database");
    console.log("✅ Student side should now show the PDF");
    
  } catch (error) {
    console.error("❌ Database fix failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

fixPdfUrl();
