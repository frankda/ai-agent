declare const process: {
  env: Record<string, string | undefined>;
  stdin: unknown;
  stdout: unknown;
  exit(code?: number): never;
};

declare module "node:readline" {
  interface Interface {
    question(query: string, callback: (answer: string) => void): void;
    close(): void;
  }

  function createInterface(options: {
    input: unknown;
    output: unknown;
  }): Interface;

  const readline: {
    createInterface: typeof createInterface;
  };

  export default readline;
}
