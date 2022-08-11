declare module 'userhomepath' {
  export function homedir(username: string): Promise<string>;
}
