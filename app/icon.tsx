import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

const frogData = await readFile(join(process.cwd(), "public", "revit-rounded.png"), "base64");
const frogSource = `data:image/png;base64,${frogData}`;

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ position: "relative", display: "flex", width: "100%", height: "100%", overflow: "hidden", borderRadius: "8px" }}>
        {/* Next's ImageResponse renderer requires a standard img element. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={frogSource}
          alt="RevIT Icon"
          width="32"
          height="32"
          style={{ width: "32px", height: "32px", objectFit: "cover" }}
        />
      </div>
    ),
    size,
  );
}
