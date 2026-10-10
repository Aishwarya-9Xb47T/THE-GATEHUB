// Measure real HTTP latencies for GateHub endpoints

const endpoints = [
  { name: "Homepage HTML (thegatehub.com)", url: "https://thegatehub.com/" },
  { name: "Featured Courses API", url: "https://gatehub-backend-mprr.onrender.com/api/courses?featured=home&limit=8" },
  { name: "Landing Universes API", url: "https://gatehub-backend-mprr.onrender.com/api/learning-universes/catalog/landing" },
  { name: "Categories API", url: "https://gatehub-backend-mprr.onrender.com/api/categories" },
  { name: "Browse Premium Courses", url: "https://gatehub-backend-mprr.onrender.com/api/courses?catalog=premium" },
  { name: "Resources Courses API", url: "https://gatehub-backend-mprr.onrender.com/api/resources/courses" },
  { name: "Course Details (Cyber Security)", url: "https://gatehub-backend-mprr.onrender.com/api/courses/cmuyyrclo006ab4kywr3pypkl" },
];

async function measure(url) {
  const t0 = performance.now();
  const res = await fetch(url, { headers: { "User-Agent": "GateHub-PerfTest/1.0" } });
  const text = await res.text();
  const t1 = performance.now();
  return {
    ms: Math.round(t1 - t0),
    status: res.status,
    bytes: text.length,
    cacheControl: res.headers.get("cache-control") || "none",
  };
}

async function run() {
  console.log("Measuring real production endpoint latencies...\n");
  const results = [];

  for (const ep of endpoints) {
    // 1st request (cold/initial)
    const cold = await measure(ep.url);
    // 2nd request (warm)
    const warm = await measure(ep.url);
    // 3rd request (warm repeat)
    const repeat = await measure(ep.url);

    results.push({
      Endpoint: ep.name,
      Status: cold.status,
      SizeKB: (cold.bytes / 1024).toFixed(1) + " KB",
      ColdMs: cold.ms,
      WarmMs: warm.ms,
      RepeatMs: repeat.ms,
      CacheControl: cold.cacheControl,
    });
  }

  console.table(results);
}

run().catch(console.error);
