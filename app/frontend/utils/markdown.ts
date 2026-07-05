import { css } from "~/frontend/kit/css.ts";

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]);

// ---------------------------------------------------------------------------
// Syntax highlighting
// ---------------------------------------------------------------------------

const TS_KEYWORDS = new Set([
    "abstract",
    "any",
    "as",
    "asserts",
    "async",
    "await",
    "bigint",
    "boolean",
    "break",
    "case",
    "catch",
    "class",
    "const",
    "continue",
    "debugger",
    "declare",
    "default",
    "delete",
    "do",
    "else",
    "enum",
    "export",
    "extends",
    "finally",
    "for",
    "from",
    "function",
    "get",
    "if",
    "implements",
    "import",
    "in",
    "infer",
    "instanceof",
    "interface",
    "is",
    "keyof",
    "let",
    "namespace",
    "never",
    "new",
    "number",
    "object",
    "of",
    "override",
    "private",
    "protected",
    "public",
    "readonly",
    "return",
    "satisfies",
    "set",
    "static",
    "string",
    "super",
    "switch",
    "symbol",
    "this",
    "throw",
    "try",
    "type",
    "typeof",
    "unknown",
    "var",
    "void",
    "while",
    "yield",
]);
const TS_LITERALS = new Set(["true", "false", "null", "undefined", "NaN", "Infinity"]);

const span = (cls: string, text: string) => `<span class="tok-${cls}">${esc(text)}</span>`;

function highlightTs(code: string): string {
    const re =
        /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(`(?:\\[\s\S]|[^\\`])*`|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|(\b0[xXoObB][\da-fA-F_]+n?\b|\b\d[\d_]*(?:\.[\d_]+)?(?:[eE][+-]?[\d_]+)?n?\b)|([A-Za-z_$][\w$]*)/g;
    let out = "";
    let last = 0;
    for (let m = re.exec(code); m; m = re.exec(code)) {
        out += esc(code.slice(last, m.index));
        last = re.lastIndex;
        const [full, comment, str, num, ident] = m;
        if (comment) out += span("com", full);
        else if (str) out += span("str", full);
        else if (num) out += span("num", full);
        else if (ident) {
            if (TS_KEYWORDS.has(ident)) out += span("kw", full);
            else if (TS_LITERALS.has(ident)) out += span("lit", full);
            else if (/^[A-Z]/.test(ident)) out += span("type", full);
            else if (/^\s*\(/.test(code.slice(last))) out += span("fn", full);
            else out += esc(full);
        }
    }
    return out + esc(code.slice(last));
}

function highlightJson(code: string): string {
    const re =
        /("(?:\\.|[^"\\])*")(\s*:)|("(?:\\.|[^"\\])*")|(-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|\b(true|false|null)\b|(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/g;
    let out = "";
    let last = 0;
    for (let m = re.exec(code); m; m = re.exec(code)) {
        out += esc(code.slice(last, m.index));
        last = re.lastIndex;
        const [, key, colon, str, num, lit, comment] = m;
        if (key) out += span("key", key) + esc(colon);
        else if (str) out += span("str", str);
        else if (num) out += span("num", num);
        else if (lit) out += span("lit", lit);
        else if (comment) out += span("com", comment);
    }
    return out + esc(code.slice(last));
}

const HIGHLIGHTERS: Record<string, (code: string) => string> = {
    ts: highlightTs,
    tsx: highlightTs,
    typescript: highlightTs,
    js: highlightTs,
    jsx: highlightTs,
    mjs: highlightTs,
    javascript: highlightTs,
    json: highlightJson,
    jsonc: highlightJson,
};

function highlight(code: string, lang: string): string {
    return (HIGHLIGHTERS[lang] ?? esc)(code);
}

// ---------------------------------------------------------------------------
// Inline
// ---------------------------------------------------------------------------

function safeUrl(url: string): string | null {
    const u = url.trim();
    if (/^(javascript|data|vbscript):/i.test(u)) return null;
    return u;
}

function inlineText(raw: string): string {
    let out = esc(raw);
    // backslash escapes first — emit numeric entities so later regexes can't match them
    out = out.replace(/\\([*_`~[\]()#|\\!-])/g, (_, c: string) => `&#${c.charCodeAt(0)};`);
    // images before links
    out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt: string, url: string) => {
        const u = safeUrl(url);
        return u ? `<img src="${esc(u)}" alt="${alt}">` : alt;
    });
    out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text: string, url: string) => {
        const u = safeUrl(url);
        return u ? `<a href="${esc(u)}">${text}</a>` : text;
    });
    out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    out = out.replace(/__([^_]+)__/g, "<strong>$1</strong>");
    out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    out = out.replace(/(^|[^\w])_([^_]+)_(?=[^\w]|$)/g, "$1<em>$2</em>");
    out = out.replace(/~~([^~]+)~~/g, "<del>$1</del>");
    return out;
}

function inline(raw: string): string {
    // split out code spans first so nothing inside them is touched
    return raw
        .split(/(`[^`\n]+`)/)
        .map((part) =>
            part.length > 2 && part.startsWith("`") && part.endsWith("`") ? `<code>${esc(part.slice(1, -1))}</code>` : inlineText(part)
        )
        .join("");
}

// ---------------------------------------------------------------------------
// Block helpers
// ---------------------------------------------------------------------------

const FENCE_OPEN = /^\s*```\s*([^\s`]*)/;
const FENCE_CLOSE = /^\s*```\s*$/;
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const HR = /^ {0,3}([-*_])\s*(?:\1\s*){2,}$/;
const BLOCKQUOTE = /^ {0,3}>\s?(.*)$/;
const LIST_ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const TABLE_SEP_CELL = /^\s*(:?)-+(:?)\s*$/;

function splitRow(line: string): string[] {
    let s = line.trim();
    if (s.startsWith("|")) s = s.slice(1);
    if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
    const cells: string[] = [];
    let cur = "";
    for (let i = 0; i < s.length; i++) {
        if (s[i] === "\\" && s[i + 1] === "|") {
            cur += "|";
            i++;
        } else if (s[i] === "|") {
            cells.push(cur.trim());
            cur = "";
        } else cur += s[i];
    }
    cells.push(cur.trim());
    return cells;
}

function tableAlignments(sepCells: string[]): (string | null)[] | null {
    const aligns: (string | null)[] = [];
    for (const cell of sepCells) {
        const m = cell.match(TABLE_SEP_CELL);
        if (!m) return null;
        const [, l, r] = m;
        aligns.push(l && r ? "center" : r ? "right" : l ? "left" : null);
    }
    return aligns;
}

function isTableStart(line: string | undefined, next: string | undefined): boolean {
    if (!line?.includes("|") || !next?.includes("-")) return false;
    const aligns = tableAlignments(splitRow(next));
    return aligns !== null && aligns.length === splitRow(line).length;
}

function isBlockStart(line: string, next: string | undefined): boolean {
    return FENCE_OPEN.test(line) && line.trim().startsWith("```") ||
        HEADING.test(line) ||
        HR.test(line) ||
        BLOCKQUOTE.test(line) ||
        LIST_ITEM.test(line) ||
        isTableStart(line, next);
}

function listItemHtml(content: string): string {
    const task = content.match(/^\[( |x|X)\]\s+(.*)$/);
    if (task) {
        const checked = task[1] !== " " ? " checked" : "";
        return `<input type="checkbox" disabled${checked}> ${inline(task[2])}`;
    }
    return inline(content);
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

export function renderMarkdown(md: string): string {
    const lines = md.replace(/\r\n?/g, "\n").split("\n");
    let html = "";
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        // blank line — paragraph separator
        if (line.trim() === "") {
            i++;
            continue;
        }

        // fenced code block
        const fence = line.trim().startsWith("```") ? line.match(FENCE_OPEN) : null;
        if (fence) {
            const lang = fence[1].toLowerCase();
            const buf: string[] = [];
            i++;
            while (i < lines.length && !FENCE_CLOSE.test(lines[i])) buf.push(lines[i++]);
            i++; // skip closing fence (or run past end on unterminated block)
            const cls = lang ? ` class="language-${esc(lang)}"` : "";
            html += `<pre><code${cls}>${highlight(buf.join("\n"), lang)}</code></pre>`;
            continue;
        }

        // heading
        const heading = line.match(HEADING);
        if (heading) {
            const level = heading[1].length;
            html += `<h${level}>${inline(heading[2])}</h${level}>`;
            i++;
            continue;
        }

        // horizontal rule
        if (HR.test(line)) {
            html += "<hr>";
            i++;
            continue;
        }

        // blockquote (recursive)
        if (BLOCKQUOTE.test(line)) {
            const buf: string[] = [];
            while (i < lines.length) {
                const m = lines[i].match(BLOCKQUOTE);
                if (!m) break;
                buf.push(m[1]);
                i++;
            }
            html += `<blockquote>${renderMarkdown(buf.join("\n"))}</blockquote>`;
            continue;
        }

        // table
        if (isTableStart(line, lines[i + 1])) {
            const headCells = splitRow(line);
            const aligns = tableAlignments(splitRow(lines[i + 1]))!;
            const style = (col: number) => (aligns[col] ? ` style="text-align:${aligns[col]}"` : "");
            html += "<table><thead><tr>";
            headCells.forEach((cell, c) => html += `<th${style(c)}>${inline(cell)}</th>`);
            html += "</tr></thead><tbody>";
            i += 2;
            while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
                const cells = splitRow(lines[i]);
                html += "<tr>";
                for (let c = 0; c < headCells.length; c++) {
                    html += `<td${style(c)}>${inline(cells[c] ?? "")}</td>`;
                }
                html += "</tr>";
                i++;
            }
            html += "</tbody></table>";
            continue;
        }

        // list (nesting via indentation, 2+ spaces per level)
        if (LIST_ITEM.test(line)) {
            const stack: { indent: number; tag: "ul" | "ol" }[] = [];
            const open = (tag: "ul" | "ol", marker: string, indent: number, content: string) => {
                const n = tag === "ol" ? parseInt(marker) : 1;
                const start = tag === "ol" && n !== 1 ? ` start="${n}"` : "";
                html += `<${tag}${start}><li>${listItemHtml(content)}`;
                stack.push({ indent, tag });
            };
            while (i < lines.length) {
                const m = lines[i].match(LIST_ITEM);
                if (!m) break;
                const [, ws, marker, content] = m;
                const indent = ws.length;
                const tag: "ul" | "ol" = /\d/.test(marker[0]) ? "ol" : "ul";
                while (stack.length && indent < stack[stack.length - 1].indent) {
                    html += `</li></${stack.pop()!.tag}>`;
                }
                const top = stack[stack.length - 1];
                if (!top || indent > top.indent) {
                    open(tag, marker, indent, content);
                } else if (top.tag !== tag) {
                    html += `</li></${stack.pop()!.tag}>`;
                    open(tag, marker, indent, content);
                } else {
                    html += `</li><li>${listItemHtml(content)}`;
                }
                i++;
            }
            while (stack.length) html += `</li></${stack.pop()!.tag}>`;
            continue;
        }

        // paragraph — merge consecutive plain lines, hard-break between them
        const buf: string[] = [];
        while (
            i < lines.length &&
            lines[i].trim() !== "" &&
            !isBlockStart(lines[i], lines[i + 1])
        ) {
            buf.push(lines[i].trim());
            i++;
        }
        html += `<p>${buf.map(inline).join("<br>")}</p>`;
    }

    return html;
}

// ---------------------------------------------------------------------------
// Optional base styles (tok-* classes + tables). Use or ignore.
// ---------------------------------------------------------------------------

export const MarkdownSheet = css`
    pre {
        background: #1e1e2e;
        color: #cdd6f4;
        padding: 0.75em 1em;
        border-radius: 8px;
        overflow-x: auto;
    }
    pre code {
        background: none;
        padding: 0;
    }
    code {
        background: #3132454d;
        padding: 0.1em 0.35em;
        border-radius: 4px;
        font-family: monospace;
    }
    table {
        border-collapse: collapse;
        margin: 0.5em 0;
    }
    th, td {
        border: 1px solid #4a4a5a;
        padding: 0.3em 0.7em;
    }
    blockquote {
        border-left: 3px solid #7aa2f7;
        margin: 0.5em 0;
        padding: 0.1em 1em;
        opacity: 0.85;
    }
    .tok-kw {
        color: #cba6f7;
    }
    .tok-str {
        color: #a6e3a1;
    }
    .tok-num {
        color: #fab387;
    }
    .tok-lit {
        color: #f38ba8;
    }
    .tok-com {
        color: #6c7086;
        font-style: italic;
    }
    .tok-type {
        color: #f9e2af;
    }
    .tok-fn {
        color: #89b4fa;
    }
    .tok-key {
        color: #89dceb;
    }
`;
