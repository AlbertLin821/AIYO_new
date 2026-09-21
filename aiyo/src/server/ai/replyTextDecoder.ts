/** Streams only a JSON object's top-level replyText value. Final JSON still needs validation. */
export function createReplyTextDecoder() {
  let state: "root" | "key" | "colon" | "value" | "skip" | "separator" | "reply" | "done" = "root";
  let key = "";
  let token = "";
  let inString = false;
  let escaped = false;
  let depth = 0;
  let unicode: string | null = null;
  let pendingHighSurrogate = "";
  let output = "";

  const fail = () => { state = "done"; };
  const emit = (value: string) => {
    for (const character of value.split("")) {
      const code = character.charCodeAt(0);
      if (pendingHighSurrogate) {
        if (code < 0xdc00 || code > 0xdfff) { fail(); return; }
        output += pendingHighSurrogate + character;
        pendingHighSurrogate = "";
      } else if (code >= 0xd800 && code <= 0xdbff) {
        pendingHighSurrogate = character;
      } else if (code >= 0xdc00 && code <= 0xdfff) {
        fail(); return;
      } else {
        output += character;
      }
    }
  };

  function consume(character: string): void {
    if (state === "done") return;
    if (state === "reply") {
      if (unicode !== null) {
        if (!/[0-9a-f]/i.test(character)) { fail(); return; }
        unicode += character;
        if (unicode.length === 4) {
          emit(String.fromCharCode(Number.parseInt(unicode, 16)));
          unicode = null;
        }
      } else if (escaped) {
        escaped = false;
        if (character === "u") { unicode = ""; return; }
        const escapes: Record<string, string> = {
          '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t",
        };
        if (!(character in escapes)) { fail(); return; }
        emit(escapes[character]);
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        state = "done";
      } else if (character.charCodeAt(0) < 32) {
        fail();
      } else {
        emit(character);
      }
      return;
    }
    if (state === "key") {
      if (!token) {
        if (/\s/.test(character)) return;
        if (character !== '"') { fail(); return; }
        token = character;
        return;
      }
      token += character;
      if (escaped) { escaped = false; return; }
      if (character === "\\") { escaped = true; return; }
      if (character === '"') {
        try { key = JSON.parse(token) as string; } catch { fail(); return; }
        token = "";
        state = "colon";
      }
      return;
    }
    if (state === "skip") {
      if (!inString && depth === 0 && (character === "," || character === "}" || /\s/.test(character))) {
        try { JSON.parse(token); } catch { fail(); return; }
        token = "";
        state = "separator";
        consume(character);
        return;
      }
      token += character;
      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') inString = false;
      } else if (character === '"') {
        inString = true;
      } else if (character === "{" || character === "[") {
        depth += 1;
      } else if (character === "}" || character === "]") {
        depth -= 1;
      }
      if (depth < 0) fail();
      return;
    }
    if (/\s/.test(character)) return;
    if (state === "root") {
      if (character === "{") state = "key";
      else fail();
    } else if (state === "colon") {
      if (character === ":") state = "value";
      else fail();
    } else if (state === "value") {
      if (key === "replyText") {
        if (character === '"') state = "reply";
        else fail();
      } else {
        state = "skip";
        depth = 0;
        inString = false;
        consume(character);
      }
    } else if (state === "separator") {
      if (character === ",") state = "key";
      else fail();
    }
  }

  return {
    push(chunk: string): string {
      output = "";
      for (const character of chunk.split("")) consume(character);
      return output;
    },
  };
}
