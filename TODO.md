# 🗺️ Roadmap MVP: BLOKKO

## Fase 1: O Esqueleto Técnico (Os Cubos)
- [x] **[F1.1]** Configuração Inicial: Instalar boilerplate Socket.io + Three.js
- [x] **[F1.2]** Prototipagem Simples: Criar plano de chão e cubo para representar o jogador
- [x] **[F1.3]** Movimentação Direcional: Implementar teclado (W, A, S, D) com suavização (lerp)
- [x] **[F1.4]** Sincronização Multiplayer: Servidor Node.js transmite posições em tick rate de 15 tps

## Fase 2: O Cenário e Identidade (Modelagem Procedural)
- [x] **[F2.1]** Modelagem da Quadra: Ruas, calçadas, meio-fio e cruzamento (1 unidade = 1 metro)
- [x] **[F2.2]** Fachadas Comerciais: Café, Farmácia, Padaria e Barbearia em low-poly com detalhes (vitrines, toldos, letreiros, postes, árvores)
- [x] **[F2.3]** Iluminação Otimizada: Baking de luz direcional + ambiente nos vértices dos modelos
- [x] **[F2.4]** Exportação: Arquivo .glb único com Draco Compression (116 KB)

## Fase 3: Integração e Portais Comerciais
- [x] **[F3.1]** Importação de Assets: Substituir cenário básico pelo .glb exportado do Blender
- [ ] **[F3.2]** Gatilhos de Interação: Adicionar caixas de colisão invisíveis nas portas dos comércios
- [ ] **[F3.3]** Abertura de Sites (Iframes): Ao colidir com a porta, abrir iframe com site real da loja
- [ ] **[F3.4]** Interface de Fechamento: Botão 'X' para fechar o iframe e devolver o controle ao jogador

## Fase 4: Ajustes Mobile, Gestão de Salas e Deploy
- [ ] **[F4.1]** Controle Touch: Implementar NippleJS para analógico virtual em dispositivos móveis
- [ ] **[F4.2]** Lógica de Lotação: Limitar 10 usuários por sala e criar novas salas automaticamente
- [ ] **[F4.3]** Hospedagem Front-end: Deploy em Vercel ou Netlify
- [ ] **[F4.4]** Hospedagem Back-end: Deploy do servidor Node.js em Render ou Railway

## Critério de Sucesso
- [ ] **[MVP]** Amigos entrarem simultaneamente na mesma quadra, visualizarem uns aos outros e acessarem sites dos lojistas parceiros via ambiente 3D
