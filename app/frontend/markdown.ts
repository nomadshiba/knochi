const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]);

export function renderMarkdown(md: string): string {
    const lines = md.split("\n");
    let html = "";
    let inCode = false;
    let codeLang = "";

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        const fence = line.match(/^```(\w*)$/);
        if (fence) {
            if (inCode) {
                html += `</code></pre>`;
                inCode = false;
                codeLang = "";
            } else {
                codeLang = fence[1] || "";
                html += `<pre><code>`;
                inCode = true;
            }
            continue;
        }

        if (inCode) {
            html += esc(line) + "\n";
            continue;
        }

        const heading = line.match(/^(#{1,4})\s+(.*)$/);
        if (heading) {
            const level = heading[1].length;
            html += `<h${level}>${inline(heading[2])}</h${level}>`;
            continue;
        }

        if (line.trim() === "") {
            html += "<br>";
            continue;
        }

        html += `<p>${inline(line)}</p>`;
    }

    if (inCode) html += `</code></pre>`;
    return html;
}

function inline(text: string): string {
    let out = esc(text);
    out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
    out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    return out;
}