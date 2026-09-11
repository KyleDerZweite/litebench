// ELO ratings for blind pairwise human votes. Stateless so ratings replay from votes.
export type VoteWinner = "a" | "b" | "tie";

export interface VoteRecord {
  suite: string;
  taskId: string;
  a: string;
  b: string;
  winner: VoteWinner;
  ts: string;
}

export interface Standing {
  config: string;
  rating: number;
  votes: number;
  wins: number;
  losses: number;
  ties: number;
}

export const BASE_RATING = 1000;
export const K_FACTOR = 32;

export function expectedScore(a: number, b: number) {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}

export function updatedRatings(a: number, b: number, scoreA: number, k = K_FACTOR): [number, number] {
  const expectedA = expectedScore(a, b);
  return [a + k * (scoreA - expectedA), b + k * ((1 - scoreA) - (1 - expectedA))];
}

export function computeStandings(configs: string[], votes: VoteRecord[], k = K_FACTOR): Standing[] {
  const table = new Map<string, Standing>(
    configs.map((config) => [config, { config, rating: BASE_RATING, votes: 0, wins: 0, losses: 0, ties: 0 }]),
  );
  for (const vote of votes) {
    const a = table.get(vote.a);
    const b = table.get(vote.b);
    if (!a || !b || vote.a === vote.b) continue;
    const scoreA = vote.winner === "a" ? 1 : vote.winner === "b" ? 0 : 0.5;
    const [nextA, nextB] = updatedRatings(a.rating, b.rating, scoreA, k);
    a.rating = nextA;
    b.rating = nextB;
    a.votes += 1;
    b.votes += 1;
    if (vote.winner === "tie") {
      a.ties += 1;
      b.ties += 1;
    } else {
      const winner = vote.winner === "a" ? a : b;
      const loser = vote.winner === "a" ? b : a;
      winner.wins += 1;
      loser.losses += 1;
    }
  }
  return [...table.values()].sort((x, y) => y.rating - x.rating || x.config.localeCompare(y.config));
}
