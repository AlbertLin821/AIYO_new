const IDENTITY_LABEL_MAX_LENGTH = 40;

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function cleanIdentityLabel(value: string): string | null {
  const cleaned = value
    .trim()
    .replace(/^[「『"'\s]+|[」』"'\s]+$/gu, "")
    .replace(/[。.!！]+$/u, "")
    .trim();

  if (!cleaned || cleaned.length > IDENTITY_LABEL_MAX_LENGTH) {
    return null;
  }
  if (/[\n\r]/u.test(cleaned)) {
    return null;
  }
  if (/^(?:誰|什麼|甚麼|哪位|unknown|none|null)$/iu.test(cleaned)) {
    return null;
  }
  if (/(?:想去|要去|去玩|規劃|安排|行程|旅行|旅遊|自由行|天|日|夜)/u.test(cleaned)) {
    return null;
  }

  return cleaned;
}

export function extractUserIdentityLabel(message: string): string | null {
  const text = normalizeText(message);
  if (!text) {
    return null;
  }

  const match =
    text.match(/^(?:我是|我叫|叫我|請叫我|你可以叫我|我的(?:名字|暱稱|昵称)(?:是|叫)?|暱稱(?:是|叫)?)\s*([\p{Letter}\p{Number}_\-\s]{1,40})[。.!！]?$/iu) ||
    text.match(/^(?:my name is|call me|i am|i'm)\s+([\p{Letter}\p{Number}_\-\s]{1,40})[。.!！]?$/iu);

  return match?.[1] ? cleanIdentityLabel(match[1]) : null;
}

export function isUserIdentityStatement(message: string): boolean {
  return Boolean(extractUserIdentityLabel(message));
}

export function formatUserIdentityMemory(label: string): string {
  return `使用者稱呼：${label}`;
}
