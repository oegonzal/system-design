/**
 * The one way the gateway says what it did: a line of JSON per event, which
 * CloudWatch keeps by function. Modules take a `Log` so a spec reads the
 * lines instead of the console.
 */
export type Log = (message: string, detail?: Readonly<Record<string, unknown>>) => void;

export const consoleLog: Log = (message, detail = {}) => {
  console.log(JSON.stringify({ message, ...detail }));
};
