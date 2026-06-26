🗺️ Roadmap MVP: BLOKKO
Fase 1: O Esqueleto Técnico (Os Cubos)
O objetivo inicial é garantir que a mecânica de movimentação e a rede multiplayer funcionem perfeitamente, mesmo com visuais simples
.
Configuração Inicial: Instalar um boilerplate pronto de Socket.io com Three.js ou React Three Fiber
.
Prototipagem Simples: Criar um plano para o chão e um cubo para representar o personagem do jogador
.
Movimentação Direcional: Implementar o controle por teclado (W, A, S, D) com a técnica de suavização (lerp) para garantir fluidez
.
Sincronização Multiplayer: Configurar o servidor Node.js para transmitir as posições dos jogadores em um "Tick Rate" de 10 a 15 vezes por segundo para manter a rede leve
.
Fase 2: O Cenário e Identidade (Blender)
Nesta etapa, o ambiente ganha a estética "Low-Poly" e a otimização necessária para web
.
Modelagem da Quadra: No Blender, criar a malha única para ruas e calçadas na escala real (1 unidade = 1 metro)
.
Fachadas Comerciais: Modelar fachadas de 3 a 4 comércios (ex: cafeteria, farmácia) em estilo simplificado
.
Iluminação Otimizada: Realizar o baking de sombras e oclusão ambiental diretamente nas texturas, eliminando a necessidade de luzes dinâmicas pesadas no navegador
.
Exportação: Gerar um arquivo .glb único e compactado com Draco Compression
.
Fase 3: Integração e Portais Comerciais
Aqui, une-se a arte ao código e cria-se a principal funcionalidade comercial do projeto
.
Importação de Assets: Substituir o cenário básico pelo modelo .glb exportado do Blender
.
Gatilhos de Interação: Adicionar caixas de colisão invisíveis nas portas de cada comércio
.
Abertura de Sites (Iframes): Programar o sistema para que, ao colidir com a porta, uma janela HTML (iframe) se abra por cima do cenário com o site real da loja
.
Interface de Fechamento: Adicionar um botão "X" para fechar o site e devolver o controle de navegação ao usuário
.
Fase 4: Ajustes Mobile, Gestão de Salas e Deploy
Preparação final para o lançamento e acessibilidade multiplataforma
.
Controle Touch: Implementar a biblioteca NippleJS para criar o analógico virtual para usuários de celular
.
Lógica de Lotação: Configurar o servidor para limitar o número de usuários por sala (ex: 10 pessoas) e criar novas salas automaticamente se necessário
.
Hospedagem: Fazer o deploy do front-end em serviços como Vercel ou Netlify e o back-end (Node.js) em plataformas como Render ou Railway
.
O critério de sucesso deste MVP será alcançado quando amigos puderem entrar simultaneamente na mesma quadra, visualizarem uns aos outros e acessarem os sites dos lojistas parceiros diretamente do ambiente 3D