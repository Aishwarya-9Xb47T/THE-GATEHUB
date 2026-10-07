async function benchmarkAll() {
  const endpoints = [
    { name: 'Health check', url: 'https://gatehub-backend-mprr.onrender.com/api/health' },
    { name: 'Landing featured courses', url: 'https://gatehub-backend-mprr.onrender.com/api/courses?featured=home&limit=8' },
    { name: 'Landing learning universes', url: 'https://gatehub-backend-mprr.onrender.com/api/learning-universes/catalog/landing' },
    { name: 'Browse courses catalog', url: 'https://gatehub-backend-mprr.onrender.com/api/courses?catalog=premium' },
    { name: 'Learning universes catalog', url: 'https://gatehub-backend-mprr.onrender.com/api/learning-universes' },
    { name: 'Categories list', url: 'https://gatehub-backend-mprr.onrender.com/api/categories' },
    { name: 'Landing featured LU', url: 'https://gatehub-backend-mprr.onrender.com/api/learning-universes/catalog/featured' },
  ];

  console.log('=== BENCHMARKING LIVE ENDPOINTS ===');
  for (const ep of endpoints) {
    const t0 = Date.now();
    try {
      const res = await fetch(ep.url);
      const text = await res.text();
      const dur = Date.now() - t0;
      console.log(`${ep.name}: ${dur}ms | HTTP ${res.status} | ${text.length} bytes`);
    } catch (e) {
      console.log(`${ep.name}: ERROR ${e.message} (${Date.now() - t0}ms)`);
    }
  }
}
benchmarkAll();
