import 'server-only';
import mammoth from 'mammoth';
import TurndownService from 'turndown';

/**
 * Convert a Word (.docx) document into markdown for the AI resource guide.
 *
 * The guide is stored as plain text in `ai_resource_guide.content` — the same
 * column the `.md` / `.txt` upload path writes. So a `.docx` is reduced to
 * markdown server-side: mammoth turns the document XML into semantic HTML
 * (headings, lists, bold), and turndown converts that HTML to markdown. The
 * result is stored exactly like an uploaded `.md` file.
 *
 * Embedded images are dropped — the guide is text steering, so pictures in the
 * Word doc add nothing and would otherwise become large data-URI noise.
 *
 * If the structured HTML path yields nothing usable (e.g. an oddly authored
 * doc), the caller still gets mammoth's raw text extraction as a fallback so a
 * valid document never silently produces an empty guide.
 */
export async function docxToMarkdown(buffer: Buffer): Promise<string> {
  // mammoth → semantic HTML. Drop images by mapping every image to nothing
  // (an empty attribute set), so no data-URI <img> reaches the markdown.
  const { value: html } = await mammoth.convertToHtml(
    { buffer },
    { convertImage: mammoth.images.imgElement(async () => ({ src: '' })) },
  );

  const turndown = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
  });
  // Belt-and-braces: strip any <img> the converter still emitted.
  turndown.remove('img');

  const markdown = turndown.turndown(html ?? '').trim();
  if (markdown.length > 0) return markdown;

  // Fallback: raw text extraction when structure conversion produced nothing.
  const { value: rawText } = await mammoth.extractRawText({ buffer });
  return rawText.trim();
}
