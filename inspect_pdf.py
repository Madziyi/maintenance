"""
inspect_pdf.py

Drag a work order PDF onto this script (or run: python inspect_pdf.py "path/to/file.pdf")
Shows the raw extracted text for each page, with line numbers.
Helps identify what text appears first and in what order.
"""

import sys
import os

def extract_with_pdfminer(pdf_path):
    from pdfminer.high_level import extract_pages
    from pdfminer.layout import LTTextBox, LTTextLine, LTAnon, LTChar

    print(f"\n{'='*60}")
    print(f"FILE: {os.path.basename(pdf_path)}")
    print(f"{'='*60}\n")

    for page_num, page_layout in enumerate(extract_pages(pdf_path), start=1):
        print(f"\n{'─'*60}")
        print(f"PAGE {page_num}  (y increases upward — items printed top→bottom)")
        print(f"{'─'*60}")

        # Collect all text boxes with their y position (top of box)
        items = []
        for element in page_layout:
            if isinstance(element, LTTextBox):
                text = element.get_text().strip()
                if text:
                    # y1 is the top edge of the box
                    items.append((element.y1, element.x0, text))

        # Sort by y descending (top of page first), then x ascending (left to right)
        items.sort(key=lambda t: (-t[0], t[1]))

        for i, (y, x, text) in enumerate(items, start=1):
            # Show position so you can see the layout
            lines = text.split('\n')
            prefix = f"[{i:02d}] y={y:6.1f} x={x:6.1f} │ "
            print(prefix + lines[0])
            for line in lines[1:]:
                if line.strip():
                    print(" " * len(prefix) + line)

    print(f"\n{'='*60}")
    print("Done.")


def extract_with_pypdf(pdf_path):
    """Fallback if pdfminer is not installed."""
    import pypdf

    print(f"\n{'='*60}")
    print(f"FILE: {os.path.basename(pdf_path)}")
    print(f"(using pypdf — install pdfminer.six for richer position data)")
    print(f"{'='*60}\n")

    reader = pypdf.PdfReader(pdf_path)
    for page_num, page in enumerate(reader.pages, start=1):
        print(f"\n{'─'*60}")
        print(f"PAGE {page_num}")
        print(f"{'─'*60}")
        text = page.extract_text() or "(no text extracted)"
        for i, line in enumerate(text.split('\n'), start=1):
            print(f"[{i:03d}] {line}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python inspect_pdf.py <path_to_pdf>")
        print("  or drag the PDF onto this script in VS Code terminal")
        sys.exit(1)

    pdf_path = sys.argv[1]

    if not os.path.exists(pdf_path):
        print(f"File not found: {pdf_path}")
        sys.exit(1)

    try:
        extract_with_pdfminer(pdf_path)
    except ImportError:
        print("pdfminer.six not found, trying pypdf...")
        try:
            extract_with_pypdf(pdf_path)
        except ImportError:
            print("\nNeither pdfminer.six nor pypdf is installed.")
            print("Run one of:")
            print("  pip install pdfminer.six")
            print("  pip install pypdf")
            sys.exit(1)
