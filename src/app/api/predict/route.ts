import { NextRequest, NextResponse } from "next/server";

const HF_API = "https://mariamaymann-dental-cavity-project.hf.space/predict";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Forward to HuggingFace Space
    const upstream = new FormData();
    upstream.append("file", file);

    const hfResponse = await fetch(HF_API, {
      method: "POST",
      body: upstream,
      // No CORS issue here — this runs server-side
    });

    if (!hfResponse.ok) {
      const text = await hfResponse.text();
      return NextResponse.json(
        { error: `Upstream error ${hfResponse.status}: ${text}` },
        { status: 502 }
      );
    }

    const data = await hfResponse.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("[/api/predict]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// Allow large image uploads (up to 4.5 MB)
export const maxDuration = 60;
