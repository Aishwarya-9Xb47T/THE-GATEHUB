import fs from 'fs';
import path from 'path';

const src = 'C:/Users/texta/.gemini/antigravity-ide/brain/160dee42-f348-4f84-9af6-840f8cb9f8f9/.system_generated/click_feedback/click_feedback_1785951324845.png';
const dest = 'C:/Users/texta/.gemini/antigravity-ide/brain/160dee42-f348-4f84-9af6-840f8cb9f8f9/live_ui_successful_import.png';

fs.copyFileSync(src, dest);
console.log('Screenshot copied to:', dest);
