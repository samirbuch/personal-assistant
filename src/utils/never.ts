// Better error handling for when you want to tell
// TypeScript to shut the fuck up without using the
// non-null assertion operator
export default function never(msg: string): never {
  throw new Error(msg);
}