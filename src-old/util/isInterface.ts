export default function isInterface<T>(obj: any, key: keyof T): obj is T {
  return key in obj;
}