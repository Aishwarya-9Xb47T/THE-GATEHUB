async function measureRoutes() {
  const routes = [
    { name: 'Homepage (/)', url: 'https://thegatehub.com/' },
    { name: 'Courses (/courses)', url: 'https://thegatehub.com/courses' },
    { name: 'Course details (/courses/course-1)', url: 'https://thegatehub.com/courses/demo-course' },
    { name: 'Login (/login)', url: 'https://thegatehub.com/login' },
    { name: 'Student Dashboard (/student/dashboard)', url: 'https://thegatehub.com/student/dashboard' },
    { name: 'My Courses (/student/my-courses)', url: 'https://thegatehub.com/student/my-courses' },
    { name: 'Browse (/student/browse)', url: 'https://thegatehub.com/student/browse' },
    { name: 'Profile (/student/profile)', url: 'https://thegatehub.com/student/profile' },
    { name: 'Settings (/student/settings)', url: 'https://thegatehub.com/student/settings' },
    { name: 'Admin (/admin)', url: 'https://thegatehub.com/admin' },
  ];

  console.log('=== ROUTE LEVEL MEASUREMENTS (thegatehub.com) ===\n');

  for (const r of routes) {
    const t0 = Date.now();
    try {
      const res = await fetch(r.url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
      const html = await res.text();
      const dur = Date.now() - t0;
      console.log(`Route: ${r.name}`);
      console.log(`  Initial HTTP Shell: ${dur}ms | Status ${res.status} | Size ${html.length} bytes`);
      console.log(`  Content-Type: ${res.headers.get('content-type')}`);
      console.log(`  Server: ${res.headers.get('server') || 'Cloudflare/Vercel/Render'}`);
      console.log('');
    } catch (e) {
      console.log(`Route: ${r.name} ERROR: ${e.message} (${Date.now() - t0}ms)\n`);
    }
  }
}

measureRoutes();
