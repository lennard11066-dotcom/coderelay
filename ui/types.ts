export type Model = {
  id: string;
  name: string;
  context?: number;
  images?: boolean;
  efforts?: string[];
};
export type Connection = {
  id: string;
  name: string;
  type: string;
  base: string;
  group: string;
  models: Model[];
  verified: string[];
  hasKey: boolean;
};
export type Choice = {
  id: string;
  connection: string;
  effort: string;
  inputPrice: number | null;
  outputPrice: number | null;
};
export type Config = {
  chain?: Choice[];
  budget?: number | null;
  terminal?: boolean;
};
export type Task = {
  id: string;
  root: string;
  prompt: string;
  plan: string;
  status: string;
  model: string;
};
export type Action = {
  id: string;
  step: string;
  kind: string;
  status: string;
  result: string;
  args: { path: string; text?: string };
  pid: number | null;
  running: boolean;
};
export type State = {
  brand: string;
  root: string;
  projects: { root: string }[];
  config: Config;
  connections: Connection[];
  tasks: Task[];
  task?: Task;
  actions: Action[];
  events: { id: number; kind: string; body: string; at: number }[];
  usage: {
    input: number | null;
    output: number | null;
    cost: number | null;
    unknown: number;
  };
  example: string;
};
export type Entry = { name: string; path: string; folder: boolean };
export type RelayEvent = { type: string; id?: string; text?: string };
declare global {
  interface Window {
    relay: {
      call: (action: string, args?: unknown) => Promise<any>;
      listen: (fn: (event: RelayEvent) => void) => () => void;
    };
  }
}
export const api = async <T = void>(op: string, args?: unknown): Promise<T> =>
  window.relay.call(op, args);
export const short = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() || p;
export const unavailable = "Nicht verfügbar";
const actionLabels: Record<string, string> = {
  read: "Lesen",
  list: "Ordnerinhalt",
  write: "Schreiben",
  edit: "Bearbeiten",
  run: "Befehl",
  plan: "Plan",
  preview: "Vorschau",
  finish: "Ergebnis",
  pending: "Vorgemerkt",
  running: "Läuft",
  done: "Abgeschlossen",
  failed: "Fehlgeschlagen",
  uncertain: "Prüfung erforderlich",
  reviewed: "Geprüft",
  restored: "Wiederhergestellt",
};
export const actionLabel = (value: string) => actionLabels[value] ?? value;
export const errorText = (err: unknown) =>
  String(err instanceof Error ? err.message : err)
    .replace(/^.*?Error invoking remote method [^:]+:\s*/, "")
    .replace(/^Error:\s*/, "");
