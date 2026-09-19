import { execFile, ExecFileOptions } from 'child_process';

/**
 * Safe process execution — NEVER uses a shell, NEVER string-interpolates
 * user input into a command line. Arguments are always passed as an array,
 * which prevents shell/command injection.
 */
export function runCommand(
  bin: string,
  args: string[],
  options: ExecFileOptions = {}
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      bin,
      args,
      { ...options, maxBuffer: 1024 * 1024 * 64, shell: false },
      (error, stdout, stderr) => {
        if (error) {
          const err = new Error(
            `Command failed: ${bin} (${error.message})`
          ) as Error & { stderr?: string };
          err.stderr = stderr?.toString();
          reject(err);
          return;
        }
        resolve({ stdout: stdout.toString(), stderr: stderr.toString() });
      }
    );
  });
}
