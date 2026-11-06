import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { osm, inlineSources } from "@versatiles/style";

const base = (process.env.MAP_TILE_PUBLIC_BASE_URL || process.argv[2] || "http://127.0.0.1:8088").replace(/\/+$/, "");
const output = join(process.cwd(), "public", "local-map-styles");
await mkdir(output, { recursive: true });
for (const region of ["tw", "jp", "kr"]) {
  const style = await inlineSources(osm({
    theme: "muted",
    projection: "mercator",
    text: { language: "local" },
    urls: { base, osm: `${base}/tiles/${region}/tiles.json` },
  }));
  const source = style.sources["versatiles-shortbread"];
  if (!source || !Array.isArray(source.tiles) || !source.tiles.some((url) => url.includes(`/tiles/${region}/`))) {
    throw new Error(`Invalid ${region} tile source`);
  }
  const file = join(output, `${region}.json`);
  await writeFile(`${file}.tmp`, JSON.stringify(style));
  await rename(`${file}.tmp`, file);
  console.log(`Generated ${file}`);
}
