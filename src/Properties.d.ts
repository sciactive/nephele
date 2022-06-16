export interface Properties {
  get(name: string): Promise<string>;
  set(name: string, value: string): Promise<void>;

  list(): Promise<string[]>;
  listLive(): Promise<string[]>;
  listDead(): Promise<string[]>;
}
