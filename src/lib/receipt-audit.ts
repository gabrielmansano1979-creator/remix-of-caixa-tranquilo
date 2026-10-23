export type ReceiptAuditSuggestion = {
  status: "pending" | "mismatch";
  amountCents: number | null;
  note: string;
};

function normalizeAmount(value: string): number | null {
  const cleaned = value.replace(/\s/g, "");
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const cents = Math.round(amount * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Evaluates only a strong amount mismatch automatically. It never approves a receipt. */
export function evaluateReceiptText(text: string, expectedAmountCents: number): ReceiptAuditSuggestion {
  const matches = [...text.matchAll(/(?:R\$\s*)?((?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}|(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2})/gi)];
  const amounts = [...new Set(matches.map((match) => normalizeAmount(match[1])).filter((value): value is number => value !== null))];

  if (amounts.includes(expectedAmountCents)) {
    return {
      status: "pending",
      amountCents: expectedAmountCents,
      note: "Valor encontrado no comprovante compatível com o lançamento. Confira data, pagador/beneficiário e autenticidade antes de aprovar.",
    };
  }

  if (amounts.length === 1) {
    return {
      status: "mismatch",
      amountCents: amounts[0],
      note: "O valor legível no comprovante diverge do lançamento. Confira o documento e corrija os dados antes de aprovar.",
    };
  }

  return {
    status: "pending",
    amountCents: null,
    note: "Não foi possível identificar um valor único com segurança. Confira manualmente o comprovante; nenhum dado foi presumido.",
  };
}

/** Extracts searchable text from PDFs and runs Portuguese OCR when the PDF is scanned. */
export async function extractReceiptText(file: File): Promise<string> {
  if (file.type.startsWith("image/")) {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("por");
    try {
      const result = await worker.recognize(file);
      return result.data.text ?? "";
    } finally {
      await worker.terminate();
    }
  }

  if (file.type !== "application/pdf") throw new Error("Formato de comprovante não suportado.");
  const pdfjs = await import("pdfjs-dist");
  const { createWorker } = await import("tesseract.js");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  if (pdf.numPages > 30) throw new Error("O PDF excede o limite de 30 páginas para conferência automática.");

  const pages: string[] = [];
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      let pageText = content.items
        .filter((item): item is typeof item & { str: string } => "str" in item)
        .map((item) => item.str.trim())
        .filter(Boolean)
        .join(" ");
      if (pageText.replace(/\s/g, "").length < 20) {
        worker ??= await createWorker("por");
        const viewport = page.getViewport({ scale: 1.8 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Não foi possível preparar o PDF para OCR.");
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        const recognized = await worker.recognize(canvas);
        pageText = recognized.data.text ?? "";
        canvas.width = 0;
        canvas.height = 0;
      }
      pages.push(pageText);
    }
  } finally {
    if (worker) await worker.terminate();
  }
  return pages.join("\n");
}
