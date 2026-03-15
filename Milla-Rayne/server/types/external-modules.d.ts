declare module 'express' {
  export interface Request {
    [key: string]: any;
  }

  export interface Response {
    [key: string]: any;
    status(code: number): Response;
    json(body?: any): Response;
    send(body?: any): Response;
    end(body?: any): Response;
    cookie(...args: any[]): Response;
    clearCookie(...args: any[]): Response;
    redirect(...args: any[]): Response;
    setHeader(...args: any[]): void;
  }

  export interface NextFunction {
    (err?: any): void;
  }

  export type RequestHandler = (
    req: Request,
    res: Response,
    next: NextFunction
  ) => any;

  export interface Router {
    use(...handlers: any[]): this;
    get(path: any, ...handlers: RequestHandler[]): this;
    post(path: any, ...handlers: RequestHandler[]): this;
    put(path: any, ...handlers: RequestHandler[]): this;
    patch(path: any, ...handlers: RequestHandler[]): this;
    delete(path: any, ...handlers: RequestHandler[]): this;
  }

  export interface Express extends Router {
    set(...args: any[]): this;
    listen(...args: any[]): any;
  }

  export function Router(): Router;

  interface ExpressFactory {
    (): Express;
    Router: typeof Router;
    json(...args: any[]): RequestHandler;
    urlencoded(...args: any[]): RequestHandler;
    static(...args: any[]): RequestHandler;
  }

  const express: ExpressFactory;
  export default express;
}

declare module 'openai';
declare module 'ioredis';
declare module 'p-retry';
declare module '@tensorflow/tfjs';
declare module 'node-cron';
declare module 'better-sqlite3';
declare module '@pinecone-database/pinecone';
declare module 'chromadb';
declare module 'vite';
declare module 'ws';
declare module 'ytdl-core';
declare module 'youtube-transcript';
declare module 'drizzle-orm';
declare module 'drizzle-orm/pg-core';
declare module 'drizzle-zod';
