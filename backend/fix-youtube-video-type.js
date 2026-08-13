import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixYouTubeVideoType() {
  try {
    console.log('🔧 Fixing YouTube video type...');
    
    // Find the YouTube video lecture
    const youtubeVideo = await prisma.lecture.findFirst({
      where: {
        videoUrl: {
          contains: 'youtu.be'
        }
      }
    });
    
    if (!youtubeVideo) {
      console.log('❌ YouTube video not found');
      return;
    }
    
    console.log('📹 Found YouTube video:', youtubeVideo.title);
    console.log('📹 Current videoType:', youtubeVideo.videoType);
    console.log('📹 Current videoUrl:', youtubeVideo.videoUrl);
    
    // Update the videoType to 'youtube'
    const updated = await prisma.lecture.update({
      where: { id: youtubeVideo.id },
      data: { videoType: 'youtube' }
    });
    
    console.log('✅ Updated videoType to youtube:', updated.videoType);
    
  } catch (error) {
    console.error('❌ Error fixing YouTube video type:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixYouTubeVideoType();
