/** استخراج نص المستند في المتصفح قبل إرساله إلى محرك التدقيق */
export async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".txt") || name.endsWith(".md") || file.type.startsWith("text/")) {
    return file.text();
  }

  if (name.endsWith(".pdf")) {
    const pdfjs = await import("pdfjs-dist");
    const workerModule = (await import(
      "pdfjs-dist/build/pdf.worker.min.mjs?url"
    )) as { default: string };
    pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;

    const data = new Uint8Array(await file.arrayBuffer());
    const doc = await pdfjs.getDocument({ data }).promise;
    const maxPages = Math.min(doc.numPages, 60);
    const pages: string[] = [];
    for (let i = 1; i <= maxPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      pages.push(
        content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ")
          .replace(/\s+/g, " ")
          .trim(),
      );
    }
    return pages.join("\n\n");
  }

  if (name.endsWith(".docx")) {
    const mammoth = (await import("mammoth")) as unknown as {
      extractRawText: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>;
    };
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return result.value;
  }

  if (name.endsWith(".doc")) {
    throw new Error("صيغة .doc القديمة غير مدعومة — احفظ الملف بصيغة .docx أو PDF ثم أعد الرفع.");
  }

  throw new Error("صيغة غير مدعومة. المسموح: PDF أو DOCX أو TXT.");
}
