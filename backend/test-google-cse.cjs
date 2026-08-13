require('dotenv').config();
const key = process.env.GOOGLE_CUSTOM_SEARCH_API_KEY;
const cx = process.env.GOOGLE_CUSTOM_SEARCH_CX || process.env.GOOGLE_CSE_ID;
const params = new URLSearchParams({
  key,
  cx,
  q: 'technology education professional',
  searchType: 'image',
  num: '3',
  safe: 'active',
  imgSize: 'large',
  imgType: 'photo',
  imgColorType: 'color',
});

fetch(`https://www.googleapis.com/customsearch/v1?${params}`)
  .then(async (r) => {
    const body = await r.json();
    console.log('HTTP', r.status);
    if (body.error) {
      console.log('ERROR:', body.error.message);
      console.log('REASON:', body.error.errors?.[0]?.reason);
      process.exit(1);
    }
    const items = body.items || [];
    console.log('OK -', items.length, 'images');
    items.forEach((item, i) => console.log(`  ${i + 1}. ${item.title?.slice(0, 60)}`));
  })
  .catch((e) => {
    console.error('FETCH FAILED:', e.message);
    process.exit(1);
  });
