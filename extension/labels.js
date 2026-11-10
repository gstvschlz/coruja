// Every button label coruja matches on, lowercase. Used only as a fallback after data-test.
// EN labels for skip/check were seen live on 2026-11-10. Everything marked "unverified"
// has not been seen on a live page yet (account UI is EN, Latin course).
globalThis.CorujaLabels = {
  skip: ['skip', 'pular'],                                          // pular: unverified
  continue: ['continue', 'continuar'],                              // unverified
  // unverified: speak challenges never appeared in the Latin course
  cantSpeak: ["can't speak now", 'não posso falar agora', 'não posso falar'],
  dismiss: ['no thanks', 'not now', 'maybe later', 'agora não', 'não, obrigado', 'talvez depois'], // unverified
  close: ['close', 'fechar'],                                       // aria-label, unverified
  start: ['start', 'começar', 'iniciar'],                           // unverified
  legendary: ['legendary', 'lendário', 'lendária'],                 // EN seen on path nodes
  outOfHearts: ['out of hearts', 'no hearts left', 'sem vidas', 'acabaram suas vidas'], // unverified
  // A button whose text contains any of these is never clicked.
  forbidden: ['gem', 'gema', 'buy', 'comprar', 'purchase', 'trial', 'teste grátis', 'subscribe',
    'assinar', 'share', 'compartilhar', 'invite', 'convidar', 'refill', 'recarregar'],
};
