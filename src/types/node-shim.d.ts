declare const process: {
  env: Record<string, string | undefined>;
  stdin: unknown;
  stdout: unknown;
  argv: string[];
  exit(code?: number): never;
};

declare const Buffer: {
  concat(list: Buffer[]): Buffer;
  from(data: ArrayBuffer | SharedArrayBuffer | number[] | string, encoding?: string): Buffer;
};

type Buffer = Uint8Array & {
  toString(encoding?: string): string;
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

declare module "node:child_process" {
  interface ChildProcess {
    stdout: {
      on(event: "data", listener: (chunk: Buffer) => void): void;
    };
    stderr: {
      on(event: "data", listener: (chunk: Buffer) => void): void;
    };
    on(event: "error", listener: (err: Error) => void): void;
    on(event: "close", listener: (code: number | null) => void): void;
  }

  export function spawn(command: string, args: string[]): ChildProcess;
  export function execFile(
    file: string,
    args: string[],
    callback: (error: Error | null, stdout: string, stderr: string) => void,
  ): void;
}

declare module "node:fs" {
  export function readFileSync(path: string): Buffer;
  export function unlinkSync(path: string): void;
}
