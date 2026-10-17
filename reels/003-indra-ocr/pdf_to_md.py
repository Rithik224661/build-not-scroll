# pdf_to_md.py - turn a folder of PDFs/scans into Markdown + one AI-ready knowledge.md (Indra OCR, runs offline)
import sys, pathlib, indra_ocr
src = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "pdfs"); out = src / "markdown"; out.mkdir(exist_ok=True)
conv, kb = indra_ocr.load(), []
for f in sorted(p for p in src.iterdir() if p.suffix.lower() in {".pdf", ".png", ".jpg", ".jpeg"}):
    md = "\n\n".join(page.markdown for _, page in conv.convert(str(f)))
    (out / f"{f.stem}.md").write_text(md); kb.append(f"<!-- source: {f.name} -->\n{md}")
    print(f"✓ {f.name} -> markdown/{f.stem}.md")
(out / "knowledge.md").write_text("\n\n---\n\n".join(kb))
print(f"\n{len(kb)} files -> {out / 'knowledge.md'}  (paste it into any LLM or index it for RAG)")
