import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs';

const prisma = new PrismaClient();

async function updateVideoUrls() {
  try {
    console.log('🔧 Updating video lecture URLs...');
    
    // Get all video lectures
    const videoLectures = await prisma.lecture.findMany({
      where: { type: 'video' },
      include: { section: { include: { course: true } } }
    });
    
    console.log(`Found ${videoLectures.length} video lectures`);
    
    // Get uploaded video files
    const uploadsDir = path.join(process.cwd(), 'uploads');
    const videoFiles = fs.readdirSync(uploadsDir).filter(file => file.endsWith('.mp4'));
    
    console.log('Available video files:', videoFiles);
    
    // Update video lectures with video URLs
    for (let i = 0; i < videoLectures.length && i < videoFiles.length; i++) {
      const lecture = videoLectures[i];
      const videoFile = videoFiles[i];
      
      console.log(`Updating lecture "${lecture.title}" with video file: ${videoFile}`);
      
      await prisma.lecture.update({
        where: { id: lecture.id },
        data: {
          videoUrl: videoFile,
          videoType: 'upload'
        }
      });
      
      console.log(`✅ Updated lecture ${lecture.id} with videoUrl: ${videoFile}`);
    }
    
    console.log('🎉 Video URLs updated successfully!');
    
  } catch (error) {
    console.error('❌ Error updating video URLs:', error);
  } finally {
    await prisma.$disconnect();
  }
}

updateVideoUrls();
