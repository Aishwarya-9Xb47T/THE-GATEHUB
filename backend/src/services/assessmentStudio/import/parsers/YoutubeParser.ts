/**
 * YouTube Parser - Extracts transcript from YouTube videos
 * Uses YouTube Data API
 */

import { RawContent } from '../unifiedTypes.js';
import { AppError } from '../../../../middlewares/errorHandler.js';

export class YoutubeParser {
  static async extract(url: string): Promise<RawContent> {
    try {
      // Extract video ID from URL
      const videoIdMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/);
      if (!videoIdMatch) {
        throw new AppError(400, 'Invalid YouTube URL format');
      }
      const videoId = videoIdMatch[1];

      const apiKey = process.env.YOUTUBE_API_KEY;
      if (!apiKey) {
        throw new AppError(500, 'YOUTUBE_API_KEY not configured');
      }

      // Fetch captions from YouTube Data API
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId=${videoId}&key=${apiKey}`
      );

      if (!response.ok) {
        throw new AppError(500, `YouTube API error: ${response.statusText}`);
      }

      const data = await response.json() as any;
      
      if (!data.items || data.items.length === 0) {
        throw new AppError(404, 'No captions available for this video');
      }

      // Find English captions or first available
      const captionItem = data.items.find((item: any) => 
        item.snippet.language === 'en' || item.snippet.language === 'en-US'
      ) || data.items[0];

      const captionId = captionItem.id;

      // Fetch caption content
      const captionResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/captions/${captionId}?key=${apiKey}`
      );

      if (!captionResponse.ok) {
        throw new AppError(500, `Failed to fetch caption content: ${captionResponse.statusText}`);
      }

      const captionData = await captionResponse.json() as any;
      
      // Parse transcript from caption data
      const text = this.parseTranscript(captionData);

      return {
        text,
        images: [],
        metadata: {
          wordCount: text.split(/\s+/).length,
        },
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(500, `YouTube parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private static parseTranscript(captionData: any): string {
    // YouTube caption data may be in different formats
    // This is a simplified parser - in production you'd need to handle TTML or WebVTT formats
    if (captionData.text) {
      return captionData.text;
    }
    
    if (captionData.items && Array.isArray(captionData.items)) {
      return captionData.items
        .map((item: any) => item.text || item.snippet?.text || '')
        .filter((text: string) => text.length > 0)
        .join(' ');
    }
    
    return '';
  }
}
