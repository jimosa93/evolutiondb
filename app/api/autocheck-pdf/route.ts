import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requireApiAuth } from "@/lib/api-auth";
import { getAutocheckPdfOutputFileName } from "@/lib/autocheckPdfFileName";
import { processAutocheckPdf } from "@/lib/processAutocheckPdf";

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const authError = await requireApiAuth(request);
  if (authError) {
    return authError;
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "PDF file is required" }, { status: 400 });
  }

  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "Only PDF files are supported" }, { status: 400 });
  }

  if (file.size === 0) {
    return NextResponse.json({ error: "The PDF file is empty" }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: "The PDF file exceeds the 25 MB limit" },
      { status: 400 },
    );
  }

  try {
    const inputBytes = new Uint8Array(await file.arrayBuffer());
    const outputBytes = await processAutocheckPdf(inputBytes, file.name, {
      includeModel2020Notice: formData.get("includeModel2020Notice") === "true",
      includeContactNumbers: formData.get("includeContactNumbers") === "true",
    });
    const outputName = getAutocheckPdfOutputFileName(file.name);

    return new NextResponse(Buffer.from(outputBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${outputName}"; filename*=UTF-8''${encodeURIComponent(outputName)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Autocheck PDF processing failed:", error);
    return NextResponse.json(
      { error: "Could not process the PDF. Verify the file and try again." },
      { status: 500 },
    );
  }
}
