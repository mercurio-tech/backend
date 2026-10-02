import type { Response } from "express";

export function send<T>(res: Response, val: T, statusCode?: number) {
    if (statusCode) res.status(statusCode);
    res.send({ error: false, result: val });
}

export function sendError(res: Response, error: string, statusCode?: number) {
    if (statusCode) res.status(statusCode);
    res.send({ error: true, result: error });
}