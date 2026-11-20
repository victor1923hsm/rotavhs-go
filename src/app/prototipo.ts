// Protótipo publicado (GitHub Pages, autorização P1 de 2026-11-19).
// Desde 2026-11-20 (autorização do usuário: importação real) a planilha do aparelho também pode ser escolhida
// no protótipo: é lida e guardada só no aparelho, nada vai para o GitHub nem para outro servidor. A planilha
// FICTÍCIA (test-fixtures/planilhas/11-formato-spx.xlsx, copiada no build) continua para testes.
export const PROTOTIPO = import.meta.env.VITE_PROTOTIPO === '1'
export const PLANILHA_FICTICIA = 'exemplo-spx-ficticia.xlsx'
/** Nome com que a planilha fictícia é carregada (para os rótulos "fictícia" × "sua planilha"). */
export const ARQUIVO_FICTICIO = 'planilha-ficticia-spx.xlsx'
export const ehFicticia = (rota: { fonte: string; arquivo: string }) => rota.fonte === 'exemplo' || rota.arquivo === ARQUIVO_FICTICIO
