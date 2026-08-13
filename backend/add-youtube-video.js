import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function addYouTubeVideo() {
  try {
    console.log('🔧 Adding YouTube video for testing...');
    
    // Find the course and section
    const course = await prisma.course.findUnique({
      where: { id: 'cmoi8dkr80002fynjr9fxzx1a' },
      include: { sections: true }
    });
    
    if (!course) {
      console.log('❌ Course not found');
      return;
    }
    
    const section = course.sections[0];
    if (!section) {
      console.log('❌ Section not found');
      return;
    }
    
    // Create a YouTube video lecture
    const youtubeVideo = await prisma.lecture.create({
      data: {
        title: 'YouTube Video Test',
        type: 'video',
        videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        videoType: 'youtube',
        sectionId: section.id,
        order: 5
      }
    });
    
    console.log('✅ YouTube video created:', youtubeVideo);
    console.log('📹 YouTube URL:', youtubeVideo.videoUrl);
    console.log('📹 Video Type:', youtubeVideo.videoType);
    
  } catch (error) {
    console.error('❌ Error adding YouTube video:', error);
  } finally {
    await prisma.$disconnect();
  }
}

addYouTubeVideo();
