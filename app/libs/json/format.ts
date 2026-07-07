/**
 * Formats JSON text with indentation, tolerating truncated/streaming input:
 * unclosed brackets, unterminated strings, dangling commas/colons.
 * Single pass, no parsing — never throws.
 */
export function formatPartialJson(input: string, indent = "\t"): string {
    let out = "";
    let depth = 0;
    let inString = false;
    let escape = false;

    const pad = () => "\n" + indent.repeat(depth);

    for (let i = 0; i < input.length; i++) {
        const c = input[i]!;

        if (inString) {
            out += c;
            if (escape) escape = false;
            else if (c === "\\") escape = true;
            else if (c === '"') inString = false;
            continue;
        }

        if (c === '"') {
            inString = true;
            out += c;
        } else if (c === "{" || c === "[") {
            out += c;
            let j = i + 1;
            while (j < input.length && /\s/.test(input[j]!)) j++;
            const close = c === "{" ? "}" : "]";
            if (input[j] === close) {
                out += close;
                i = j;
            } else {
                depth++;
                out += pad();
            }
        } else if (c === "}" || c === "]") {
            depth = Math.max(0, depth - 1);
            out += pad() + c;
        } else if (c === ",") {
            out += c + pad();
        } else if (c === ":") {
            out += ": ";
        } else if (!/\s/.test(c)) {
            out += c;
        }
    }

    return out;
}
