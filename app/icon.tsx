import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

const frogData = await readFile(join(process.cwd(), "public", "revit-frog.png"), "base64");
const frogSource = `data:image/png;base64,${frogData}`;

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ position: "relative", display: "flex", width: "100%", height: "100%", overflow: "hidden" }}>
        {/* Next's ImageResponse renderer requires a standard img element. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={frogSource}
          alt=""
          width="64"
          height="64"
          style={{ position: "absolute", top: "-19px", left: "-16px", width: "64px", height: "64px" }}
        />
      </div>
    ),
    size,
  );
}
