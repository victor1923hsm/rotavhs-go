// Protótipo publicado (GitHub Pages, autorização P1 de 2026-11-19): só dados fictícios.
// No build do Pages (VITE_PROTOTIPO=1) a escolha de planilha do aparelho fica desligada; dá para testar a
// importação com a planilha FICTÍCIA de test-fixtures/planilhas/11-formato-spx.xlsx (copiada no build).
export const PROTOTIPO = import.meta.env.VITE_PROTOTIPO === '1'
export const PLANILHA_FICTICIA = 'exemplo-spx-ficticia.xlsx'
