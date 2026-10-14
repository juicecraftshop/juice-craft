export const allowedOrigins=new Set(['https://juicecraftshop.github.io','https://juicecraft.vercel.app']);
export function allowedOrigin(origin:string|null){return origin===null||allowedOrigins.has(origin)}
