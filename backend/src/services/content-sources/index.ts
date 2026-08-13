/**
 * Content Sources Initialization
 * 
 * Registers all available content source adapters in the ContentSourceAdapterFactory.
 * This file should be imported early in the application startup.
 */

import { contentSourceAdapterFactory } from './ContentSourceAdapterFactory.js';
import { GoogleDocsAdapter } from './GoogleDocsAdapter.js';
import { GoogleFormsAdapter } from './GoogleFormsAdapter.js';
import { LocalFileAdapter } from './LocalFileAdapter.js';

// Register Google Docs adapter
contentSourceAdapterFactory.register(new GoogleDocsAdapter());

// Register Google Forms adapter
contentSourceAdapterFactory.register(new GoogleFormsAdapter());

// Register Local File adapter (PDF, DOCX, PPTX, TXT, CSV, Images)
contentSourceAdapterFactory.register(new LocalFileAdapter());

// Future adapters will be registered here:
// contentSourceAdapterFactory.register(new OneDriveAdapter());
// contentSourceAdapterFactory.register(new DropboxAdapter());
// contentSourceAdapterFactory.register(new NotionAdapter());

export { contentSourceAdapterFactory };
