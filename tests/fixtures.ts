// Loads docs/samples fixtures (tests only; the UI never ships fixture data).
import path from "node:path";

const dir = path.join(import.meta.dir, "..", "docs", "samples");
export const sample = async <T = any>(name: string): Promise<T> => Bun.file(path.join(dir, name)).json();
export const sampleText = (name: string) => Bun.file(path.join(dir, name)).text();
