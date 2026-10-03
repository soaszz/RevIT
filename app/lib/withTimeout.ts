export async function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout>;
  const expired = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error("Request timed out.")), milliseconds);
  });
  try {
    return await Promise.race([promise, expired]);
  } finally {
    clearTimeout(timeout!);
  }
}
