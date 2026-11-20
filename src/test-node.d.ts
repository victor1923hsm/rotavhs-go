// Copiado do RotaVHS (só leitura, G3): D:\Projetos Claude\RotaVHS\frontend\src\\test-node.d.ts (versão de 2026-11-19).
/**
 * Tipos mínimos de `node:fs` usados SÓ pelos testes (Vitest roda no Node).
 * Evita instalar @types/node (não aprovado). Código do app não deve importar `node:*`.
 */
declare module 'node:fs' {
  export function readFileSync(path: string | URL): Uint8Array
  /** 4.11: validação local das planilhas reais (samples/real/), só nos testes. */
  export function existsSync(path: string | URL): boolean
  export function readdirSync(path: string | URL): string[]
}
