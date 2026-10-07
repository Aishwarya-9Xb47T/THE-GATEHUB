async function runMultiBenchmark() {
  const endpoints = [
    { name: '/api/courses?featured=home&limit=8', url: 'https://gatehub-backend-mprr.onrender.com/api/courses?featured=home&limit=8' },
    { name: '/api/courses?catalog=premium', url: 'https://gatehub-backend-mprr.onrender.com/api/courses?catalog=premium' },
    { name: '/api/learning-universes/catalog/landing', url: 'https://gatehub-backend-mprr.onrender.com/api/learning-universes/catalog/landing' },
    { name: '/api/learning-universes', url: 'https://gatehub-backend-mprr.onrender.com/api/learning-universes' },
    { name: '/api/categories', url: 'https://gatehub-backend-mprr.onrender.com/api/categories' },
  ];

  console.log('=== MULTI-RUN LIVE PRODUCTION BENCHMARK ===');
  console.log('Timestamp:', new Date().toISOString());
  
  for (const ep of endpoints) {
    console.log(`\nTesting endpoint: ${ep.name}`);
    const results = [];
    for (let i = 1; i <= 3; i++) {
      const t0 = Date.now();
      try {
        const res = await fetch(ep.url);
        const text = await res.text();
        const dur = Date.now() - t0;
        results.push({ run: i, duration: dur, status: res.status, size: text.length });
        console.log(`  Run ${i}: ${dur}ms | HTTP ${res.status} | ${text.length} bytes`);
      } catch (e) {
        console.log(`  Run ${i}: ERROR ${e.message} (${Date.now() - t0}ms)`);
      }
      // Small pause between runs
      await new Promise(r => setTimeout(r, 200));
    }
  }
}

runMultiBenchmark();
