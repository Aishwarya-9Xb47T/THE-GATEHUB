import fs from "fs";
import path from "path";

const dir = path.join(process.cwd(), "test-extracted");
console.log("All files in test-extracted:");
const scanDir = (d: string) => {
    const entries = fs.readdirSync(d, { withFileTypes: true });
    for (const e of entries) {
        const fullPath = path.join(d, e.name);
        if (e.isDirectory()) {
            scanDir(fullPath);
        } else {
            console.log("-", fullPath);
        }
    }
}
scanDir(dir);
