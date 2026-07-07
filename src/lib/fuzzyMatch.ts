export interface ClientLike {
  id: string;
  name: string;
  name_kana: string | null;
}

function toHiragana(str: string): string {
  return str.replace(/[ァ-ヶ]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );
}

function normalize(str: string): string {
  return toHiragana(str.normalize("NFKC"))
    .replace(/[\s　]+/g, "")
    .replace(/株式会社|有限会社|合同会社/g, "")
    .toLowerCase();
}

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0)
  );
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;
  const dist = levenshtein(na, nb);
  return 1 - dist / Math.max(na.length, nb.length);
}

export interface ClientMatch {
  client: ClientLike;
  score: number;
}

export function findClientMatches(
  query: string,
  clients: ClientLike[],
  threshold = 0.4
): ClientMatch[] {
  if (!query.trim()) return [];

  return clients
    .map((client) => ({
      client,
      score: Math.max(
        similarity(query, client.name),
        client.name_kana ? similarity(query, client.name_kana) : 0
      ),
    }))
    .filter((m) => m.score >= threshold)
    .sort((a, b) => b.score - a.score);
}
