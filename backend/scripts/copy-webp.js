import fs from 'fs';

const src = 'C:/Users/texta/.gemini/antigravity-ide/brain/160dee42-f348-4f84-9af6-840f8cb9f8f9/quiz_block_tree_verified_live_1785952288984.webp';
const dest = 'C:/Users/texta/.gemini/antigravity-ide/brain/160dee42-f348-4f84-9af6-840f8cb9f8f9/quiz_block_tree_demo.webp';

if (fs.existsSync(src)) {
  fs.copyFileSync(src, dest);
  console.log('Webp recording copied to:', dest);
} else {
  console.log('Src webp file not found:', src);
}
