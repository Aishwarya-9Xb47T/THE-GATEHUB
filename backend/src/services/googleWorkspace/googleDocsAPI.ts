/**
 * Google Docs API Service
 * Handles Docs API calls for fetching document content
 */

import { google } from 'googleapis';
import type { GoogleOAuthTokens } from './googleOAuth.js';

export interface GoogleDocsContent {
  title: string;
  body: {
    content: Array<{
      paragraph?: {
        elements?: Array<{
          textRun?: {
            content: string;
          };
        }>;
      };
      table?: {
        tableRows?: Array<{
          tableCells?: Array<{
            content?: Array<{
              paragraph?: {
                elements?: Array<{
                  textRun?: {
                    content: string;
                  };
                }>;
              };
            }>;
          }>;
        }>;
      };
    }>;
  };
}

/**
 * Create Docs API client with OAuth tokens
 */
export function createDocsClient(tokens: GoogleOAuthTokens) {
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
  
  return google.docs({ version: 'v1', auth: oauth2Client });
}

/**
 * Get Google Docs content
 */
export async function getDocsContent(
  tokens: GoogleOAuthTokens,
  documentId: string
): Promise<GoogleDocsContent> {
  const docs = createDocsClient(tokens);
  
  const response = await docs.documents.get({
    documentId,
  });
  
  return response.data as GoogleDocsContent;
}

/**
 * Export Google Docs to plain text
 */
export async function exportDocsToText(
  tokens: GoogleOAuthTokens,
  documentId: string
): Promise<string> {
  const docs = createDocsClient(tokens);
  
  const response = await docs.documents.get({
    documentId,
  });
  
  const document = response.data;
  let text = '';
  
  if (document.body?.content) {
    for (const element of document.body.content) {
      if (element.paragraph?.elements) {
        for (const paraElement of element.paragraph.elements) {
          if (paraElement.textRun?.content) {
            text += paraElement.textRun.content;
          }
        }
        text += '\n';
      }
    }
  }
  
  return text.trim();
}

/**
 * Export Google Docs to HTML
 */
export async function exportDocsToHTML(
  tokens: GoogleOAuthTokens,
  documentId: string
): Promise<string> {
  const docs = createDocsClient(tokens);
  
  const response = await docs.documents.get({
    documentId,
  });
  
  const document = response.data;
  let html = '';
  
  if (document.body?.content) {
    for (const element of document.body.content) {
      if (element.paragraph?.elements) {
        html += '<p>';
        for (const paraElement of element.paragraph.elements) {
          if (paraElement.textRun?.content) {
            html += paraElement.textRun.content;
          }
        }
        html += '</p>\n';
      }
    }
  }
  
  return html;
}

/**
 * Extract text content from Docs structure
 */
export function extractTextFromDocs(docsContent: GoogleDocsContent): string {
  let text = '';
  
  if (docsContent.body?.content) {
    for (const element of docsContent.body.content) {
      if (element.paragraph?.elements) {
        for (const paraElement of element.paragraph.elements) {
          if (paraElement.textRun?.content) {
            text += paraElement.textRun.content;
          }
        }
        text += '\n';
      }
    }
  }
  
  return text.trim();
}
