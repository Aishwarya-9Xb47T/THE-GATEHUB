/**
 * Google Forms API Service
 * Handles Forms API calls for fetching form content
 */

import { google } from 'googleapis';
import type { GoogleOAuthTokens } from './googleOAuth.js';
import { ingestGoogleFormsApiResponse, ingestPublicGoogleFormHtml } from './googleFormsIngestion.js';

export interface GoogleFormsContent {
  formId: string;
  info: {
    title: string;
    description?: string;
  };
  items: Array<{
    itemId: string;
    title?: string;
    description?: string;
    questionItem?: {
      question: {
        questionId: string;
        required?: boolean;
        grading?: {
          pointValue?: number;
        };
        choiceQuestion?: {
          options: Array<{
            value: string;
            isCorrect?: boolean;
          }>;
          type?: 'RADIO' | 'CHECKBOX' | 'DROP_DOWN';
        };
        textQuestion?: {
          paragraph?: boolean;
        };
      };
    };
  }>;
}

/**
 * Create Forms API client with OAuth tokens
 */
export function createFormsClient(tokens: GoogleOAuthTokens) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  
  oauth2Client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date,
  });
  
  return google.forms({ version: 'v1', auth: oauth2Client });
}

/**
 * Get Google Forms content
 */
export async function getFormsContent(
  tokens: GoogleOAuthTokens,
  formId: string
): Promise<GoogleFormsContent> {
  const forms = createFormsClient(tokens);
  
  const response = await forms.forms.get({
    formId,
  });
  
  return response.data as GoogleFormsContent;
}

/**
 * Export Google Forms to plain text
 */
export async function exportFormsToText(
  tokens: GoogleOAuthTokens,
  formId: string
): Promise<string> {
  const formsContent = await getFormsContent(tokens, formId);
  
  let text = `Form: ${formsContent.info.title}\n`;
  if (formsContent.info.description) {
    text += `Description: ${formsContent.info.description}\n`;
  }
  text += '\n';
  
  if (formsContent.items) {
    for (const item of formsContent.items) {
      if (item.title) {
        text += `Q: ${item.title}\n`;
      }
      if (item.description) {
        text += `${item.description}\n`;
      }
      
      if (item.questionItem?.question) {
        const question = item.questionItem.question;
        
        if (question.choiceQuestion?.options) {
          text += 'Options:\n';
          for (const option of question.choiceQuestion.options) {
            const correctMark = option.isCorrect ? ' ✓' : '';
            text += `- ${option.value}${correctMark}\n`;
          }
        }
        
        if (question.grading?.pointValue) {
          text += `Points: ${question.grading.pointValue}\n`;
        }
        
        if (question.required) {
          text += 'Required: Yes\n';
        }
      }
      
      text += '\n';
    }
  }
  
  return text.trim();
}

/**
 * Extract and parse questions from Forms structure into ExtractedQuestionDraft objects.
 * @deprecated Prefer ingestGoogleFormsApiResponse with full context.
 */
export function parseGoogleFormToDrafts(formsContent: any, sourceUrl = ''): any[] {
  return ingestGoogleFormsApiResponse(formsContent, {
    formId: formsContent?.formId || 'unknown',
    sourceUrl,
    formTitle: formsContent?.info?.title,
    formDescription: formsContent?.info?.description,
  }, 'forms_api');
}

export function parsePublicGoogleFormHtml(html: string, sourceUrl = ''): any[] {
  return ingestPublicGoogleFormHtml(html, {
    formId: 'public',
    sourceUrl,
  }, 'public_html_fallback');
}


