export default function isAsyncFunction(fn: (...args: unknown[]) => unknown): boolean {
  return fn.constructor.name === "AsyncFunction";
}
