import { resolveCanonicalUniverseId } from "../src/services/learnerScopeService.js";

const id = "cmsq2oect00e3jn2afshiac8r";
const resolved = await resolveCanonicalUniverseId(id);
console.log("Course ID:", id);
console.log("Resolved LU:", resolved);
console.log("Expected:", "cmsq2od7a0001jn2aoy29aabc");
console.log(resolved === "cmsq2od7a0001jn2aoy29aabc" ? "PASS" : "FAIL");
process.exit(resolved === "cmsq2od7a0001jn2aoy29aabc" ? 0 : 1);
