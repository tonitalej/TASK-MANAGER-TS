// Teaches TypeScript about the two properties our middleware adds to every request.
declare global {
  namespace Express {
    interface Request {
      /** Set by authenticate() from the verified JWT ("sub" claim). */
      user?: { id: string };
      /** Set by validate(): the cleaned input, per source. Read it with validated(). */
      valid?: Partial<Record<'body' | 'query' | 'params', unknown>>;
    }
  }
}

export {};
