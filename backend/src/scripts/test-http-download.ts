import axios from "axios";
import fs from "fs";
import path from "path";

async function main() {
  const email = process.env.TEST_STUDENT_EMAIL;
  const password = process.env.TEST_STUDENT_PASSWORD;
  if (!email || !password) {
    console.error("Set TEST_STUDENT_EMAIL and TEST_STUDENT_PASSWORD (no hardcoded credentials).");
    return;
  }

  console.log("=== LOGGING IN ===");
  let token = "";
  try {
    const loginRes = await axios.post("http://localhost:5000/api/auth/login", {
      email,
      password
    });
    token = loginRes.data.token;
    console.log("Login successful. Token acquired.");
  } catch (err: any) {
    console.error("Login failed:", err.response?.data || err.message);
    return;
  }

  // Find a universe ID
  const universeId = "cmqw3fvt60001h3z029o8km05";
  const url = `http://localhost:5000/api/learning-universes/${universeId}/download-complete`;
  
  console.log(`=== FETCHING DOWNLOAD ROUTE: ${url} ===`);
  try {
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${token}`
      },
      responseType: "stream"
    });

    console.log("Response Status:", response.status);
    console.log("Response Headers:", response.headers);

    const destPath = path.join(process.cwd(), "test-http-download.zip");
    const writer = fs.createWriteStream(destPath);
    response.data.pipe(writer);

    await new Promise<void>((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });

    console.log(`Download finished. Zip size: ${fs.statSync(destPath).size} bytes`);
  } catch (err: any) {
    if (err.response) {
      console.error("Request failed with status:", err.response.status);
      // Read response body if available
      try {
        const body = err.response.data;
        console.error("Error body:", body);
      } catch {}
    } else {
      console.error("Request failed:", err.message);
    }
  }
}

main().catch(console.error);
